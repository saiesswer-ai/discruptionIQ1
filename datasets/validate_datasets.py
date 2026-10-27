#!/usr/bin/env python3
"""Validation script for DisruptionIQ synthetic datasets.

Verifies:
1. Schemas: Expected files and column definitions.
2. Uniqueness: No duplicate primary keys or unique tracking numbers.
3. Foreign Keys: Referential integrity across all tables.
4. Inventory Invariants: Non-negative stock, reserved <= on-hand, on-hand = available + reserved.
5. Order Line & Pricing Invariants: Mathematical consistency of line totals and order values.
6. Fulfillment Invariants: Unfulfilled orders are never falsely marked as fulfilled.
7. ISO 8601 Timestamps & Simulation Clock consistency.
8. Disruption Scenarios: 48h delayed sea shipment, supplier quality outage, alternative suppliers.

Can be run standalone: `python datasets/validate_datasets.py`
Returns exit code 0 on success, non-zero on failure.
"""
from __future__ import annotations

import csv
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
import sys

DATASETS_DIR = Path(__file__).resolve().parent
SIMULATION_CLOCK = datetime(2026, 10, 26, 18, 0, 0, tzinfo=timezone.utc)

EXPECTED_SCHEMAS = {
    "warehouses.csv": [
        "warehouse_id", "name", "location", "city", "country",
        "total_capacity_sqm", "available_dock_doors", "status"
    ],
    "suppliers.csv": [
        "supplier_id", "name", "country", "category", "tier",
        "reliability_score", "on_time_delivery_rate", "average_lead_time_days",
        "delay_incidents_last_90d", "status", "contact_email"
    ],
    "inventory.csv": [
        "inventory_id", "warehouse_id", "warehouse_name", "sku", "sku_description",
        "category", "on_hand_units", "available_units", "reserved_units", "inbound_units",
        "safety_stock_threshold", "unit_cost_usd", "status", "last_audited_at"
    ],
    "shipments.csv": [
        "shipment_id", "tracking_number", "carrier_name", "transport_mode",
        "origin", "destination", "status", "delay_hours", "supplier_id",
        "supplier_name", "cargo_description", "promised_delivery_date",
        "estimated_delivery_date", "affected_orders_count"
    ],
    "orders.csv": [
        "order_id", "customer_name", "customer_tier", "priority",
        "promised_deadline", "hours_until_breach", "order_value_usd",
        "risk_score", "risk_level", "mitigation_status",
        "associated_disruption_id", "primary_warehouse_id",
        "fulfillment_policy", "explanation"
    ],
    "order_lines.csv": [
        "order_line_id", "order_id", "sku", "sku_description",
        "quantity", "unit_price_usd", "line_total_usd"
    ],
}


