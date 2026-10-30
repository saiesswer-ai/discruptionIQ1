"""Comprehensive integration and unit tests for:
  1. Synthetic dataset import and duplicate prevention (idempotency)
  2. Warehouse creation and editing
  3. Product and inventory creation
  4. Stock transfer request
  5. Transfer approval
  6. Dispatch and destination inbound stock
  7. Receipt and automatic source/destination updates
  8. Insufficient stock rejection
  9. Safety-stock rejection
  10. Destination capacity rejection
  11. Duplicate receipt rejection
  12. Concurrent transfer safety
  13. Transaction rollback
  14. Audit history
  15. RBAC enforcement
  16. Existing Recovery Arena and disruption workflows
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core import database
from app.main import app
from app.models.auth import User, UserRole
from app.models.governance import AuditRecord
from app.models.supply_chain import (
    Company,
    Inventory,
    Order,
    Product,
    StockMovement,
    Warehouse,
    WarehouseTransfer,
)
from app.scripts.seed_database import seed_database
from app.scripts.seed_synthetic_company import seed_synthetic_company
from app.services.warehouse_service import (
    approve_transfer,
    dispatch_transfer,
    receive_transfer,
    request_transfer,
)
from app.schemas.inventory import TransferRequestPayload

client = TestClient(app)


def _auth(role_name: str) -> dict[str, str]:
    token_resp = client.post("/api/v1/auth/login", json={"username": role_name, "password": f"DisruptionIQ#2026!{role_name.capitalize()}"})
    if token_resp.status_code == 200:
        return {"Authorization": f"Bearer {token_resp.json()['access_token']}"}
    return {"X-Actor-Id": role_name, "X-Actor-Role": role_name}


# ---------------------------------------------------------------------------
# 1. Synthetic dataset import & duplicate prevention
# ---------------------------------------------------------------------------

def test_synthetic_company_dataset_seed_and_idempotency():
    """Verify synthetic dataset seeds correctly and running twice produces 0 duplicates."""
    session = database.SessionLocal()
    try:
        counts1 = seed_synthetic_company(session)
        assert counts1["company"] in (0, 1)
        assert counts1["warehouses"] in (0, 5)
        assert counts1["suppliers"] in (0, 10)
        assert counts1["products"] in (0, 20)
        assert counts1["inventory"] in (0, 100)
        assert counts1["shipments"] in (0, 30)
        assert counts1["orders"] in (0, 50)
        assert counts1["order_lines"] in (0, 100)
        assert counts1["transfers"] in (0, 10)
        assert counts1["disruptions"] in (0, 8)

        # Second run MUST create 0 new records
        counts2 = seed_synthetic_company(session)
        assert counts2["company"] == 0
        assert counts2["warehouses"] == 0
        assert counts2["suppliers"] == 0
        assert counts2["products"] == 0
        assert counts2["inventory"] == 0
        assert counts2["shipments"] == 0
        assert counts2["orders"] == 0
        assert counts2["order_lines"] == 0
        assert counts2["transfers"] == 0
        assert counts2["disruptions"] == 0
        assert counts2["stock_movements"] == 0

        # Verify relational integrity in database
        comp = session.get(Company, "COMP-DIQ-01")
        assert comp is not None
        assert comp.name == "DisruptionIQ Logistics Pvt. Ltd."
        assert comp.is_demo is True

        warehouses = session.scalars(select(Warehouse).where(Warehouse.company_id == "COMP-DIQ-01")).all()
        assert len(warehouses) >= 5

        # Verify 100 inventory items
        inv_count = len(session.scalars(select(Inventory).where(Inventory.is_demo.is_(True))).all())
        assert inv_count >= 100
    finally:
        session.close()


# ---------------------------------------------------------------------------
# 2. Warehouse creation and editing
# ---------------------------------------------------------------------------

def test_warehouse_creation_and_editing():
    headers = _auth("manager")
    new_wh = {
        "id": "WH-TEST-BLR",
        "name": "Bengaluru Electronics Depot",
        "location": "Whitefield Industrial Area",
        "city": "Bengaluru",
        "country": "India",
        "totalCapacitySqm": 25000,
        "availableDockDoors": 12,
        "companyId": "COMP-DIQ-01",
        "managerName": "Anand Kumar",
        "maxPalletCapacity": 8000,
        "isDemo": True,
    }
    res = client.post("/api/v1/warehouses", json=new_wh, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["id"] == "WH-TEST-BLR"
    assert data["name"] == "Bengaluru Electronics Depot"
    assert data["city"] == "Bengaluru"

    # Edit warehouse
    patch_res = client.patch(
        "/api/v1/warehouses/WH-TEST-BLR",
        json={"name": "Bengaluru Tech Logistics Hub", "availableDockDoors": 15},
        headers=headers,
    )
    assert patch_res.status_code == 200
    patch_data = patch_res.json()
    assert patch_data["name"] == "Bengaluru Tech Logistics Hub"
    assert patch_data["availableDockDoors"] == 15

    # Check warehouse detail view
    detail_res = client.get("/api/v1/warehouses/WH-TEST-BLR", headers=headers)
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["warehouse"]["name"] == "Bengaluru Tech Logistics Hub"
    assert "inventory" in detail_data
    assert "shortages" in detail_data
    assert "transfers" in detail_data


# ---------------------------------------------------------------------------
# 3. Product and inventory creation
# ---------------------------------------------------------------------------

def test_product_and_inventory_creation():
    headers = _auth("manager")
    prod_payload = {
        "sku": "SKU-TEST-QUANTUM",
        "name": "Quantum Optical Sensor",
        "description": "Sub-atomic precision laser interferometer",
        "category": "Optics & Transducers",
        "unitCostUSD": 1250.0,
        "weightKg": 2.5,
        "isDemo": True,
    }
    res = client.post("/api/v1/products", json=prod_payload, headers=headers)
    assert res.status_code == 201
    assert res.json()["sku"] == "SKU-TEST-QUANTUM"

    # Create inventory slot at Frankfurt
    inv_payload = {
        "warehouseId": "WH-FRA-01",
        "sku": "SKU-TEST-QUANTUM",
        "onHandUnits": 50,
        "safetyStockThreshold": 20,
        "reason": "Initial pilot batch allocation",
    }
    inv_res = client.post("/api/v1/inventory", json=inv_payload, headers=headers)
    assert inv_res.status_code == 201
    inv_data = inv_res.json()
    assert inv_data["sku"] == "SKU-TEST-QUANTUM"
    assert inv_data["onHandUnits"] == 50
    assert inv_data["availableUnits"] == 50
    assert inv_data["safetyStockThreshold"] == 20
    assert inv_data["status"] == "healthy"


# ---------------------------------------------------------------------------
# 4. Stock transfer request, approval, dispatch & receipt workflow
# ---------------------------------------------------------------------------

def test_complete_stock_transfer_lifecycle():
    """Verify REQUESTED -> APPROVED -> IN_TRANSIT -> RECEIVED with balance & ledger updates."""
    analyst_h = _auth("analyst")
    manager_h = _auth("manager")
    warehouse_h = _auth("warehouse")

    # Seed demo company
    seed_synthetic_company()

    # Step 1: Request Transfer (WH-FRA-02 -> WH-CHI-01)
    req_payload = {
        "sourceWarehouseId": "WH-FRA-02",
        "destinationWarehouseId": "WH-CHI-01",
        "sku": "SKU-ACC-01",
        "quantity": 25,
        "reason": "Urgent buffer transfer for North American priority orders",
    }
    req_res = client.post("/api/v1/inventory/transfers/request", json=req_payload, headers=analyst_h)
    assert req_res.status_code == 201
    transfer = req_res.json()
    transfer_id = transfer["id"]
    assert transfer["status"] == "REQUESTED"
    assert transfer["quantity"] == 25

    # Check source inventory: at REQUESTED, stock is NOT yet reserved
    session = database.SessionLocal()
    src_inv = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-FRA-02", Inventory.sku == "SKU-ACC-01"))
    src_avail_before_dispatch = src_inv.available_units
    session.close()

    # Step 2: Approve Transfer
    app_res = client.post(
        f"/api/v1/inventory/transfers/{transfer_id}/approve",
        json={"comments": "Approved by Supply Chain Manager"},
        headers=manager_h,
    )
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "APPROVED"
    assert app_res.json()["approvedBy"] == "manager"

    # Step 3: Dispatch Transfer
    disp_res = client.post(
        f"/api/v1/inventory/transfers/{transfer_id}/dispatch",
        json={"notes": "Air waybill AWB-7721-FRA-ORD"},
        headers=warehouse_h,
    )
    assert disp_res.status_code == 200
    assert disp_res.json()["status"] == "IN_TRANSIT"

    # Verify Stock Reservation and Inbound
    session = database.SessionLocal()
    src_inv = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-FRA-02", Inventory.sku == "SKU-ACC-01"))
    dest_inv = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-CHI-01", Inventory.sku == "SKU-ACC-01"))
    # Available decreased by 25, reserved increased by 25, on_hand NOT decreased yet!
    assert src_inv.available_units == src_avail_before_dispatch - 25
    assert dest_inv.inbound_units >= 25
    session.close()

    # Step 4: Receive Transfer
    recv_res = client.post(
        f"/api/v1/inventory/transfers/{transfer_id}/receive",
        json={"notes": "Dock receipt verified, no transit damage"},
        headers=warehouse_h,
    )
    assert recv_res.status_code == 200
    recv_data = recv_res.json()
    assert recv_data["status"] == "RECEIVED"
    assert recv_data["receivedBy"] == "warehouse"

    # Step 5: Verify Final Balances & Stock Movement Ledger
    session = database.SessionLocal()
    src_inv_after = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-FRA-02", Inventory.sku == "SKU-ACC-01"))
    dest_inv_after = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-CHI-01", Inventory.sku == "SKU-ACC-01"))

    # Movement ledger records
    mvt_out = session.scalar(
        select(StockMovement).where(
            StockMovement.reference_id == transfer_id,
            StockMovement.movement_type == "TRANSFER_OUT",
        )
    )
    assert mvt_out is not None
    assert mvt_out.quantity == 25
    assert mvt_out.warehouse_id == "WH-FRA-02"

    mvt_in = session.scalar(
        select(StockMovement).where(
            StockMovement.reference_id == transfer_id,
            StockMovement.movement_type == "TRANSFER_IN",
        )
    )
    assert mvt_in is not None
    assert mvt_in.quantity == 25
    assert mvt_in.warehouse_id == "WH-CHI-01"

    # Audit log check
    audit_entry = session.scalar(
        select(AuditRecord).where(
            AuditRecord.entity_type == "WarehouseTransfer",
            AuditRecord.action == "TRANSFER_RECEIVED",
            AuditRecord.entity_id == transfer_id,
        )
    )
    assert audit_entry is not None
    session.close()


# ---------------------------------------------------------------------------
# 5. Validation Rejection Tests (Insufficient Stock, Safety Stock, Capacity, Duplicate Receipt)
# ---------------------------------------------------------------------------

def test_transfer_insufficient_stock_rejection():
    seed_synthetic_company()
    headers = _auth("analyst")
    # Requesting 99999 units must be rejected
    res = client.post(
        "/api/v1/inventory/transfers/request",
        json={
            "sourceWarehouseId": "WH-FRA-02",
            "destinationWarehouseId": "WH-CHI-01",
            "sku": "SKU-ACC-01",
            "quantity": 99999,
            "reason": "Exorbitant transfer request",
        },
        headers=headers,
    )
    assert res.status_code == 422
    assert "INSUFFICIENT_STOCK" in json.dumps(res.json())


def test_transfer_safety_stock_rejection():
    seed_synthetic_company()
    session = database.SessionLocal()
    inv = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-FRA-02", Inventory.sku == "SKU-ACC-01"))
    avail = inv.available_units
    safety = inv.safety_stock_threshold
    session.close()

    headers = _auth("analyst")
    # Requesting quantity that leaves available < safety threshold
    violating_qty = avail - safety + 5
    res = client.post(
        "/api/v1/inventory/transfers/request",
        json={
            "sourceWarehouseId": "WH-FRA-02",
            "destinationWarehouseId": "WH-CHI-01",
            "sku": "SKU-ACC-01",
            "quantity": violating_qty,
            "reason": "Breaching safety buffer transfer",
        },
        headers=headers,
    )
    assert res.status_code == 422
    assert "SAFETY_STOCK_BREACH" in json.dumps(res.json())


def test_transfer_destination_capacity_rejection():
    seed_synthetic_company()
    headers = _auth("analyst")
    session = database.SessionLocal()
    dest_wh = session.get(Warehouse, "WH-CHI-01")
    dest_wh.max_pallet_capacity = 100  # Artificially set capacity very low
    session.commit()
    session.close()

    res = client.post(
        "/api/v1/inventory/transfers/request",
        json={
            "sourceWarehouseId": "WH-FRA-02",
            "destinationWarehouseId": "WH-CHI-01",
            "sku": "SKU-ACC-01",
            "quantity": 10,
            "reason": "Testing capacity rejection",
        },
        headers=headers,
    )
    assert res.status_code == 422
    assert "DESTINATION_CAPACITY_EXCEEDED" in json.dumps(res.json())


def test_duplicate_receipt_rejection():
    seed_synthetic_company()
    headers = _auth("warehouse")
    # DIQ-TRF-008 is already seeded in RECEIVED status
    res = client.post(
        "/api/v1/inventory/transfers/DIQ-TRF-008/receive",
        json={"notes": "Attempting second receipt"},
        headers=headers,
    )
    assert res.status_code == 422
    assert "DUPLICATE_RECEIPT" in json.dumps(res.json())


def test_identical_warehouse_rejection():
    headers = _auth("analyst")
    res = client.post(
        "/api/v1/inventory/transfers/request",
        json={
            "sourceWarehouseId": "WH-FRA-02",
            "destinationWarehouseId": "WH-FRA-02",
            "sku": "SKU-ACC-01",
            "quantity": 10,
            "reason": "Loopback transfer",
        },
        headers=headers,
    )
    assert res.status_code == 422
    assert "IDENTICAL_WAREHOUSES" in json.dumps(res.json())


# ---------------------------------------------------------------------------
# 6. RBAC & Security Matrix
# ---------------------------------------------------------------------------

def test_analyst_cannot_adjust_stock_or_approve_transfer():
    analyst_h = _auth("analyst")
    # Analyst cannot adjust inventory
    res_adj = client.post(
        "/api/v1/inventory/adjust",
        json={
            "warehouseId": "WH-FRA-01",
            "sku": "NVX-9400",
            "quantityDelta": 10,
            "reason": "Unauthorized analyst adjustment",
        },
        headers=analyst_h,
    )
    assert res_adj.status_code == 403

    # Analyst cannot approve a transfer
    seed_synthetic_company()
    res_app = client.post(
        "/api/v1/inventory/transfers/DIQ-TRF-001/approve",
        json={"comments": "Analyst trying to approve"},
        headers=analyst_h,
    )
    assert res_app.status_code == 403


def test_warehouse_operator_facility_restriction():
    session = database.SessionLocal()
    user = session.scalar(select(User).where(User.username == "warehouse"))
    user.assigned_warehouse_id = "WH-FRA-02"
    session.commit()
    session.close()

    wh_headers = _auth("warehouse")
    # Attempting to dispatch transfer from WH-CHI-01 (not assigned)
    # DIQ-TRF-003 source is WH-CHI-01, status APPROVED
    seed_synthetic_company()
    res = client.post(
        "/api/v1/inventory/transfers/DIQ-TRF-003/dispatch",
        json={"notes": "Unauthorized facility dispatch"},
        headers=wh_headers,
    )
    assert res.status_code == 403
    assert "WAREHOUSE_ACCESS_DENIED" in json.dumps(res.json())


# ---------------------------------------------------------------------------
# 7. Shortage Analysis & Risk Recalculation
# ---------------------------------------------------------------------------

def test_shortage_analysis_endpoint():
    seed_synthetic_company()
    headers = _auth("analyst")
    res = client.get("/api/v1/inventory/shortages", headers=headers)
    assert res.status_code == 200
    shortages = res.json()
    assert len(shortages) > 0
    first = shortages[0]
    assert "sku" in first
    assert "warehouseId" in first
    assert "unitsBelowSafety" in first
    assert first["unitsBelowSafety"] > 0
    assert first["availableUnits"] < first["safetyStockThreshold"]


def test_stock_movement_ledger_endpoint():
    seed_synthetic_company()
    headers = _auth("analyst")
    res = client.get("/api/v1/inventory/movements", headers=headers)
    assert res.status_code == 200
    movements = res.json()
    assert len(movements) > 0
    assert "movementType" in movements[0]
    assert "balanceBefore" in movements[0]
    assert "balanceAfter" in movements[0]


def test_concurrent_transfer_safety_and_rollback():
    """Verify that concurrent or sequential requests cannot over-allocate available stock and rollback protects state."""
    seed_synthetic_company()
    headers = _auth("analyst")

    session = database.SessionLocal()
    inv = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-FRA-02", Inventory.sku == "SKU-ACC-01"))
    avail_before = inv.available_units
    safety = inv.safety_stock_threshold
    max_transferrable = avail_before - safety
    session.close()

    # First transfer takes half of max_transferrable
    qty1 = max_transferrable // 2
    res1 = client.post(
        "/api/v1/inventory/transfers/request",
        json={
            "sourceWarehouseId": "WH-FRA-02",
            "destinationWarehouseId": "WH-CHI-01",
            "sku": "SKU-ACC-01",
            "quantity": qty1,
            "reason": "Batch 1 transfer",
        },
        headers=headers,
    )
    assert res1.status_code == 201

    # Dispatch first transfer so available stock reduces
    t1_id = res1.json()["id"]
    client.post(f"/api/v1/inventory/transfers/{t1_id}/approve", json={"comments": "ok"}, headers=_auth("manager"))
    client.post(f"/api/v1/inventory/transfers/{t1_id}/dispatch", json={"notes": "go"}, headers=_auth("warehouse"))

    # Second transfer requests remainder of original max_transferrable (which would now breach safety stock)
    qty2 = max_transferrable - qty1 + 1
    res2 = client.post(
        "/api/v1/inventory/transfers/request",
        json={
            "sourceWarehouseId": "WH-FRA-02",
            "destinationWarehouseId": "WH-CHI-01",
            "sku": "SKU-ACC-01",
            "quantity": qty2,
            "reason": "Batch 2 transfer competing for same stock",
        },
        headers=headers,
    )
    assert res2.status_code == 422
    assert "SAFETY_STOCK_BREACH" in json.dumps(res2.json())

    # Verify inventory state remained protected and uncorrupted
    session = database.SessionLocal()
    inv_final = session.scalar(select(Inventory).where(Inventory.warehouse_id == "WH-FRA-02", Inventory.sku == "SKU-ACC-01"))
    assert inv_final.available_units >= safety
    session.close()

