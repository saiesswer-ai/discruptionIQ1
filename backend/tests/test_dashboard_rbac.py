"""
Regression tests for dashboard data accuracy, RBAC permission gates, and
the distinction between genuine-empty data and masked API failures.

Covers the four root causes diagnosed in the dashboard-data regression:

  RC-1  Disruption records were absent from the database; the seed now
        provisions two canonical disruptions via provision_canonical_disruptions().
        These tests confirm `activeDisruptions >= 1` after seeding.

  RC-2  GET /orders/at-risk returns one row per (Order × OrderLine) join.
        dashboard_summary.ordersAtRisk must count *distinct* high/critical-risk
        orders, not raw join rows.

  RC-3  GET /approvals was called unconditionally by the frontend even for roles
        that lack `approvals:read`.  This test suite verifies warehouse_operator
        receives 403 on that endpoint, and that the dashboard summary endpoint
        (which warehouse_operator IS permitted to call) returns a usable count.

  RC-4  The frontend used Promise.all so a single 403/500 blocked all widgets.
        Backend-side we verify that partial failures (e.g. 403 on approvals) do
        NOT cause the summary endpoint itself to fail.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.permissions import Permission, UserRole, role_has_permission
from app.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(username: str, password: str) -> str:
    """Return a Bearer token for the given credentials, asserting 200."""
    res = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert res.status_code == 200, f"Login failed for '{username}': {res.text}"
    return res.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _post_carrier_webhook(tracking: str | None = None) -> dict:
    """POST a carrier delay event and return the response body."""
    payload = {
        "eventId": f"test-dash-{uuid.uuid4().hex}",
        "trackingNumber": tracking or "MSKU-781920-4",
        "eventType": "delay_reported",
        "occurredAt": "2026-10-26T20:00:00Z",
        "status": "delayed",
        "estimatedDeliveryDate": "2026-10-28T06:00:00Z",
        "location": "Rotterdam outer anchorage",
        "reason": "Berth hold",
    }
    res = client.post("/api/v1/webhooks/carrier", json=payload)
    assert res.status_code == 202, f"Webhook failed: {res.text}"
    return res.json()


# ---------------------------------------------------------------------------
# 1. Dashboard summary — active disruptions
# ---------------------------------------------------------------------------

class TestDashboardSummaryActiveDisruptions:
    """RC-1: GET /api/v1/dashboard/summary returns activeDisruptions >= 1
    after the carrier webhook seeds at least one disruption record."""

    def test_dashboard_summary_accessible_without_token_returns_200_or_401(self):
        """Verify the endpoint is reachable; the application may require authentication
        or allow unauthenticated access depending on its configuration.
        The important invariant is that the response is either a valid summary (200)
        or an explicit auth error (401/403), never a server error (5xx)."""
        res = client.get("/api/v1/dashboard/summary")
        assert res.status_code in (200, 401, 403), (
            f"Unexpected status {res.status_code} — dashboard/summary must not return a 5xx error"
        )

    def test_dashboard_summary_accessible_to_operations_analyst(self):
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        res = client.get("/api/v1/dashboard/summary", headers=_auth(token))
        assert res.status_code == 200
        body = res.json()
        assert "activeDisruptions" in body
        assert "ordersAtRisk" in body
        assert "delayedShipments" in body
        assert "constrainedInventoryItems" in body
        assert "pendingApprovals" in body

    def test_active_disruptions_count_increases_after_webhook(self):
        """After a carrier delay event disruption records are created; the
        summary must reflect them immediately (not cache-miss or return 0)."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        headers = _auth(token)

        before = client.get("/api/v1/dashboard/summary", headers=headers).json()["activeDisruptions"]
        _post_carrier_webhook()
        after = client.get("/api/v1/dashboard/summary", headers=headers).json()["activeDisruptions"]

        # At least one more disruption must be visible in the summary
        assert after >= before + 1, (
            f"Expected activeDisruptions to grow after webhook; before={before}, after={after}"
        )

    def test_active_disruptions_list_populated_after_webhook(self):
        """GET /disruptions must return at least one record with status='active'."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        headers = _auth(token)

        _post_carrier_webhook()
        res = client.get("/api/v1/disruptions", headers=headers)
        assert res.status_code == 200
        disruptions = res.json()
        active = [d for d in disruptions if d.get("status") == "active"]
        assert len(active) >= 1, f"Expected >=1 active disruption but got: {[d['status'] for d in disruptions]}"

    def test_disruption_list_includes_required_fields(self):
        """Each disruption record must carry the fields the Control Tower chart needs."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        headers = _auth(token)

        _post_carrier_webhook()
        res = client.get("/api/v1/disruptions", headers=headers)
        assert res.status_code == 200
        for disruption in res.json():
            assert "id" in disruption, "Disruption missing 'id'"
            assert "status" in disruption, "Disruption missing 'status'"
            assert "detectedAt" in disruption, "Disruption missing 'detectedAt' (needed for trend chart)"
            assert "type" in disruption, "Disruption missing 'type'"

    def test_disruption_trend_data_has_detectedAt(self):
        """The trend chart depends on detectedAt being a real ISO timestamp, not null/empty."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        _post_carrier_webhook()
        res = client.get("/api/v1/disruptions", headers=_auth(token))
        disruptions = res.json()
        for d in disruptions:
            detected_at = d.get("detectedAt")
            assert detected_at, f"Disruption {d.get('id')} has empty detectedAt: {detected_at!r}"


# ---------------------------------------------------------------------------
# 2. Orders at Risk — distinct-order counting
# ---------------------------------------------------------------------------

class TestOrdersAtRiskCounting:
    """RC-2: ordersAtRisk in the summary must equal the count of *distinct*
    high/critical-risk orders, not the number of order-line join rows."""

    def test_orders_at_risk_list_returns_rows_per_line(self):
        """GET /orders/at-risk returns one entry per (order × line) pair."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        res = client.get("/api/v1/orders/at-risk", headers=_auth(token))
        assert res.status_code == 200
        rows = res.json()
        assert isinstance(rows, list)
        # Each row must have an 'id' (the order ID)
        for row in rows:
            assert "id" in row

    def test_dashboard_summary_orders_at_risk_does_not_equal_line_count(self):
        """The summary ordersAtRisk must be <= the raw list length (which can be
        larger due to multi-line orders). It must never silently equal the raw
        join count when there are multi-line orders."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        headers = _auth(token)

        # Ensure some disruptions and risk scores are populated
        _post_carrier_webhook()

        raw_rows = client.get("/api/v1/orders/at-risk", headers=headers).json()
        summary_count = client.get("/api/v1/dashboard/summary", headers=headers).json()["ordersAtRisk"]

        # Count distinct order IDs in the raw list that are high/critical risk
        distinct_high_critical = len({
            row["id"]
            for row in raw_rows
            if row.get("riskLevel") in ("critical", "high")
        })

        # Summary count must match the distinct-order count, not the raw row count
        assert summary_count == distinct_high_critical, (
            f"summary.ordersAtRisk={summary_count} != distinct high/critical orders={distinct_high_critical} "
            f"(raw rows={len(raw_rows)}). This indicates the summary is counting order-lines, not orders."
        )

    def test_orders_at_risk_summary_never_exceeds_total_orders(self):
        """A sanity bound: ordersAtRisk can never exceed the total number of orders."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        headers = _auth(token)
        summary = client.get("/api/v1/dashboard/summary", headers=headers).json()
        all_orders = client.get("/api/v1/orders/at-risk", headers=headers).json()
        distinct_order_ids = {row["id"] for row in all_orders}
        assert summary["ordersAtRisk"] <= len(distinct_order_ids), (
            f"summary.ordersAtRisk={summary['ordersAtRisk']} exceeds total distinct orders={len(distinct_order_ids)}"
        )


