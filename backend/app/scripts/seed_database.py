"""Database seeder loading synthetic CSV datasets into SQLite via SQLAlchemy."""
from __future__ import annotations

import argparse
import csv
from datetime import datetime
from decimal import Decimal
from pathlib import Path
import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

# Allow running as script or module
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core import database
from app.core.security import hash_password
from app.models.auth import User, UserRole
from app.models.governance import CarrierWebhookEvent, DisruptionImpact, DisruptionRecord
from app.models.supply_chain import Inventory, Order, OrderLine, Shipment, Supplier, Warehouse
from app.models.recovery import PlanAllocation, PlanAuditEvent, RecoveryPlan

DATASETS_DIR = BACKEND_DIR.parent / "datasets"


from functools import lru_cache

@lru_cache(maxsize=128)
def _cached_hash(pwd: str) -> str:
    return hash_password(pwd)


def parse_datetime(val: str) -> datetime:
    """Parse ISO 8601 string into a Python datetime object."""
    return datetime.fromisoformat(val.replace("Z", "+00:00"))


def parse_decimal(val: str) -> Decimal:
    """Parse string into a Decimal object."""
    return Decimal(val.strip())


def read_csv(filename: str) -> list[dict[str, str]]:
    filepath = DATASETS_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(f"Missing dataset file: {filepath}")
    with open(filepath, mode="r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def development_accounts() -> list[dict[str, object]]:
    """Return the established development accounts used by the seed data and tests."""
    return [
        {"id": "usr_analyst_01", "username": "analyst", "email": "priya.narang@disruptioniq.local", "full_name": "Priya Narang", "role": UserRole.OPERATIONS_ANALYST.value, "password": "DisruptionIQ#2026!Analyst", "approval_limit_usd": 0.0},
        {"id": "usr_manager_01", "username": "manager", "email": "marcus.vance@disruptioniq.local", "full_name": "Marcus Vance", "role": UserRole.SUPPLY_CHAIN_MANAGER.value, "password": "DisruptionIQ#2026!Manager", "approval_limit_usd": 50000.0},
        {"id": "usr_manager_02", "username": "manager2", "email": "sarah.chen@disruptioniq.local", "full_name": "Sarah Chen", "role": UserRole.SUPPLY_CHAIN_MANAGER.value, "password": "DisruptionIQ#2026!Manager2", "approval_limit_usd": 50000.0},
        {"id": "usr_wh_01", "username": "warehouse", "email": "soren.lindqvist@disruptioniq.local", "full_name": "Soren Lindqvist", "role": UserRole.WAREHOUSE_OPERATOR.value, "password": "DisruptionIQ#2026!Warehouse", "approval_limit_usd": 10000.0},
        {"id": "usr_proc_01", "username": "procurement", "email": "elena.rostova@disruptioniq.local", "full_name": "Elena Rostova", "role": UserRole.PROCUREMENT_APPROVER.value, "password": "DisruptionIQ#2026!Procure", "approval_limit_usd": 500000.0},
        {"id": "usr_admin_01", "username": "admin", "email": "admin@disruptioniq.local", "full_name": "System Administrator", "role": UserRole.ADMINISTRATOR.value, "password": "DisruptionIQ#2026!Admin", "approval_limit_usd": 1000000.0},
        {"id": "api_user", "username": "api_user", "email": "api_user@disruptioniq.local", "full_name": "API Test Analyst", "role": UserRole.OPERATIONS_ANALYST.value, "password": "DisruptionIQ#2026!ApiUser", "approval_limit_usd": 0.0},
        {"id": "api_director", "username": "api_director", "email": "api_director@disruptioniq.local", "full_name": "API Test Director", "role": UserRole.ADMINISTRATOR.value, "password": "DisruptionIQ#2026!Director", "approval_limit_usd": 500000.0},
        {"id": "smoke_user", "username": "smoke_user", "email": "smoke_user@disruptioniq.local", "full_name": "Smoke Test User", "role": UserRole.OPERATIONS_ANALYST.value, "password": "DisruptionIQ#2026!Smoke", "approval_limit_usd": 0.0},
    ]


def provision_development_users(db: Session | None = None) -> dict[str, int]:
    """Insert missing established development accounts without altering any existing data."""
    database.init_database()
    close_session = db is None
    if db is None:
        db = database.SessionLocal()

    created = 0
    try:
        for acct in development_accounts():
            existing = db.scalar(select(User).where(User.username == acct["username"]))
            if existing:
                continue
            db.add(User(
                id=acct["id"], username=acct["username"], email=acct["email"],
                full_name=acct["full_name"], role=acct["role"],
                password_hash=_cached_hash(str(acct["password"])),
                approval_limit_usd=acct["approval_limit_usd"], is_active=True,
                created_at=datetime.now(), updated_at=datetime.now(),
            ))
            created += 1
        db.commit()
        return {"created": created, "existing": len(development_accounts()) - created}
    except Exception:
        db.rollback()
        raise
    finally:
        if close_session:
            db.close()


def seed_database(db: Session | None = None) -> dict[str, int]:
    """Seed the SQLite database from datasets/*.csv transactionally."""
    # Ensure database file directory exists
    if database.engine.url.database and database.engine.url.drivername.startswith("sqlite"):
        db_file = Path(database.engine.url.database)
        db_file.parent.mkdir(parents=True, exist_ok=True)

    # Ensure tables exist
    database.init_database()

    close_session = False
    if db is None:
        db = database.SessionLocal()
        close_session = True

    counts: dict[str, int] = {}
    try:
        # 1. Clear existing data in reverse foreign key dependency order
        db.execute(delete(PlanAuditEvent))
        db.execute(delete(PlanAllocation))
        db.execute(delete(RecoveryPlan))
        db.execute(delete(DisruptionImpact))
        db.execute(delete(CarrierWebhookEvent))
        db.execute(delete(DisruptionRecord))
        db.execute(delete(OrderLine))
        db.execute(delete(Order))
        db.execute(delete(Shipment))
        db.execute(delete(Inventory))
        db.execute(delete(Supplier))
        db.execute(delete(Warehouse))
        db.execute(delete(User))
        db.flush()

        # 2. Seed Warehouses
        warehouses_rows = read_csv("warehouses.csv")
        for row in warehouses_rows:
            db.add(Warehouse(
                id=row["warehouse_id"],
                name=row["name"],
                location=row["location"],
                city=row["city"],
                country=row["country"],
                total_capacity_sqm=int(row["total_capacity_sqm"]),
                available_dock_doors=int(row["available_dock_doors"]),
                status=row["status"],
            ))
        db.flush()
        counts["warehouses"] = len(warehouses_rows)

        # 3. Seed Suppliers
        suppliers_rows = read_csv("suppliers.csv")
        for row in suppliers_rows:
            db.add(Supplier(
                id=row["supplier_id"],
                name=row["name"],
                country=row["country"],
                category=row["category"],
                tier=row["tier"],
                reliability_score=int(row["reliability_score"]),
                on_time_delivery_rate=parse_decimal(row["on_time_delivery_rate"]),
                average_lead_time_days=int(row["average_lead_time_days"]),
                delay_incidents_last_90d=int(row["delay_incidents_last_90d"]),
                status=row["status"],
                contact_email=row["contact_email"],
            ))
        db.flush()
        counts["suppliers"] = len(suppliers_rows)

        # 4. Seed Inventory
        inventory_rows = read_csv("inventory.csv")
        for row in inventory_rows:
            db.add(Inventory(
                id=row["inventory_id"],
                warehouse_id=row["warehouse_id"],
                warehouse_name=row["warehouse_name"],
                sku=row["sku"],
                sku_description=row["sku_description"],
                category=row["category"],
                on_hand_units=int(row.get("on_hand_units", int(row["available_units"]) + int(row["reserved_units"]))),
                available_units=int(row["available_units"]),
                reserved_units=int(row["reserved_units"]),
                inbound_units=int(row["inbound_units"]),
                safety_stock_threshold=int(row["safety_stock_threshold"]),
                unit_cost_usd=parse_decimal(row["unit_cost_usd"]),
                status=row["status"],
                last_audited_at=parse_datetime(row["last_audited_at"]),
            ))
        db.flush()
        counts["inventory"] = len(inventory_rows)

        # 5. Seed Shipments
        shipments_rows = read_csv("shipments.csv")
        for row in shipments_rows:
            db.add(Shipment(
                id=row["shipment_id"],
                tracking_number=row["tracking_number"],
                carrier_name=row["carrier_name"],
                transport_mode=row["transport_mode"],
                origin=row["origin"],
                destination=row["destination"],
                status=row["status"],
                delay_hours=int(row["delay_hours"]),
                supplier_id=row["supplier_id"],
                supplier_name=row["supplier_name"],
                cargo_description=row["cargo_description"],
                promised_delivery_date=parse_datetime(row["promised_delivery_date"]),
                estimated_delivery_date=parse_datetime(row["estimated_delivery_date"]),
                affected_orders_count=int(row["affected_orders_count"]),
            ))
        db.flush()
        counts["shipments"] = len(shipments_rows)

        # 6. Seed Orders
        orders_rows = read_csv("orders.csv")
        for row in orders_rows:
            db.add(Order(
                id=row["order_id"],
                customer_name=row["customer_name"],
                customer_tier=row["customer_tier"],
                priority=row["priority"],
                promised_deadline=parse_datetime(row["promised_deadline"]),
                hours_until_breach=int(row["hours_until_breach"]),
                order_value_usd=parse_decimal(row["order_value_usd"]),
                risk_score=int(row["risk_score"]),
                risk_level=row["risk_level"],
                mitigation_status=row["mitigation_status"],
                associated_disruption_id=row["associated_disruption_id"] or None,
                primary_warehouse_id=row["primary_warehouse_id"],
                fulfillment_policy=row.get("fulfillment_policy", "FULL_ONLY"),
                explanation=row["explanation"],
            ))
        db.flush()
        counts["orders"] = len(orders_rows)

        # 7. Seed Order Lines
        order_lines_rows = read_csv("order_lines.csv")
        for row in order_lines_rows:
            db.add(OrderLine(
                id=row["order_line_id"],
                order_id=row["order_id"],
                sku=row["sku"],
                sku_description=row["sku_description"],
                quantity=int(row["quantity"]),
                unit_price_usd=parse_decimal(row["unit_price_usd"]),
                line_total_usd=parse_decimal(row["line_total_usd"]),
            ))
        db.flush()
        counts["order_lines"] = len(order_lines_rows)

        # 8. Seed Authenticated RBAC Users
        now = datetime.now()
        dev_accounts = [
            # Operations Analyst
            {
                "id": "usr_analyst_01",
                "username": "analyst",
                "email": "priya.narang@disruptioniq.local",
                "full_name": "Priya Narang",
                "role": UserRole.OPERATIONS_ANALYST.value,
                "password": "DisruptionIQ#2026!Analyst",
                "approval_limit_usd": 0.0,
            },
            # Supply Chain Manager
            {
                "id": "usr_manager_01",
                "username": "manager",
                "email": "marcus.vance@disruptioniq.local",
                "full_name": "Marcus Vance",
                "role": UserRole.SUPPLY_CHAIN_MANAGER.value,
                "password": "DisruptionIQ#2026!Manager",
                "approval_limit_usd": 50000.0,
            },
            # Secondary Supply Chain Manager (for testing separation of duties)
            {
                "id": "usr_manager_02",
                "username": "manager2",
                "email": "sarah.chen@disruptioniq.local",
                "full_name": "Sarah Chen",
                "role": UserRole.SUPPLY_CHAIN_MANAGER.value,
                "password": "DisruptionIQ#2026!Manager2",
                "approval_limit_usd": 50000.0,
            },
            # Warehouse Operator
            {
                "id": "usr_wh_01",
                "username": "warehouse",
                "email": "soren.lindqvist@disruptioniq.local",
                "full_name": "Soren Lindqvist",
                "role": UserRole.WAREHOUSE_OPERATOR.value,
                "password": "DisruptionIQ#2026!Warehouse",
                "approval_limit_usd": 10000.0,
            },
            # Procurement Approver
            {
                "id": "usr_proc_01",
                "username": "procurement",
                "email": "elena.rostova@disruptioniq.local",
                "full_name": "Elena Rostova",
                "role": UserRole.PROCUREMENT_APPROVER.value,
                "password": "DisruptionIQ#2026!Procure",
                "approval_limit_usd": 500000.0,
            },
            # Administrator
            {
                "id": "usr_admin_01",
                "username": "admin",
                "email": "admin@disruptioniq.local",
                "full_name": "System Administrator",
                "role": UserRole.ADMINISTRATOR.value,
                "password": "DisruptionIQ#2026!Admin",
                "approval_limit_usd": 1000000.0,
            },
            # Test suite actor accounts
            {
                "id": "api_user",
                "username": "api_user",
                "email": "api_user@disruptioniq.local",
                "full_name": "API Test Analyst",
                "role": UserRole.OPERATIONS_ANALYST.value,
                "password": "DisruptionIQ#2026!ApiUser",
                "approval_limit_usd": 0.0,
            },
            {
                "id": "api_director",
                "username": "api_director",
                "email": "api_director@disruptioniq.local",
                "full_name": "API Test Director",
                "role": UserRole.ADMINISTRATOR.value,
                "password": "DisruptionIQ#2026!Director",
                "approval_limit_usd": 500000.0,
            },
            {
                "id": "smoke_user",
                "username": "smoke_user",
                "email": "smoke_user@disruptioniq.local",
                "full_name": "Smoke Test User",
                "role": UserRole.OPERATIONS_ANALYST.value,
                "password": "DisruptionIQ#2026!Smoke",
                "approval_limit_usd": 0.0,
            },
        ]

        for acct in dev_accounts:
            db.add(User(
                id=acct["id"],
                username=acct["username"],
                email=acct["email"],
                full_name=acct["full_name"],
                role=acct["role"],
                password_hash=_cached_hash(acct["password"]),
                approval_limit_usd=acct["approval_limit_usd"],
                is_active=True,
                created_at=now,
                updated_at=now,
            ))
        db.flush()
        counts["users"] = len(dev_accounts)

        db.commit()
        return counts

    except Exception:
        db.rollback()
        raise
    finally:
        if close_session:
            db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed DisruptionIQ development data safely.")
    parser.add_argument(
        "--users-only",
        action="store_true",
        help="Add only missing established development accounts; preserve all operational records.",
    )
    args = parser.parse_args()
    print(f"Database Target: {database.engine.url}")
    if args.users_only:
        counts = provision_development_users()
        print("\n[OK] Development user provisioning complete:")
    else:
        print(f"Loading synthetic datasets from: {DATASETS_DIR}")
        counts = seed_database()
        print("\n[OK] Successfully loaded into SQLite database:")
    for entity, count in counts.items():
        print(f"  - {entity:<12}: {count:2d} records")


if __name__ == "__main__":
    main()
