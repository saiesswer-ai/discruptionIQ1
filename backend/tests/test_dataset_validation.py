"""Pytest suite verifying synthetic datasets integrity, invariants, and DB queries."""
from pathlib import Path
from fastapi.testclient import TestClient

from app.main import app
from app.scripts.seed_database import seed_database
from datasets.validate_datasets import run_all_validations

client = TestClient(app)


def test_synthetic_datasets_pass_all_invariants():
    """Verify that synthetic CSV files satisfy all schema, FK, and inventory invariants."""
    # This will raise SystemExit or Exception if any validation check fails
    run_all_validations()


def test_seed_database_and_query_endpoints():
    """Verify that synthetic datasets load into SQLite and are queryable via REST endpoints."""
    counts = seed_database()
    assert counts["warehouses"] == 3
    assert counts["suppliers"] == 4
    assert counts["inventory"] == 24
    assert counts["shipments"] == 12
    assert counts["orders"] == 20
    assert counts["order_lines"] >= 30

    # Test Orders endpoint
    res = client.get("/api/v1/orders/at-risk")
    assert res.status_code == 200
    orders_data = res.json()
    assert len(orders_data) >= 20
    # Spot check first order
    p1_orders = [o for o in orders_data if o["priority"] == "P1"]
    assert len(p1_orders) >= 6

    # Test Inventory endpoint
    res = client.get("/api/v1/inventory")
    assert res.status_code == 200
    inventory_data = res.json()
    assert len(inventory_data) == 24

    # Test Shipments endpoint
    res = client.get("/api/v1/shipments")
    assert res.status_code == 200
    shipments_data = res.json()
    assert len(shipments_data) == 12
    delayed = [s for s in shipments_data if s["status"] == "delayed"]
    assert len(delayed) >= 2
    # Verify critical 48h delayed shipment
    delayed_48h = [s for s in delayed if s["delayHours"] == 48]
    assert len(delayed_48h) >= 1

    # Test Suppliers endpoint
    res = client.get("/api/v1/suppliers")
    assert res.status_code == 200
    suppliers_data = res.json()
    assert len(suppliers_data) == 4