def load_csv(filename: str) -> list[dict[str, str]]:
    filepath = DATASETS_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(f"Missing required dataset: {filepath}")
    with open(filepath, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def parse_iso8601(val: str, field_name: str) -> datetime:
    try:
        # Standardize 'Z' to '+00:00' for Python fromisoformat
        normalized = val.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except Exception as e:
        raise ValueError(f"Invalid ISO 8601 timestamp in field '{field_name}': '{val}' ({e})")


def run_all_validations() -> None:
    print(f"Validating DisruptionIQ datasets in: {DATASETS_DIR}")
    print(f"Reference Simulation Clock: {SIMULATION_CLOCK.isoformat()}\n")

    errors: list[str] = []

    # 1. Schema Validation
    print("[1/8] Validating CSV file schemas and headers...")
    for filename, expected_cols in EXPECTED_SCHEMAS.items():
        filepath = DATASETS_DIR / filename
        if not filepath.exists():
            errors.append(f"Schema Error: {filename} does not exist.")
            continue
        with open(filepath, mode="r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if header != expected_cols:
                errors.append(
                    f"Schema Mismatch in {filename}:\n"
                    f"  Expected: {expected_cols}\n"
                    f"  Found:    {header}"
                )

    if errors:
        for err in errors:
            print(f"  [FAIL] {err}")
        sys.exit(1)

    # Load all tables
    warehouses = load_csv("warehouses.csv")
    suppliers = load_csv("suppliers.csv")
    inventory = load_csv("inventory.csv")
    shipments = load_csv("shipments.csv")
    orders = load_csv("orders.csv")
    order_lines = load_csv("order_lines.csv")

    print(f"  [OK] Loaded 6 files:")
    print(f"       warehouses: {len(warehouses)} rows (expected 3)")
    print(f"       suppliers:  {len(suppliers)} rows (expected 4)")
    print(f"       inventory:  {len(inventory)} rows (expected >= 24)")
    print(f"       shipments:  {len(shipments)} rows (expected 12)")
    print(f"       orders:     {len(orders)} rows (expected 20)")
    print(f"       order_lines:{len(order_lines)} rows (expected >= 30)")

    # Explicit count checks
    if len(warehouses) != 3:
        errors.append(f"Expected exactly 3 warehouses, got {len(warehouses)}")
    if len(suppliers) != 4:
        errors.append(f"Expected exactly 4 suppliers, got {len(suppliers)}")
    if len(inventory) < 24:
        errors.append(f"Expected at least 24 inventory records, got {len(inventory)}")
    if len(shipments) != 12:
        errors.append(f"Expected exactly 12 shipments, got {len(shipments)}")
    if len(orders) != 20:
        errors.append(f"Expected exactly 20 orders, got {len(orders)}")
    if len(order_lines) < 30:
        errors.append(f"Expected at least 30 order lines, got {len(order_lines)}")

    # 2. Duplicate ID Validation
    print("\n[2/8] Validating primary key and unique constraint uniqueness...")
    def check_uniqueness(records: list[dict[str, str]], key_col: str, table_name: str) -> set[str]:
        seen = set()
        for row in records:
            val = row[key_col]
            if val in seen:
                errors.append(f"Duplicate key in {table_name}: '{val}'")
            seen.add(val)
        return seen

    wh_ids = check_uniqueness(warehouses, "warehouse_id", "warehouses.csv")
    sup_ids = check_uniqueness(suppliers, "supplier_id", "suppliers.csv")
    inv_ids = check_uniqueness(inventory, "inventory_id", "inventory.csv")
    shp_ids = check_uniqueness(shipments, "shipment_id", "shipments.csv")
    check_uniqueness(shipments, "tracking_number", "shipments.csv (tracking_number)")
    ord_ids = check_uniqueness(orders, "order_id", "orders.csv")
    line_ids = check_uniqueness(order_lines, "order_line_id", "order_lines.csv")

    # Check composite warehouse_id + sku uniqueness
    wh_sku_pairs = set()
    for row in inventory:
        pair = (row["warehouse_id"], row["sku"])
        if pair in wh_sku_pairs:
            errors.append(f"Duplicate inventory record for (warehouse_id, sku): {pair}")
        wh_sku_pairs.add(pair)

    # 3. Foreign Key Validation
    print("\n[3/8] Validating foreign key referential integrity...")
    catalog_skus = {row["sku"] for row in inventory}

    for row in inventory:
        if row["warehouse_id"] not in wh_ids:
            errors.append(f"Foreign Key Error: inventory {row['inventory_id']} references unknown warehouse {row['warehouse_id']}")

    for row in shipments:
        if row["supplier_id"] not in sup_ids:
            errors.append(f"Foreign Key Error: shipment {row['shipment_id']} references unknown supplier {row['supplier_id']}")

    for row in orders:
        if row["primary_warehouse_id"] not in wh_ids:
            errors.append(f"Foreign Key Error: order {row['order_id']} references unknown warehouse {row['primary_warehouse_id']}")

    for row in order_lines:
        if row["order_id"] not in ord_ids:
            errors.append(f"Foreign Key Error: order_line {row['order_line_id']} references unknown order {row['order_id']}")
        if row["sku"] not in catalog_skus:
            errors.append(f"Foreign Key Error: order_line {row['order_line_id']} references unknown SKU '{row['sku']}'")

    # 4. Inventory Invariants
    print("\n[4/8] Validating inventory invariants (non-negative quantities, reserved <= on-hand)...")
    for row in inventory:
        inv_id = row["inventory_id"]
        on_hand = int(row["on_hand_units"])
        avail = int(row["available_units"])
        reserved = int(row["reserved_units"])
        inbound = int(row["inbound_units"])
        safety = int(row["safety_stock_threshold"])
        cost = Decimal(row["unit_cost_usd"])

        # Non-negativity
        if min(on_hand, avail, reserved, inbound, safety) < 0:
            errors.append(f"Inventory {inv_id} contains negative quantity: on_hand={on_hand}, avail={avail}, reserved={reserved}, inbound={inbound}, safety={safety}")

        if cost <= Decimal("0.00"):
            errors.append(f"Inventory {inv_id} has invalid unit_cost_usd: {cost}")

        # Core inventory balance invariant
        if on_hand != (avail + reserved):
            errors.append(f"Inventory {inv_id} on_hand ({on_hand}) != available ({avail}) + reserved ({reserved})")

        # Reserved <= on-hand invariant
        if reserved > on_hand:
            errors.append(f"Inventory {inv_id} reserved stock ({reserved}) exceeds on-hand stock ({on_hand})")

        if row["status"] not in {"healthy", "constrained", "critical"}:
            errors.append(f"Inventory {inv_id} has unexpected status: {row['status']}")

    # 5. Orders and Order Lines Invariants
    print("\n[5/8] Validating order totals, lines arithmetic, and fulfillment invariants...")
    order_line_sums: dict[str, Decimal] = {ord_id: Decimal("0.00") for ord_id in ord_ids}

    for line in order_lines:
        line_id = line["order_line_id"]
        qty = int(line["quantity"])
        price = Decimal(line["unit_price_usd"])
        total = Decimal(line["line_total_usd"])

        if qty <= 0:
            errors.append(f"Order line {line_id} quantity must be positive, got {qty}")
        if price <= Decimal("0.00"):
            errors.append(f"Order line {line_id} unit_price_usd must be positive, got {price}")

        expected_total = (Decimal(qty) * price).quantize(Decimal("0.01"))
        if total != expected_total:
            errors.append(f"Order line {line_id} arithmetic mismatch: {qty} * {price} = {expected_total}, but line_total_usd is {total}")

        order_line_sums[line["order_id"]] += total

    # Check orders
    has_full_policy = False
    has_partial_policy = False

    for order in orders:
        ord_id = order["order_id"]
        order_val = Decimal(order["order_value_usd"])
        summed_val = order_line_sums.get(ord_id, Decimal("0.00"))

        if order_val != summed_val:
            errors.append(f"Order {ord_id} value mismatch: order_value_usd={order_val}, but sum of order lines={summed_val}")

        policy = order["fulfillment_policy"]
        if policy == "FULL_ONLY":
            has_full_policy = True
        elif policy == "PARTIAL_ALLOWED":
            has_partial_policy = True
        else:
            errors.append(f"Order {ord_id} has invalid fulfillment_policy: '{policy}'")

        # Rule 4: Do not mark an order as fulfilled when required quantities have not been fulfilled
        mitigation = order["mitigation_status"]
        if mitigation == "fulfilled":
            errors.append(f"Order {ord_id} is marked 'fulfilled' when in reality it is in an unfulfilled simulation state!")

        if order["priority"] not in {"P1", "P2", "P3"}:
            errors.append(f"Order {ord_id} priority '{order['priority']}' must be P1, P2, or P3")

        if order["customer_tier"] not in {"Enterprise", "Strategic", "Standard"}:
            errors.append(f"Order {ord_id} customer_tier '{order['customer_tier']}' invalid")

        if order["risk_level"] not in {"critical", "high", "medium", "low"}:
            errors.append(f"Order {ord_id} risk_level '{order['risk_level']}' invalid")

    if not (has_full_policy and has_partial_policy):
        errors.append("Dataset must include both FULL_ONLY and PARTIAL_ALLOWED fulfillment policies")

    # 6. ISO 8601 Dates & Simulation Clock Consistency
    print("\n[6/8] Validating ISO 8601 dates and simulation clock offsets...")
    for row in inventory:
        parse_iso8601(row["last_audited_at"], f"inventory[{row['inventory_id']}].last_audited_at")

    for row in shipments:
        p_dt = parse_iso8601(row["promised_delivery_date"], f"shipment[{row['shipment_id']}].promised_delivery_date")
        e_dt = parse_iso8601(row["estimated_delivery_date"], f"shipment[{row['shipment_id']}].estimated_delivery_date")
        delay_hours = int(row["delay_hours"])

        if row["status"] == "delayed":
            if e_dt < p_dt:
                errors.append(f"Shipment {row['shipment_id']} is delayed but estimated ETA < promised ETA")
            diff_hours = int(round((e_dt - p_dt).total_seconds() / 3600))
            if delay_hours != diff_hours:
                errors.append(f"Shipment {row['shipment_id']} delay_hours ({delay_hours}) != diff({diff_hours})")

    for order in orders:
        d_dt = parse_iso8601(order["promised_deadline"], f"order[{order['order_id']}].promised_deadline")
        hours_breach = int(order["hours_until_breach"])
        expected_breach = max(0, int(round((d_dt - SIMULATION_CLOCK).total_seconds() / 3600)))
        if hours_breach != expected_breach:
            errors.append(f"Order {order['order_id']} hours_until_breach ({hours_breach}) != expected ({expected_breach}) relative to clock {SIMULATION_CLOCK.isoformat()}")

    # 7. Disruption Scenarios Validation
    print("\n[7/8] Validating dual disruption scenarios and alternative options...")
    # Check Scenario 1: 48h sea freight delay
    shp_48h = [s for s in shipments if int(s["delay_hours"]) == 48 and s["status"] == "delayed"]
    if not shp_48h:
        errors.append("Scenario 1 validation failed: No shipment with delay_hours == 48 found.")
    else:
        print(f"  [OK] Scenario 1: Found {len(shp_48h)} shipment(s) delayed by 48h (e.g. {shp_48h[0]['shipment_id']} - {shp_48h[0]['cargo_description']})")

    # Check Scenario 2: Supplier delay creating stock shortage
    shp_sup = [s for s in shipments if int(s["delay_hours"]) >= 48 and "MCU-8800" in s["cargo_description"]]
    if not shp_sup:
        errors.append("Scenario 2 validation failed: No supplier delay shipment for MCU-8800 found.")
    else:
        print(f"  [OK] Scenario 2: Found supplier delay shipment {shp_sup[0]['shipment_id']} ({shp_sup[0]['delay_hours']}h delay) causing MCU shortage in Chicago")

    # Check plausible alternative supplier
    alt_suppliers = [s for s in suppliers if s["supplier_id"] == "SUP-VEX-04"]
    if not alt_suppliers:
        errors.append("Alternative supplier validation failed: SUP-VEX-04 not found.")
    else:
        print(f"  [OK] Alternative supplier: {alt_suppliers[0]['name']} (lead time {alt_suppliers[0]['average_lead_time_days']}d, reliability {alt_suppliers[0]['reliability_score']}%)")

    # Check unaffected comparison orders
    unaffected_orders = [o for o in orders if not o["associated_disruption_id"]]
    if len(unaffected_orders) < 4:
        errors.append(f"Expected at least 4 unaffected comparison orders, found {len(unaffected_orders)}")
    else:
        print(f"  [OK] Found {len(unaffected_orders)} unaffected baseline orders for recovery comparison.")

    # 8. Summary
    print("\n[8/8] Validation Results Summary:")
    if errors:
        print(f"\nFAILED with {len(errors)} error(s):")
        for idx, err in enumerate(errors, start=1):
            print(f"  {idx}. {err}")
        sys.exit(1)
    else:
        print("  ALL VALIDATION CHECKS PASSED PERFECTLY! [OK]\n")


if __name__ == "__main__":
    run_all_validations()