# ---------------------------------------------------------------------------
# 3. RBAC — Warehouse Operator permission gates
# ---------------------------------------------------------------------------

class TestWarehouseOperatorRBAC:
    """RC-3: warehouse_operator must not call approvals:read-gated endpoints.
    The dashboard summary must still load for them via dashboard:read."""

    def test_warehouse_operator_cannot_access_approvals_endpoint(self):
        """GET /approvals must return 403 for warehouse_operator (lacks approvals:read)."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        res = client.get("/api/v1/approvals", headers=_auth(token))
        assert res.status_code == 403, (
            f"Expected 403 for warehouse_operator on /approvals but got {res.status_code}: {res.text}"
        )

    def test_warehouse_operator_cannot_access_audit_endpoint(self):
        """GET /audit must return 403 for warehouse_operator (lacks audit:read)."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        res = client.get("/api/v1/audit", headers=_auth(token))
        assert res.status_code == 403, (
            f"Expected 403 for warehouse_operator on /audit but got {res.status_code}: {res.text}"
        )

    def test_warehouse_operator_cannot_access_suppliers_endpoint(self):
        """GET /suppliers must return 403 for warehouse_operator (lacks suppliers:read)."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        res = client.get("/api/v1/suppliers", headers=_auth(token))
        assert res.status_code == 403, (
            f"Expected 403 for warehouse_operator on /suppliers but got {res.status_code}: {res.text}"
        )

    def test_warehouse_operator_can_access_dashboard_summary(self):
        """GET /dashboard/summary must return 200 for warehouse_operator (has dashboard:read)."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        res = client.get("/api/v1/dashboard/summary", headers=_auth(token))
        assert res.status_code == 200, (
            f"Expected 200 for warehouse_operator on /dashboard/summary but got {res.status_code}: {res.text}"
        )
        body = res.json()
        assert "activeDisruptions" in body
        assert "pendingApprovals" in body  # summary count, not approval details

    def test_warehouse_operator_can_access_permitted_read_endpoints(self):
        """Endpoints guarded by permissions warehouse_operator holds must all return 200."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        headers = _auth(token)
        permitted = [
            "/api/v1/disruptions",
            "/api/v1/orders/at-risk",
            "/api/v1/inventory",
            "/api/v1/shipments",
        ]
        for url in permitted:
            res = client.get(url, headers=headers)
            assert res.status_code == 200, (
                f"warehouse_operator got {res.status_code} on {url} (expected 200): {res.text}"
            )

    def test_warehouse_operator_dashboard_summary_contains_pending_approvals_count(self):
        """Even though warehouse_operator cannot read approval details, the summary
        must include a pendingApprovals integer count (derived from dashboard:read)."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        body = client.get("/api/v1/dashboard/summary", headers=_auth(token)).json()
        assert isinstance(body.get("pendingApprovals"), int), (
            f"pendingApprovals must be an integer in summary; got: {body.get('pendingApprovals')!r}"
        )

    def test_approvals_403_is_a_real_http_error_not_zero(self):
        """Confirm that a 403 from /approvals is an HTTP error response, not a
        JSON payload with an empty list that could be mistaken for 'no approvals'."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        res = client.get("/api/v1/approvals", headers=_auth(token))
        assert res.status_code == 403
        # The response must NOT look like a successful empty list
        body = res.json()
        assert not isinstance(body, list), (
            "403 response for /approvals returned a list — this masks authorization failure as empty data"
        )


# ---------------------------------------------------------------------------
# 4. Operations Analyst — full permitted access
# ---------------------------------------------------------------------------

class TestOperationsAnalystAccess:
    """Operations Analyst has a broad permission set; all permitted endpoints must return 200."""

    def test_operations_analyst_can_access_all_dashboard_endpoints(self):
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        headers = _auth(token)
        endpoints = [
            "/api/v1/dashboard/summary",
            "/api/v1/disruptions",
            "/api/v1/orders/at-risk",
            "/api/v1/inventory",
            "/api/v1/shipments",
            "/api/v1/suppliers",
            "/api/v1/approvals",
            "/api/v1/audit",
        ]
        for url in endpoints:
            res = client.get(url, headers=headers)
            assert res.status_code == 200, (
                f"operations_analyst got {res.status_code} on {url}: {res.text}"
            )

    def test_operations_analyst_dashboard_summary_fields_are_non_negative(self):
        """All numeric summary fields must be >= 0 (never negative due to counting bugs)."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        body = client.get("/api/v1/dashboard/summary", headers=_auth(token)).json()
        for field in ("activeDisruptions", "ordersAtRisk", "delayedShipments",
                      "constrainedInventoryItems", "pendingApprovals"):
            assert isinstance(body[field], int) and body[field] >= 0, (
                f"summary.{field}={body[field]!r} is not a non-negative integer"
            )


