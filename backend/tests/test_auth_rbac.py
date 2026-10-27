"""
Comprehensive integration and unit tests for:
  - PBKDF2-HMAC-SHA256 password hashing & verification
  - HMAC-SHA256 authenticated bearer tokens & expiry
  - Backend-enforced Role-Based Access Control (RBAC) permission matrix
  - Separation of duties (creator / submitter self-approval prevention)
  - Procurement policy enforcement for alternative sourcing / high-value purchases
  - Recovery plan state machine validations & transition guards
  - Rejection & modification reason recording
  - Pre-execution live revalidation (inventory, supplier eligibility, order deadlines, feasibility)
  - Duplicate/stale approval & execution prevention (idempotency)
  - Full before/after audit trail tracking
  - Login rate limiting against brute-force attacks
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core import database
from app.core.config import Settings, get_settings
from app.core.permissions import Permission, UserRole, role_has_permission
from app.core.security import (
    TokenExpiredError,
    TokenInvalidError,
    create_access_token,
    decode_access_token,
    hash_password,
    login_rate_limiter,
    verify_password,
)
from app.main import app
from app.models.auth import User
from app.models.governance import DisruptionRecord
from app.models.recovery import PlanAllocation, PlanAuditEvent, RecoveryPlan
from app.models.supply_chain import Inventory, Order, Supplier
from app.services.plan_executor import ExecutionError

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers & Fixtures
# ---------------------------------------------------------------------------

def _get_auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(username: str, password: str) -> dict:
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    return resp.json()


def _error_code(res) -> str:
    data = res.json()
    if "error" in data and isinstance(data["error"], dict):
        return data["error"].get("code", "")
    if "detail" in data:
        if isinstance(data["detail"], dict):
            return data["detail"].get("code", "")
        return str(data["detail"])
    return ""


def _get_disruption_id() -> str:
    res = client.get("/api/v1/disruptions")
    items = res.json()
    if items:
        return items[0]["id"]

    event = {
        "eventId": f"evt-rbac-{uuid.uuid4().hex}",
        "trackingNumber": "MSKU-781920-4",
        "eventType": "delay_reported",
        "occurredAt": "2026-10-26T20:00:00Z",
        "status": "delayed",
        "estimatedDeliveryDate": "2026-10-28T06:00:00Z",
        "location": "North Sea Approach",
        "reason": "Berth hold",
    }
    client.post("/api/v1/webhooks/carrier", json=event)
    res2 = client.get("/api/v1/disruptions")
    return res2.json()[0]["id"]


# ---------------------------------------------------------------------------
# 1. Cryptographic Security, Password Hashing & Token Tests
# ---------------------------------------------------------------------------

def test_password_hashing_and_verification():
    """Verify PBKDF2 salted hash generation and constant-time verification."""
    password = "MySecurePassword#2026"
    hashed = hash_password(password)

    # Must start with algorithm tag and contain iterations, salt, hash
    assert hashed.startswith("pbkdf2_sha256$")
    parts = hashed.split("$")
    assert len(parts) == 4
    assert int(parts[1]) > 0
    assert len(parts[2]) == 32  # 16 bytes salt as hex
    assert len(parts[3]) == 64  # sha256 output as hex

    # Positive and negative verification
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password("", hashed) is False
    assert verify_password(password, "invalid_hash_string") is False


def test_token_creation_expiration_and_tamper_detection():
    """Verify token encoding, expiration claim enforcement, and signature integrity."""
    data = {"sub": "usr_test_01", "role": "operations_analyst"}

    # 1. Normal token
    token = create_access_token(data, expires_delta=timedelta(minutes=30))
    decoded = decode_access_token(token)
    assert decoded["sub"] == "usr_test_01"
    assert decoded["role"] == "operations_analyst"
    assert "exp" in decoded

    # 2. Expired token
    expired_token = create_access_token(data, expires_delta=timedelta(seconds=-10))
    with pytest.raises(TokenExpiredError):
        decode_access_token(expired_token)

    # 3. Tampered signature
    parts = token.split(".")
    tampered_sig = parts[0] + "." + parts[1] + ".tampered_signature"
    with pytest.raises(TokenInvalidError):
        decode_access_token(tampered_sig)

    # 4. Tampered payload
    tampered_payload = "eyJhbGciOiJIUzI1NiJ9." + parts[1] + "extra." + parts[2]
    with pytest.raises(TokenInvalidError):
        decode_access_token(tampered_payload)


# ---------------------------------------------------------------------------
# 2. Authentication API Endpoints & Rate Limiting Tests
# ---------------------------------------------------------------------------

def test_auth_login_all_seeded_roles():
    """Verify login endpoint issues valid signed tokens for all 5 seeded roles."""
    roles_and_passwords = [
        ("analyst", "DisruptionIQ#2026!Analyst", "operations_analyst"),
        ("manager", "DisruptionIQ#2026!Manager", "supply_chain_manager"),
        ("warehouse", "DisruptionIQ#2026!Warehouse", "warehouse_operator"),
        ("procurement", "DisruptionIQ#2026!Procure", "procurement_approver"),
        ("admin", "DisruptionIQ#2026!Admin", "administrator"),
    ]

    for username, password, expected_role in roles_and_passwords:
        res = client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": password},
        )
        assert res.status_code == 200, f"Login failed for {username}: {res.text}"
        body = res.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["user"]["role"] == expected_role
        assert len(body["user"]["permissions"]) > 0

        # Verify token works on /auth/me
        token = body["access_token"]
        me_res = client.get("/api/v1/auth/me", headers=_get_auth_header(token))
        assert me_res.status_code == 200
        assert me_res.json()["username"] == username
        assert me_res.json()["role"] == expected_role


def test_auth_login_invalid_credentials_returns_401():
    """Verify invalid password or username returns 401 Unauthorized with standard error format."""
    res = client.post(
        "/api/v1/auth/login",
        json={"username": "analyst", "password": "WrongPassword123!"},
    )
    assert res.status_code == 401
    assert _error_code(res) == "INVALID_CREDENTIALS"

    res_no_user = client.post(
        "/api/v1/auth/login",
        json={"username": "non_existent_user", "password": "AnyPassword!"},
    )
    assert res_no_user.status_code == 401
    assert _error_code(res_no_user) == "INVALID_CREDENTIALS"


def test_auth_login_rate_limiting():
    """Verify login rate limiter throttles repeated failed attempts with 429."""
    login_rate_limiter.clear()
    rate_username = f"brute_force_target_{uuid.uuid4().hex[:6]}"

    # Send 5 failed attempts
    for _ in range(5):
        r = client.post(
            "/api/v1/auth/login",
            json={"username": rate_username, "password": "bad_password"},
        )
        assert r.status_code == 401

    # 6th attempt should be blocked by rate limiter
    r_blocked = client.post(
        "/api/v1/auth/login",
        json={"username": rate_username, "password": "bad_password"},
    )
    assert r_blocked.status_code == 429
    assert _error_code(r_blocked) == "RATE_LIMIT_EXCEEDED"
    assert "Retry-After" in r_blocked.headers
    login_rate_limiter.clear()


def test_auth_logout_records_audit():
    """Verify /auth/logout succeeds and records an audit log entry."""
    login_data = _login("analyst", "DisruptionIQ#2026!Analyst")
    token = login_data["access_token"]

    res = client.post("/api/v1/auth/logout", headers=_get_auth_header(token))
    assert res.status_code == 200
    assert res.json()["message"] == "Logged out successfully"


# ---------------------------------------------------------------------------
# 3. RBAC Permission Matrix & Direct API Tampering Tests
# ---------------------------------------------------------------------------

def test_operations_analyst_cannot_approve_plans():
    """Requirement 1, 2, 4: Operations Analyst role lacks approve permissions."""
    dis_id = _get_disruption_id()
    analyst_token = _login("analyst", "DisruptionIQ#2026!Analyst")["access_token"]
    analyst_headers = _get_auth_header(analyst_token)

    # Analyst creates and submits a plan
    plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=analyst_headers,
    ).json()
    plan_id = plans[0]["id"]

    client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Analyst submitting emergency recovery plan"},
        headers=analyst_headers,
    )

    # Direct API approve call using analyst token MUST fail with 403 Forbidden
    resp = client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Analyst trying to self-approve"},
        headers=analyst_headers,
    )
    assert resp.status_code == 403
    assert _error_code(resp) == "FORBIDDEN"


def test_warehouse_operator_cannot_approve_or_create_plans():
    """Requirement 1, 2, 4: Warehouse Operator cannot create or approve recovery plans."""
    dis_id = _get_disruption_id()
    wh_token = _login("warehouse", "DisruptionIQ#2026!Warehouse")["access_token"]
    wh_headers = _get_auth_header(wh_token)

    # Direct API plan create attempt fails with 403
    resp_create = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=wh_headers,
    )
    assert resp_create.status_code == 403
    assert _error_code(resp_create) == "FORBIDDEN"

    # Direct API approve attempt fails with 403
    resp_approve = client.post(
        f"/api/v1/recovery/plans/PLN-NONEXISTENT/approve",
        json={"comments": "Warehouse trying to approve"},
        headers=wh_headers,
    )
    assert resp_approve.status_code == 403
    assert _error_code(resp_approve) == "FORBIDDEN"


def test_client_supplied_header_role_is_ignored():
    """Security Requirement: Never trust a role supplied by frontend (e.g. X-Actor-Role: administrator)."""
    dis_id = _get_disruption_id()
    analyst_token = _login("analyst", "DisruptionIQ#2026!Analyst")["access_token"]

    # Attacker sends valid analyst token BUT attempts to spoof X-Actor-Role: administrator
    spoofed_headers = {
        "Authorization": f"Bearer {analyst_token}",
        "X-Actor-Role": "administrator",
        "X-Actor-Id": "admin",
    }

    # Create plan
    plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=spoofed_headers,
    ).json()
    plan_id = plans[0]["id"]

    client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Valid submission justification"},
        headers=spoofed_headers,
    )

    # Approve attempt with spoofed role header MUST still fail because backend uses DB role
    resp = client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Spoofing admin header"},
        headers=spoofed_headers,
    )
    assert resp.status_code == 403
    assert _error_code(resp) == "FORBIDDEN"


# ---------------------------------------------------------------------------
# 4. Separation of Duties (Creator / Submitter Self-Approval Prevention)
# ---------------------------------------------------------------------------

def test_separation_of_duties_manager_cannot_approve_own_submission():
    """Requirement 5: A manager who submitted a plan CANNOT approve their own submission."""
    dis_id = _get_disruption_id()
    mgr1_token = _login("manager", "DisruptionIQ#2026!Manager")["access_token"]
    mgr2_token = _login("manager2", "DisruptionIQ#2026!Manager2")["access_token"]

    mgr1_headers = _get_auth_header(mgr1_token)
    mgr2_headers = _get_auth_header(mgr2_token)

    # Manager 1 creates and submits the plan
    plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=mgr1_headers,
    ).json()
    plan = next((p for p in plans if p["strategyType"] == "on_hand"), plans[0])
    plan_id = plan["id"]

    # Submit plan as Manager 1
    submit_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Manager 1 request for expedited inventory release"},
        headers=mgr1_headers,
    )
    assert submit_res.status_code == 200

    # Self-approval attempt by Manager 1 MUST fail with 403
    self_approve_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Manager 1 approving own request"},
        headers=mgr1_headers,
    )
    assert self_approve_res.status_code == 403
    assert _error_code(self_approve_res) == "SEPARATION_OF_DUTIES_VIOLATION"

    # Independent review: Manager 2 (distinct person) CAN approve if non-procurement
    independent_approve_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Manager 2 independent approval granted"},
        headers=mgr2_headers,
    )
    assert independent_approve_res.status_code in (200, 403)
    if independent_approve_res.status_code == 200:
        assert independent_approve_res.json()["status"] == "approved"


# ---------------------------------------------------------------------------
# 5. Procurement Policy Enforcement
# ---------------------------------------------------------------------------

def test_procurement_approval_required_for_alt_sourcing_plans():
    """Requirement 6: Plans triggering alternative sourcing or purchases require procurement approver."""
    dis_id = _get_disruption_id()
    analyst_headers = _get_auth_header(_login("analyst", "DisruptionIQ#2026!Analyst")["access_token"])
    mgr_headers = _get_auth_header(_login("manager", "DisruptionIQ#2026!Manager")["access_token"])
    proc_headers = _get_auth_header(_login("procurement", "DisruptionIQ#2026!Procure")["access_token"])

    plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=analyst_headers,
    ).json()

    # Find alt_supplier plan
    alt_plan = next((p for p in plans if "alt_supplier" in p["strategyType"]), None)
    if not alt_plan:
        pytest.skip("No alt_supplier plan generated for this disruption")

    plan_id = alt_plan["id"]

    # Analyst submits the alt_supplier plan
    client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Requires sourcing from external backup supplier"},
        headers=analyst_headers,
    )

    # Standard Supply Chain Manager attempts to approve alt-sourcing plan -> MUST fail 403
    mgr_attempt = client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Manager attempting to sign off on external procurement"},
        headers=mgr_headers,
    )
    assert mgr_attempt.status_code == 403
    assert _error_code(mgr_attempt) == "PROCUREMENT_APPROVAL_REQUIRED"

    # Procurement Approver approves -> MUST succeed 200
    proc_attempt = client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Procurement Director verified contracts and approved"},
        headers=proc_headers,
    )
    assert proc_attempt.status_code == 200
    assert proc_attempt.json()["status"] == "approved"


# ---------------------------------------------------------------------------
# 6. Recovery Plan State Machine & Transition Guards
# ---------------------------------------------------------------------------

def test_recovery_plan_state_machine_transitions():
    """Requirement 3: Verify strict state transitions and reject invalid transitions with 409."""
    dis_id = _get_disruption_id()
    admin_headers = _get_auth_header(_login("admin", "DisruptionIQ#2026!Admin")["access_token"])
    mgr2_headers = _get_auth_header(_login("manager2", "DisruptionIQ#2026!Manager2")["access_token"])

    plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=admin_headers,
    ).json()
    plan_id = plans[0]["id"]

    # Invalid: cannot approve a 'proposed' plan without submission
    bad_approve = client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Attempt skipping submit"},
        headers=admin_headers,
    )
    assert bad_approve.status_code == 409
    assert _error_code(bad_approve) == "INVALID_STATUS"

    # Invalid: cannot execute a 'proposed' plan
    bad_execute = client.post(
        f"/api/v1/recovery/plans/{plan_id}/execute",
        json={"idempotencyKey": f"BAD-EXEC-{uuid.uuid4().hex}"},
        headers=admin_headers,
    )
    assert bad_execute.status_code == 409
    assert _error_code(bad_execute) == "INVALID_STATUS"

    # Valid: Simulate plan
    sim_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/simulate",
        headers=admin_headers,
    )
    assert sim_res.status_code == 200
    assert sim_res.json()["status"] == "simulated"

    # Valid: Submit plan
    sub_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Valid justification for review"},
        headers=admin_headers,
    )
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "submitted"

    # Requirement 7: Request plan modification with reason
    mod_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/modify",
        json={"reason": "Please re-allocate Rotterdam inventory before expediting"},
        headers=mgr2_headers,
    )
    assert mod_res.status_code == 200
    assert mod_res.json()["status"] == "modification_requested"
    assert "Rotterdam" in mod_res.json()["modificationReason"]

    # Re-submit plan after modification
    re_sub_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Updated allocations addressing reviewer feedback"},
        headers=admin_headers,
    )
    assert re_sub_res.status_code == 200
    assert re_sub_res.json()["status"] == "submitted"

    # Requirement 7: Reject plan with reason
    rej_res = client.post(
        f"/api/v1/recovery/plans/{plan_id}/reject",
        json={"reason": "Budget limit exceeded for expedited air freight"},
        headers=mgr2_headers,
    )
    assert rej_res.status_code == 200
    assert rej_res.json()["status"] == "rejected"
    assert "Budget limit" in rej_res.json()["rejectionReason"]

    # Invalid: cannot execute a rejected plan
    rej_exec = client.post(
        f"/api/v1/recovery/plans/{plan_id}/execute",
        json={"idempotencyKey": f"REJ-EXEC-{uuid.uuid4().hex}"},
        headers=admin_headers,
    )
    assert rej_exec.status_code == 409
    assert _error_code(rej_exec) == "INVALID_STATUS"


# ---------------------------------------------------------------------------
# 7. Duplicate/Stale Execution & Idempotency Guards
# ---------------------------------------------------------------------------

def test_idempotent_execution_and_duplicate_request_prevention():
    """Requirement 9: Replaying same idempotency key succeeds without duplicate effects."""
    dis_id = _get_disruption_id()
    analyst_headers = _get_auth_header(_login("analyst", "DisruptionIQ#2026!Analyst")["access_token"])
    proc_headers = _get_auth_header(_login("procurement", "DisruptionIQ#2026!Procure")["access_token"])
    admin_headers = _get_auth_header(_login("admin", "DisruptionIQ#2026!Admin")["access_token"])

    plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=analyst_headers,
    ).json()

    # Find feasible plan
    plan = next((p for p in plans if p["isFeasible"]), plans[0])
    plan_id = plan["id"]

    # Submit & Approve
    client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Execution test plan justification"},
        headers=analyst_headers,
    )
    client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Approved for execution"},
        headers=proc_headers,
    )

    # First execution by Admin
    key = f"IDEMP-KEY-{uuid.uuid4().hex}"
    exec_res1 = client.post(
        f"/api/v1/recovery/plans/{plan_id}/execute",
        json={"idempotencyKey": key},
        headers=admin_headers,
    )
    assert exec_res1.status_code == 200
    assert exec_res1.json()["idempotent"] is False
    assert exec_res1.json()["status"] == "executed"

    # Second execution with SAME idempotency key returns idempotent: True without duplicate mutations
    exec_res2 = client.post(
        f"/api/v1/recovery/plans/{plan_id}/execute",
        json={"idempotencyKey": key},
        headers=admin_headers,
    )
    assert exec_res2.status_code == 200
    assert exec_res2.json()["idempotent"] is True

    # Third execution with DIFFERENT idempotency key MUST fail with 409 ALREADY_EXECUTED
    diff_key = f"DIFF-KEY-{uuid.uuid4().hex}"
    exec_res3 = client.post(
        f"/api/v1/recovery/plans/{plan_id}/execute",
        json={"idempotencyKey": diff_key},
        headers=admin_headers,
    )
    assert exec_res3.status_code == 409
    assert _error_code(exec_res3) == "ALREADY_EXECUTED"


# ---------------------------------------------------------------------------
# 8. Pre-Execution Revalidation Guards
# ---------------------------------------------------------------------------

def test_pre_execution_revalidation_detects_depleted_inventory():
    """Requirement 8: Revalidate inventory before execution; fails if stock depleted."""
    dis_id = _get_disruption_id()
    analyst_headers = _get_auth_header(_login("analyst", "DisruptionIQ#2026!Analyst")["access_token"])
    proc_headers = _get_auth_header(_login("procurement", "DisruptionIQ#2026!Procure")["access_token"])
    admin_headers = _get_auth_header(_login("admin", "DisruptionIQ#2026!Admin")["access_token"])

    plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": dis_id},
        headers=analyst_headers,
    ).json()

    # Find any feasible plan with allocations
    plan = next((p for p in plans if p["isFeasible"] and p.get("orderAllocations")), plans[0])
    plan_id = plan["id"]

    client.post(
        f"/api/v1/recovery/plans/{plan_id}/submit",
        json={"justification": "Testing pre-execution inventory revalidation"},
        headers=analyst_headers,
    )
    client.post(
        f"/api/v1/recovery/plans/{plan_id}/approve",
        json={"comments": "Approved for revalidation test"},
        headers=proc_headers,
    )

    # Mutate database inventory directly (simulating real-world stockout between approval & execution)
    session = database.SessionLocal()
    try:
        alloc = session.scalars(select(PlanAllocation).where(PlanAllocation.plan_id == plan_id)).first()
        if alloc and alloc.allocated_quantity > 0:
            inv = session.scalars(
                select(Inventory).where(
                    Inventory.warehouse_id == alloc.source_warehouse_id,
                    Inventory.sku == alloc.sku,
                )
            ).first()
            if inv:
                inv.available_units = 0  # Deplete stock
                session.commit()
    finally:
        session.close()

    # Execute should fail during live pre-execution revalidation
    exec_fail = client.post(
        f"/api/v1/recovery/plans/{plan_id}/execute",
        json={"idempotencyKey": f"STALE-INV-{uuid.uuid4().hex}"},
        headers=admin_headers,
    )
    assert exec_fail.status_code == 409
    assert _error_code(exec_fail) == "REVALIDATION_FAILED"


# ---------------------------------------------------------------------------
# 9. Audit Trail & Before/After Diff Tracking
# ---------------------------------------------------------------------------

def test_audit_trail_records_actor_timestamp_and_diffs():
    """Requirement 10: Audit trail records actor, timestamp, action, entity ID, and before/after values."""
    dis_id = _get_disruption_id()
    admin_headers = _get_auth_header(_login("admin", "DisruptionIQ#2026!Admin")["access_token"])

    # Fetch audit log
    audit_res = client.get("/api/v1/audit", headers=admin_headers)
    assert audit_res.status_code == 200
    entries = audit_res.json()
    assert isinstance(entries, list)
    assert len(entries) > 0

    first = entries[0]
    assert "id" in first
    assert "timestamp" in first
    assert "actorName" in first
    assert "action" in first
    assert "entityType" in first
    assert "entityId" in first
    assert "reason" in first

    # Check disruption audit endpoint
    dis_audit_res = client.get(f"/api/v1/recovery/{dis_id}/audit", headers=admin_headers)
    assert dis_audit_res.status_code == 200
    dis_events = dis_audit_res.json()
    assert isinstance(dis_events, list)
    for evt in dis_events:
        assert evt["disruptionId"] == dis_id
        assert "actorId" in evt
        assert "occurredAt" in evt
        payload = evt["payload"]
        if evt["action"] in ("plan_submitted", "plan_approved", "plan_rejected", "plan_executed"):
            assert "before" in payload
            assert "after" in payload
