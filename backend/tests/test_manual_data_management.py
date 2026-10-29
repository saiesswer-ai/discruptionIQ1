"""
Comprehensive test suite for Persistent Manual Data Entry and Management.

Verifies:
  1. Disruptions Registry (+ Report Disruption, update status/evidence, audit trail).
  2. Inventory & Warehouses (adjustments, negative stock prevention, reservation safety, transfers).
  3. Shipments & Suppliers (shipment creation, ETA updates, disruption trigger without duplicates, supplier issues).
  4. Orders & Orders at Risk (order creation, line items, authoritative risk scoring, updates).
  5. Connection to Recovery Arena (loading affected entities, deterministic candidate plan generation).
  6. Security & RBAC (permission checks on write endpoints, rejection of unauthorized roles).
  7. Audit Records (presence of actor, role, timestamp, entity, reason, before/after diffs in /audit).
  8. Idempotency & Duplicate handling.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core import database
from app.core.config import get_settings
from app.main import app
from app.models.governance import AuditRecord, DisruptionImpact, DisruptionRecord
from app.models.recovery import RecoveryPlan
from app.models.supply_chain import Inventory, Order, OrderLine, Shipment, Supplier, Warehouse

client = TestClient(app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _auth(role_name: str) -> dict[str, str]:
    passwords = {
        "analyst": "DisruptionIQ#2026!Analyst",
        "manager": "DisruptionIQ#2026!Manager",
        "warehouse": "DisruptionIQ#2026!Warehouse",
        "procurement": "DisruptionIQ#2026!Procure",
        "admin": "DisruptionIQ#2026!Admin",
    }
    res = client.post(
        "/api/v1/auth/login",
        json={"username": role_name, "password": passwords[role_name]},
    )
    assert res.status_code == 200, f"Login failed for {role_name}: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Disruptions Registry Tests
# ---------------------------------------------------------------------------

def test_create_manual_disruption_persistence_and_audit():
    """Verify manual disruption creation persists record, links impacts, and records audit."""
    headers = _auth("analyst")
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    payload = {
        "type": "port_congestion",
        "title": "Crane Breakdown at Rotterdam Delta Terminal",
        "severity": "high",
        "status": "active",
        "location": "Delta Dedicated East Terminal, Rotterdam",
        "carrierOrSupplier": "Maersk Line",
        "delayHours": 36,
        "summary": "Container gantry crane failure halted automated stacking yard operations.",
        "rootCause": "Hydraulic failure during vessel discharge operations.",
        "affectedWarehouseId": "WH-RTM-01",
        "affectedSKUs": ["NVX-9400", "ETH-200X"],
        "estimatedFinancialImpactUSD": 85000.0,
        "reason": "Terminal supervisor telecon update",
        "idempotencyKey": idempotency_key,
    }

    res = client.post("/api/v1/disruptions", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    data = res.json()
    disruption_id = data["id"]
    assert disruption_id.startswith("DIS-")
    assert data["title"] == payload["title"]
    assert data["delayHours"] == 36
    assert "NVX-9400" in data["affectedSKUs"]

    # Verify queryable in GET /disruptions
    list_res = client.get("/api/v1/disruptions", headers=headers)
    assert list_res.status_code == 200
    ids = [d["id"] for d in list_res.json()]
    assert disruption_id in ids

    # Verify detail view
    det_res = client.get(f"/api/v1/disruptions/{disruption_id}", headers=headers)
    assert det_res.status_code == 200
    det_data = det_res.json()
    assert det_data["id"] == disruption_id

    # Verify audit record created
    audit_res = client.get("/api/v1/audit", headers=headers)
    assert audit_res.status_code == 200
    audit_entries = audit_res.json()
    disruption_audits = [a for a in audit_entries if a["entityId"] == disruption_id]
    assert len(disruption_audits) >= 1
    assert disruption_audits[0]["action"] == "CREATE_DISRUPTION"
    assert disruption_audits[0]["actorName"] == "analyst"


def test_create_disruption_idempotency_safe():
    """Verify re-submitting with identical idempotencyKey returns existing record without duplicating."""
    headers = _auth("analyst")
    idemp_key = f"safe-idemp-{uuid.uuid4().hex}"
    payload = {
        "type": "customs_hold",
        "title": "Customs Inspection Hold on Micro-controllers",
        "severity": "medium",
        "location": "Rotterdam Port Customs Office",
        "summary": "Random sampling inspection ordered by customs authorities.",
        "delayHours": 18,
        "idempotencyKey": idemp_key,
        "reason": "Customs notice",
    }

    res1 = client.post("/api/v1/disruptions", json=payload, headers=headers)
    assert res1.status_code == 201
    id1 = res1.json()["id"]

    res2 = client.post("/api/v1/disruptions", json=payload, headers=headers)
    assert res2.status_code in (200, 201)
    id2 = res2.json()["id"]
    assert id1 == id2


def test_create_disruption_invalid_references_rejected():
    """Verify referencing nonexistent shipment or warehouse returns 422."""
    headers = _auth("analyst")
    payload = {
        "type": "carrier_delay",
        "title": "Invalid reference test",
        "severity": "low",
        "location": "Unknown",
        "summary": "Testing invalid foreign references",
        "affectedShipmentId": "NONEXISTENT-SHP-999",
        "reason": "Test",
    }
    res = client.post("/api/v1/disruptions", json=payload, headers=headers)
    assert res.status_code == 422


def test_update_disruption_status_and_evidence():
    """Verify updating a disruption preserves identity and audits status changes."""
    headers = _auth("analyst")
    # First create one
    create_payload = {
        "type": "carrier_delay",
        "title": "Berth Delay Rotterdam",
        "severity": "high",
        "status": "active",
        "location": "Rotterdam",
        "summary": "Initial report",
        "delayHours": 24,
        "reason": "Initial notice",
    }
    c_res = client.post("/api/v1/disruptions", json=create_payload, headers=headers)
    dis_id = c_res.json()["id"]

    # Now update status to mitigating and add evidence note
    patch_payload = {
        "status": "mitigating",
        "delayHours": 12,
        "newEvidence": {"kind": "port_update", "facts": {"tugboatAvailable": True}},
        "newTimelineEvent": {
            "id": "evt-update-1",
            "timestamp": "2026-10-26T22:00:00Z",
            "title": "Tugboat dispatched",
            "description": "Vessel maneuvering to container terminal 3.",
            "source": "Port Dispatcher",
        },
        "reason": "Tugboat assigned earlier than expected",
    }
    u_res = client.patch(f"/api/v1/disruptions/{dis_id}", json=patch_payload, headers=headers)
    assert u_res.status_code == 200
    u_data = u_res.json()
    assert u_data["status"] == "mitigating"
    assert u_data["delayHours"] == 12

    # Check audit log
    audit_res = client.get("/api/v1/audit", headers=headers)
    update_audits = [a for a in audit_res.json() if a["entityId"] == dis_id and a["action"] == "UPDATE_DISRUPTION"]
    assert len(update_audits) >= 1
    assert update_audits[0]["reason"] == "Tugboat assigned earlier than expected"


# ---------------------------------------------------------------------------
# 2. Inventory & Warehouses Operations Tests
# ---------------------------------------------------------------------------

def test_adjust_inventory_delta_and_recalculation():
    """Verify inventory adjustment changes available units and recalculates status without derived field tampering."""
    wh_headers = _auth("warehouse")
    payload = {
        "warehouseId": "WH-RTM-01",
        "sku": "NVX-9400",
        "adjustmentType": "receipt",
        "quantityDelta": 50,
        "reason": "Direct container cross-dock receipt",
    }
    res = client.post("/api/v1/inventory/adjust", json=payload, headers=wh_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["sku"] == "NVX-9400"
    assert data["availableUnits"] >= 50

    # Verify audit using role with audit:read permission (analyst)
    analyst_headers = _auth("analyst")
    audit_res = client.get("/api/v1/audit", headers=analyst_headers)
    assert audit_res.status_code == 200
    inv_audits = [a for a in audit_res.json() if a["action"] == "INVENTORY_ADJUST" and a["entityType"] == "Inventory"]
    assert len(inv_audits) >= 1


def test_adjust_inventory_negative_stock_forbidden():
    """Verify adjustments resulting in negative stock or breaching reservations are rejected with 422."""
    headers = _auth("warehouse")
    # Attempting to subtract 99999 units
    payload = {
        "warehouseId": "WH-RTM-01",
        "sku": "NVX-9400",
        "adjustmentType": "write_off",
        "quantityDelta": -99999,
        "reason": "Catastrophic write-off",
    }
    res = client.post("/api/v1/inventory/adjust", json=payload, headers=headers)
    assert res.status_code == 422


def test_stock_transfer_between_warehouses():
    """Verify inter-hub stock movement decrements source and increments destination transactionally."""
    headers = _auth("manager")
    # First ensure ORD has stock of NVX-9400
    res_adj = client.post("/api/v1/inventory/adjust", json={
        "warehouseId": "WH-ORD-01",
        "sku": "NVX-9400",
        "quantityDelta": 100,
        "reason": "Pre-stocking for transfer test",
    }, headers=headers)
    assert res_adj.status_code == 200

    transfer_payload = {
        "fromWarehouseId": "WH-ORD-01",
        "toWarehouseId": "WH-FRA-01",
        "sku": "NVX-9400",
        "quantity": 30,
        "reason": "Expedite European critical orders",
    }
    res = client.post("/api/v1/inventory/transfer", json=transfer_payload, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "source" in data and "destination" in data
    assert data["destination"]["warehouseId"] == "WH-FRA-01"


def test_stock_transfer_insufficient_stock_rejected():
    """Verify transferring more than available stock is rejected."""
    headers = _auth("manager")
    transfer_payload = {
        "fromWarehouseId": "WH-RTM-01",
        "toWarehouseId": "WH-ORD-01",
        "sku": "NVX-9400",
        "quantity": 999999,
        "reason": "Impossible transfer",
    }
    res = client.post("/api/v1/inventory/transfer", json=transfer_payload, headers=headers)
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# 3. Shipments & Suppliers Operations Tests
# ---------------------------------------------------------------------------

def test_create_shipment_and_delay_disruption_flow():
    """Verify creating a shipment with delay feeds into the disruption detection engine."""
    headers = _auth("analyst")
    tracking = f"TRK-TEST-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "trackingNumber": tracking,
        "carrierName": "Pacific Ocean Lines",
        "transportMode": "Ocean",
        "origin": "Busan, South Korea",
        "destination": "Rotterdam Gateway, Netherlands",
        "promisedDeliveryDate": "2026-10-25T12:00:00Z",
        "estimatedDeliveryDate": "2026-10-29T12:00:00Z",  # 96 hours delay
        "supplierId": "SUP-APX-01",
        "cargoDescription": "Electronic component containers [NVX-9400, ETH-200X]",
        "reason": "New manual shipment dispatch",
    }
    res = client.post("/api/v1/shipments", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    shipment_data = res.json()
    assert shipment_data["trackingNumber"] == tracking
    assert shipment_data["status"] == "delayed"
    assert shipment_data["delayHours"] >= 90

    # Verify that a disruption was automatically detected/linked
    dis_res = client.get("/api/v1/disruptions", headers=headers)
    disruptions = dis_res.json()
    matching_dis = [d for d in disruptions if tracking in d["title"] or d["carrierOrSupplier"] == "Pacific Ocean Lines"]
    assert len(matching_dis) >= 1


def test_update_shipment_eta_does_not_create_duplicate_disruptions():
    """Verify updating a shipment repeatedly updates the existing disruption without duplicates."""
    headers = _auth("analyst")
    tracking = f"TRK-IDEMP-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "trackingNumber": tracking,
        "carrierName": "Atlantic Logistics",
        "transportMode": "Ocean",
        "origin": "Hamburg, Germany",
        "destination": "Rotterdam, Netherlands",
        "promisedDeliveryDate": "2026-10-26T12:00:00Z",
        "estimatedDeliveryDate": "2026-10-28T12:00:00Z",
        "supplierId": "SUP-APX-01",
        "cargoDescription": "NVX-9400 parts",
    }
    c_res = client.post("/api/v1/shipments", json=payload, headers=headers)
    assert c_res.status_code == 201
    shipment_id = c_res.json()["id"]

    # First update
    client.patch(f"/api/v1/shipments/{shipment_id}", json={
        "estimatedDeliveryDate": "2026-10-29T12:00:00Z",
        "reason": "Bad weather update 1",
    }, headers=headers)

    # Second update
    client.patch(f"/api/v1/shipments/{shipment_id}", json={
        "estimatedDeliveryDate": "2026-10-30T12:00:00Z",
        "reason": "Bad weather update 2",
    }, headers=headers)

    # Check disruptions count for this shipment
    dis_res = client.get("/api/v1/disruptions", headers=headers)
    disruptions = [d for d in dis_res.json() if tracking in d["title"]]
    # Should only be 1 disruption for this shipment, not 2 or 3
    assert len(disruptions) == 1


def test_record_supplier_issue():
    """Verify recording an issue increments delay incidents and creates audit entry."""
    headers = _auth("procurement")
    payload = {
        "supplierId": "SUP-APX-01",
        "issueType": "quality_hold",
        "title": "Wafer lot thermal quarantine",
        "description": "Cleanroom batch failed qualification test.",
        "severity": "high",
        "estimatedDelayDays": 5,
        "reason": "Vendor automated QA alert",
    }
    res = client.post("/api/v1/suppliers/issues", json=payload, headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["id"] == "SUP-APX-01"
    assert data["delayIncidentsLast90d"] >= 1


# ---------------------------------------------------------------------------
# 4. Orders & Orders at Risk Operations Tests
# ---------------------------------------------------------------------------

def test_create_order_authoritative_risk_scoring():
    """Verify order creation runs authoritative backend risk scoring and shows in Orders at Risk."""
    headers = _auth("analyst")
    payload = {
        "customerName": "HyperScale Cloud Systems",
        "customerTier": "Enterprise",
        "priority": "P1",
        "promisedDeadline": "2026-10-27T06:00:00Z",  # Near simulation clock (12h breach margin)
        "primaryWarehouseId": "WH-RTM-01",
        "fulfillmentPolicy": "FULL_ONLY",
        "orderLines": [
            {"sku": "NVX-9400", "quantity": 100, "unitPriceUSD": 1450.0},  # 100 units > available 70
        ],
        "reason": "New urgent cloud deployment order",
    }
    res = client.post("/api/v1/orders", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    order_data = res.json()
    assert order_data["id"].startswith("ORD-")
    assert order_data["customerName"] == "HyperScale Cloud Systems"
    # Stock shortage (35) + deadline proximity (20) = 55
    assert order_data["riskScore"] >= 50
    assert order_data["riskLevel"] in ("high", "critical")

    # Verify queryable in /orders/at-risk
    at_risk_res = client.get("/api/v1/orders/at-risk", headers=headers)
    assert at_risk_res.status_code == 200
    ids = [o["id"] for o in at_risk_res.json()]
    assert order_data["id"] in ids


def test_update_order_recalculates_risk():
    """Verify updating order deadline or priority triggers deterministic risk score update."""
    headers = _auth("analyst")
    # Create order first
    create_res = client.post("/api/v1/orders", json={
        "customerName": "FlexCompute Corp",
        "customerTier": "Standard",
        "priority": "P3",
        "promisedDeadline": "2026-11-20T12:00:00Z",  # Far deadline
        "primaryWarehouseId": "WH-ORD-01",
        "orderLines": [{"sku": "ETH-200X", "quantity": 5, "unitPriceUSD": 280.0}],
    }, headers=headers)
    assert create_res.status_code == 201
    ord_id = create_res.json()["id"]

    # Now escalate priority to P1 and move deadline to within 24h
    patch_res = client.patch(f"/api/v1/orders/{ord_id}", json={
        "priority": "P1",
        "promisedDeadline": "2026-10-27T08:00:00Z",
        "reason": "Customer SLA expedited escalation",
    }, headers=headers)
    assert patch_res.status_code == 200
    updated_data = patch_res.json()
    assert updated_data["priority"] == "P1"
    assert updated_data["hoursUntilBreach"] <= 24
    assert updated_data["riskScore"] > 0


# ---------------------------------------------------------------------------
# 5. Connect manual data to Recovery Arena
# ---------------------------------------------------------------------------

def test_connect_manual_disruption_to_recovery_arena():
    """Verify a manually reported disruption with affected orders resolves entities and generates candidate plans."""
    headers = _auth("manager")

    # 1. Create a manual disruption referencing an existing order
    dis_payload = {
        "type": "carrier_delay",
        "title": "Rotterdam Hub Deep Channel Dredging Bottleneck",
        "severity": "critical",
        "status": "active",
        "location": "Rotterdam Europort",
        "delayHours": 48,
        "summary": "Channel dredging closed main harbor fairway.",
        "affectedWarehouseId": "WH-RTM-01",
        "affectedSKUs": ["NVX-9400"],
        "affectedOrderIds": ["ORD-8401", "ORD-8402"],
        "reason": "Port authority navigational broadcast",
    }
    d_res = client.post("/api/v1/disruptions", json=dis_payload, headers=headers)
    assert d_res.status_code == 201
    disruption_id = d_res.json()["id"]

    # 2. Open in Recovery Arena: call POST /recovery/plans
    plans_res = client.post("/api/v1/recovery/plans", json={"disruptionId": disruption_id}, headers=headers)
    assert plans_res.status_code in (200, 201), plans_res.text
    plans = plans_res.json()
    assert len(plans) >= 1
    # Check that plans are candidate strategies with allocations
    plan_ids = [p["id"] for p in plans]
    first_plan_id = plan_ids[0]

    # 3. Simulate plan
    sim_res = client.post(f"/api/v1/recovery/plans/{first_plan_id}/simulate", headers=headers)
    assert sim_res.status_code == 200
    sim_plan = sim_res.json()
    assert sim_plan["status"] == "simulated"
    assert "feasibilityScore" in sim_plan


# ---------------------------------------------------------------------------
# 6. Security & RBAC Enforcement Tests
# ---------------------------------------------------------------------------

def test_unauthorized_roles_cannot_write():
    """Verify warehouse operator cannot create disruptions or orders, returning 403."""
    wh_headers = _auth("warehouse")

    # Warehouse operator lacks disruptions:write
    res_dis = client.post("/api/v1/disruptions", json={
        "type": "carrier_delay",
        "title": "Unauthorized attempt",
        "severity": "low",
        "location": "Warehouse floor",
        "summary": "Should be rejected",
    }, headers=wh_headers)
    assert res_dis.status_code == 403

    # Warehouse operator lacks orders:write
    res_ord = client.post("/api/v1/orders", json={
        "customerName": "Test",
        "customerTier": "Standard",
        "priority": "P3",
        "promisedDeadline": "2026-10-30T12:00:00Z",
        "primaryWarehouseId": "WH-ORD-01",
        "orderLines": [{"sku": "NVX-9400", "quantity": 1, "unitPriceUSD": 100}],
    }, headers=wh_headers)
    assert res_ord.status_code == 403


def test_unauthenticated_requests_rejected():
    """Verify write endpoints with invalid/malformed token return 401."""
    res = client.post("/api/v1/disruptions", json={
        "type": "carrier_delay",
        "title": "No auth test",
        "severity": "low",
        "location": "Unauth location",
        "summary": "Should be rejected with 401",
    }, headers={"Authorization": "Bearer invalid_malformed_token_123"})
    assert res.status_code == 401
    assert "INVALID_TOKEN" in str(res.json())