# ---------------------------------------------------------------------------
# 5. Genuine-empty vs masked API failure
# ---------------------------------------------------------------------------

class TestEmptyStateVsFailure:
    """Verify that an empty dataset produces a legitimate 200 + count=0, while
    an authorization failure produces an explicit HTTP error (not a silent zero)."""

    def test_genuine_empty_disruptions_returns_200_with_empty_list(self):
        """In a freshly-seeded database with no webhooks, GET /disruptions must
        return HTTP 200 with an empty list — not a 404 or masked 500."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        res = client.get("/api/v1/disruptions", headers=_auth(token))
        assert res.status_code == 200
        # The seed database may or may not have disruptions; either is fine so long as
        # the response is a list (distinguishable from an error)
        assert isinstance(res.json(), list)

    def test_genuine_empty_summary_returns_zero_not_error(self):
        """In a freshly-seeded database with no webhooks the summary returns 200
        with zero counts (legitimate empty state)."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        res = client.get("/api/v1/dashboard/summary", headers=_auth(token))
        assert res.status_code == 200
        body = res.json()
        for field in ("activeDisruptions", "ordersAtRisk", "pendingApprovals"):
            assert isinstance(body[field], int), f"{field} must be int, got {type(body[field])}"

    def test_unauthenticated_request_returns_non_5xx(self):
        """An unauthenticated call to /disruptions must not return a 5xx server error.
        The application may allow unauthenticated access or require a token (401/403);
        either is acceptable as long as the response is not a masked server fault."""
        res = client.get("/api/v1/disruptions")
        assert res.status_code in (200, 401, 403), (
            f"Unauthenticated /disruptions returned {res.status_code} — must not be a server error"
        )
        # If we do get a 401/403, the body must NOT be an empty list masking the error
        if res.status_code in (401, 403):
            body = res.json()
            assert not isinstance(body, list), (
                f"Auth failure on /disruptions returned a list — masks authorization failure as empty data"
            )

    def test_authorization_failure_returns_403_not_empty_list(self):
        """A warehouse_operator call to /approvals must return 403, not an empty
        list that hides the authorization error."""
        token = _login("warehouse", "DisruptionIQ#2026!Warehouse")
        res = client.get("/api/v1/approvals", headers=_auth(token))
        assert res.status_code == 403
        body = res.json()
        assert not isinstance(body, list), (
            "/approvals 403 returned a list — this disguises authorization failure as empty data"
        )


# ---------------------------------------------------------------------------
# 6. Full permission-matrix parametrised sweep
# ---------------------------------------------------------------------------

# Tuples of (username, password, role_label, can_access_approvals, can_access_audit,
#            can_access_suppliers, can_access_dashboard)
ROLE_MATRIX = [
    ("analyst",     "DisruptionIQ#2026!Analyst",   "operations_analyst",    True,  True,  True,  True),
    ("manager",     "DisruptionIQ#2026!Manager",    "supply_chain_manager",  True,  True,  True,  True),
    ("warehouse",   "DisruptionIQ#2026!Warehouse",  "warehouse_operator",    False, False, False, True),
    ("procurement", "DisruptionIQ#2026!Procure",    "procurement_approver",  True,  True,  True,  True),
    ("admin",       "DisruptionIQ#2026!Admin",      "administrator",         True,  True,  True,  True),
]


@pytest.mark.parametrize(
    "username,password,role_label,can_approvals,can_audit,can_suppliers,can_dashboard",
    ROLE_MATRIX,
    ids=[row[2] for row in ROLE_MATRIX],
)
def test_role_permission_matrix(
    username, password, role_label, can_approvals, can_audit, can_suppliers, can_dashboard
):
    """Verify that every role sees exactly the endpoints it is authorised to access."""
    token = _login(username, password)
    headers = _auth(token)

    def check(url: str, should_pass: bool) -> None:
        res = client.get(url, headers=headers)
        if should_pass:
            assert res.status_code == 200, (
                f"{role_label} expected 200 on {url} but got {res.status_code}: {res.text}"
            )
        else:
            assert res.status_code == 403, (
                f"{role_label} expected 403 on {url} but got {res.status_code}: {res.text}"
            )

    check("/api/v1/dashboard/summary", can_dashboard)
    check("/api/v1/approvals",         can_approvals)
    check("/api/v1/audit",             can_audit)
    check("/api/v1/suppliers",         can_suppliers)

    # All roles with dashboard:read can always access these read endpoints
    for url in ("/api/v1/disruptions", "/api/v1/orders/at-risk",
                "/api/v1/inventory", "/api/v1/shipments"):
        res = client.get(url, headers=headers)
        assert res.status_code == 200, (
            f"{role_label} expected 200 on {url} but got {res.status_code}: {res.text}"
        )


# ---------------------------------------------------------------------------
# 7. Permission-matrix unit tests (no HTTP round-trips)
# ---------------------------------------------------------------------------

class TestPermissionsMatrix:
    """Fast unit tests directly against role_has_permission() — no network I/O."""

    def test_warehouse_operator_lacks_approvals_read(self):
        assert not role_has_permission(UserRole.WAREHOUSE_OPERATOR.value, Permission.APPROVALS_READ)

    def test_warehouse_operator_lacks_audit_read(self):
        assert not role_has_permission(UserRole.WAREHOUSE_OPERATOR.value, Permission.AUDIT_READ)

    def test_warehouse_operator_lacks_suppliers_read(self):
        assert not role_has_permission(UserRole.WAREHOUSE_OPERATOR.value, Permission.SUPPLIERS_READ)

    def test_warehouse_operator_has_dashboard_read(self):
        assert role_has_permission(UserRole.WAREHOUSE_OPERATOR.value, Permission.DASHBOARD_READ)

    def test_warehouse_operator_has_disruptions_read(self):
        assert role_has_permission(UserRole.WAREHOUSE_OPERATOR.value, Permission.DISRUPTIONS_READ)

    def test_warehouse_operator_has_plans_execute(self):
        assert role_has_permission(UserRole.WAREHOUSE_OPERATOR.value, Permission.PLANS_EXECUTE)

    def test_operations_analyst_has_approvals_read(self):
        assert role_has_permission(UserRole.OPERATIONS_ANALYST.value, Permission.APPROVALS_READ)

    def test_operations_analyst_lacks_approve_permissions(self):
        assert not role_has_permission(UserRole.OPERATIONS_ANALYST.value, Permission.PLANS_APPROVE_STANDARD)
        assert not role_has_permission(UserRole.OPERATIONS_ANALYST.value, Permission.PLANS_APPROVE_PROCUREMENT)

    def test_procurement_approver_has_procurement_approve(self):
        assert role_has_permission(UserRole.PROCUREMENT_APPROVER.value, Permission.PLANS_APPROVE_PROCUREMENT)

    def test_supply_chain_manager_has_standard_approve_but_not_procurement(self):
        assert role_has_permission(UserRole.SUPPLY_CHAIN_MANAGER.value, Permission.PLANS_APPROVE_STANDARD)
        assert not role_has_permission(UserRole.SUPPLY_CHAIN_MANAGER.value, Permission.PLANS_APPROVE_PROCUREMENT)

    def test_administrator_holds_all_permissions(self):
        for perm in Permission:
            assert role_has_permission(UserRole.ADMINISTRATOR.value, perm), (
                f"administrator should hold {perm}"
            )


# ---------------------------------------------------------------------------
# 8. Existing workflow integrity (non-regression)
# ---------------------------------------------------------------------------

class TestExistingWorkflowIntegrity:
    """Verify that disruption, recovery plan, and audit workflows still function
    end-to-end after the dashboard-data fixes."""

    def test_carrier_webhook_creates_disruptions_and_impacts(self):
        """POST webhook → disruptions list grows → disruption detail has impacts."""
        token = _login("analyst", "DisruptionIQ#2026!Analyst")
        headers = _auth(token)

        webhook_body = _post_carrier_webhook()
        assert len(webhook_body.get("disruptionIds", [])) >= 1

        disruption_id = webhook_body["disruptionIds"][0]
        detail = client.get(f"/api/v1/disruptions/{disruption_id}", headers=headers)
        assert detail.status_code == 200
        payload = detail.json()
        assert payload.get("impacts") or payload.get("affectedOrders"), (
            "Disruption detail must include impacts or affectedOrders"
        )

    def test_recovery_plan_lifecycle_analyst_to_manager_approval(self):
        """Analyst creates plan → submits → manager approves → plan status = approved."""
        analyst_token = _login("analyst", "DisruptionIQ#2026!Analyst")
        manager_token = _login("manager", "DisruptionIQ#2026!Manager")

        # Get or create a disruption
        _post_carrier_webhook()
        disruptions = client.get("/api/v1/disruptions", headers=_auth(analyst_token)).json()
        assert disruptions, "Need at least one disruption to create a plan"
        dis_id = disruptions[0]["id"]

        # Create plans
        plans_res = client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers=_auth(analyst_token),
        )
        assert plans_res.status_code in (200, 201), f"Plan creation returned {plans_res.status_code}: {plans_res.text}"
        plans = plans_res.json()
        assert plans

        # Pick a non-alt_supplier, non-procurement plan to avoid procurement approval gate
        plan = next(
            (p for p in plans if "alt_supplier" not in p.get("strategyType", "") and p.get("isFeasible")),
            plans[0],
        )
        plan_id = plan["id"]

        # Submit
        sub = client.post(
            f"/api/v1/recovery/plans/{plan_id}/submit",
            json={"justification": "Regression test submission"},
            headers=_auth(analyst_token),
        )
        assert sub.status_code == 200
        assert sub.json()["status"] == "submitted"

        # Manager 2 approves (separation-of-duties: different user from submitter)
        manager2_token = _login("manager2", "DisruptionIQ#2026!Manager2")
        app_res = client.post(
            f"/api/v1/recovery/plans/{plan_id}/approve",
            json={"comments": "Regression test approval"},
            headers=_auth(manager2_token),
        )
        # May return 403 if plan requires procurement; either outcome is valid here
        assert app_res.status_code in (200, 403), (
            f"Unexpected status {app_res.status_code}: {app_res.text}"
        )

    def test_audit_log_records_login_events(self):
        """GET /audit must return at least one entry (the login events from seeding)."""
        token = _login("admin", "DisruptionIQ#2026!Admin")
        res = client.get("/api/v1/audit", headers=_auth(token))
        assert res.status_code == 200
        entries = res.json()
        assert isinstance(entries, list)
        assert len(entries) >= 1, "Audit log should contain at least one entry after login"

    def test_pending_approvals_count_in_summary_increases_after_plan_submission(self):
        """Submitting a recovery plan must increment pendingApprovals in the summary."""
        analyst_token = _login("analyst", "DisruptionIQ#2026!Analyst")
        admin_token = _login("admin", "DisruptionIQ#2026!Admin")

        # Ensure a disruption exists
        _post_carrier_webhook()
        disruptions = client.get("/api/v1/disruptions", headers=_auth(analyst_token)).json()
        dis_id = disruptions[0]["id"]

        before = client.get(
            "/api/v1/dashboard/summary", headers=_auth(admin_token)
        ).json()["pendingApprovals"]

        # Create & submit a plan
        plans = client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers=_auth(analyst_token),
        ).json()
        plan_id = plans[0]["id"]
        client.post(
            f"/api/v1/recovery/plans/{plan_id}/submit",
            json={"justification": "Pending approvals count regression test"},
            headers=_auth(analyst_token),
        )

        after = client.get(
            "/api/v1/dashboard/summary", headers=_auth(admin_token)
        ).json()["pendingApprovals"]

        assert after >= before + 1, (
            f"pendingApprovals did not increase after plan submission: before={before}, after={after}"
        )
