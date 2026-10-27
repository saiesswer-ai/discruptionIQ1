#!/usr/bin/env python3
"""Deterministic synthetic dataset generator for DisruptionIQ supply chain platform.

Generates 6 reproducible CSV datasets with stable identifiers, realistic network
topologies, inventory constraints, and dual disruption scenarios:
1. Maritime sea freight delay (48 hours) affecting Rotterdam hub (DIS-2026-0891).
2. Tier-1 supplier wafer batch hold/shortage affecting Chicago hub (DIS-2026-0894).

Reference Simulation Clock: 2026-10-26T18:00:00Z
Fixed Random Seed: 42
"""
from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import random

# Fixed simulation clock
SIMULATION_CLOCK = datetime(2026, 10, 26, 18, 0, 0, tzinfo=timezone.utc)
SEED = 42

OUTPUT_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Master Catalog Definitions
# ---------------------------------------------------------------------------

SKU_CATALOG = {
    "NVX-9400": {
        "name": "Server Accelerator Board",
        "category": "Compute Accelerators",
        "unit_cost": Decimal("850.00"),
        "unit_price": Decimal("950.00"),
    },
    "ETH-200X": {
        "name": "Dual-Port 100GbE NIC",
        "category": "Networking Modules",
        "unit_cost": Decimal("320.00"),
        "unit_price": Decimal("380.00"),
    },
    "MCU-8800": {
        "name": "Automotive Embedded MCU",
        "category": "Microcontrollers",
        "unit_cost": Decimal("140.00"),
        "unit_price": Decimal("185.00"),
    },
    "PWR-4500": {
        "name": "Redundant 3kW Power Module",
        "category": "Power Systems",
        "unit_cost": Decimal("210.00"),
        "unit_price": Decimal("275.00"),
    },
    "OPT-5000": {
        "name": "High-Speed Optical Transceiver",
        "category": "Optics & Transducers",
        "unit_cost": Decimal("460.00"),
        "unit_price": Decimal("560.00"),
    },
    "CAB-HD12": {
        "name": "High-Density Fiber Loom",
        "category": "Interconnects",
        "unit_cost": Decimal("75.00"),
        "unit_price": Decimal("110.00"),
    },
    "MEM-64GB": {
        "name": "ECC DDR5 Server Memory Kit",
        "category": "Memory Modules",
        "unit_cost": Decimal("180.00"),
        "unit_price": Decimal("240.00"),
    },
    "FAN-9000": {
        "name": "Liquid Cooling Chilled Block",
        "category": "Thermal Solutions",
        "unit_cost": Decimal("125.00"),
        "unit_price": Decimal("170.00"),
    },
}

# ---------------------------------------------------------------------------
# Generators
# ---------------------------------------------------------------------------

def generate_warehouses() -> list[dict[str, str | int]]:
    """Generate exactly 3 distribution hubs."""
    return [
        {
            "warehouse_id": "WH-RTM-01",
            "name": "Rotterdam Central Hub",
            "location": "Maasvlakte Logistics Park",
            "city": "Rotterdam",
            "country": "Netherlands",
            "total_capacity_sqm": 45000,
            "available_dock_doors": 16,
            "status": "active",
        },
        {
            "warehouse_id": "WH-FRA-01",
            "name": "Frankfurt Air Cargo Center",
            "location": "CargoCity South Gateway 3",
            "city": "Frankfurt",
            "country": "Germany",
            "total_capacity_sqm": 28000,
            "available_dock_doors": 12,
            "status": "active",
        },
        {
            "warehouse_id": "WH-ORD-01",
            "name": "Chicago Central Depot",
            "location": "O'Hare Logistics Corridor",
            "city": "Chicago",
            "country": "United States",
            "total_capacity_sqm": 52000,
            "available_dock_doors": 20,
            "status": "active",
        },
    ]


def generate_suppliers() -> list[dict[str, str | int | float]]:
    """Generate exactly 4 suppliers with varying reliability and lead times.

    Includes at least one plausible alternative supplier (SUP-VEX-04) that can
    supply microcontrollers and network cards during primary supplier delays.
    """
    return [
        {
            "supplier_id": "SUP-APX-01",
            "name": "Apex Micro Devices Inc.",
            "country": "Taiwan",
            "category": "Microcontrollers & ASICs",
            "tier": "Tier 1",
            "reliability_score": 78,
            "on_time_delivery_rate": 79.50,
            "average_lead_time_days": 16,
            "delay_incidents_last_90d": 4,
            "status": "conditional",
            "contact_email": "ops@apex-microdevices.fake",
        },
        {
            "supplier_id": "SUP-KYT-02",
            "name": "Kyoto Advanced Substrates",
            "country": "Japan",
            "category": "Compute Accelerators & Packaging",
            "tier": "Tier 1",
            "reliability_score": 94,
            "on_time_delivery_rate": 94.20,
            "average_lead_time_days": 12,
            "delay_incidents_last_90d": 1,
            "status": "preferred",
            "contact_email": "supply-chain@kyoto-substrates.fake",
        },
        {
            "supplier_id": "SUP-BAV-03",
            "name": "Bavaria Sensorik GmbH",
            "country": "Germany",
            "category": "Industrial Optics & Transducers",
            "tier": "Tier 1",
            "reliability_score": 98,
            "on_time_delivery_rate": 97.50,
            "average_lead_time_days": 5,
            "delay_incidents_last_90d": 0,
            "status": "preferred",
            "contact_email": "fulfillment@bavaria-sensorik.fake",
        },
        {
            "supplier_id": "SUP-VEX-04",
            "name": "Vextron Semiconductor Ltd",
            "country": "South Korea",
            "category": "Microcontrollers & Networking Modules",
            "tier": "Tier 2",
            "reliability_score": 88,
            "on_time_delivery_rate": 89.00,
            "average_lead_time_days": 9,
            "delay_incidents_last_90d": 2,
            "status": "preferred",
            "contact_email": "emergency-orders@vextron-semi.fake",
        },
    ]


def generate_inventory() -> list[dict[str, str | int | float]]:
    """Generate 24 warehouse-SKU records (3 warehouses x 8 SKUs).

    Maintains strict supply chain invariants:
    - on_hand_units = available_units + reserved_units
    - reserved_units <= on_hand_units
    - available_units >= 0, reserved_units >= 0, inbound_units >= 0
    - status is 'critical' when available < 50% safety stock, 'constrained' when < 100%, else 'healthy'.
    """
    raw_inventory = [
        # Rotterdam Hub (WH-RTM-01) - Severely constrained on NVX-9400 and ETH-200X
        ("WH-RTM-01", "Rotterdam Central Hub", "NVX-9400", 70, 450, 800, 200, "2026-10-25T14:00:00Z"),
        ("WH-RTM-01", "Rotterdam Central Hub", "ETH-200X", 120, 600, 600, 250, "2026-10-25T14:00:00Z"),
        ("WH-RTM-01", "Rotterdam Central Hub", "MCU-8800", 60, 160, 0, 80, "2026-10-25T16:00:00Z"),
        ("WH-RTM-01", "Rotterdam Central Hub", "PWR-4500", 200, 150, 400, 120, "2026-10-25T18:00:00Z"),
        ("WH-RTM-01", "Rotterdam Central Hub", "OPT-5000", 100, 80, 0, 60, "2026-10-25T20:00:00Z"),
        ("WH-RTM-01", "Rotterdam Central Hub", "CAB-HD12", 300, 150, 0, 150, "2026-10-25T22:00:00Z"),
        ("WH-RTM-01", "Rotterdam Central Hub", "MEM-64GB", 180, 140, 0, 100, "2026-10-26T00:00:00Z"),
        ("WH-RTM-01", "Rotterdam Central Hub", "FAN-9000", 180, 100, 500, 90, "2026-10-26T02:00:00Z"),

        # Frankfurt Air Cargo (WH-FRA-01) - Healthy buffer for inter-hub recovery transfer
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "NVX-9400", 410, 120, 350, 150, "2026-10-26T00:30:00Z"),
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "ETH-200X", 380, 100, 500, 120, "2026-10-26T00:30:00Z"),
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "MCU-8800", 80, 60, 0, 60, "2026-10-25T21:00:00Z"),
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "PWR-4500", 180, 80, 0, 100, "2026-10-25T21:00:00Z"),
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "OPT-5000", 230, 90, 0, 80, "2026-10-25T23:00:00Z"),
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "CAB-HD12", 600, 200, 600, 200, "2026-10-26T01:00:00Z"),
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "MEM-64GB", 220, 70, 0, 90, "2026-10-26T01:30:00Z"),
        ("WH-FRA-01", "Frankfurt Air Cargo Center", "FAN-9000", 170, 50, 0, 70, "2026-10-26T03:00:00Z"),

        # Chicago Central Depot (WH-ORD-01) - Severely constrained on MCU-8800 from supplier outage
        ("WH-ORD-01", "Chicago Central Depot", "NVX-9400", 110, 80, 0, 80, "2026-10-25T21:00:00Z"),
        ("WH-ORD-01", "Chicago Central Depot", "ETH-200X", 120, 90, 0, 90, "2026-10-25T21:00:00Z"),
        ("WH-ORD-01", "Chicago Central Depot", "MCU-8800", 50, 350, 1200, 300, "2026-10-25T21:00:00Z"),
        ("WH-ORD-01", "Chicago Central Depot", "PWR-4500", 110, 200, 0, 150, "2026-10-25T22:00:00Z"),
        ("WH-ORD-01", "Chicago Central Depot", "OPT-5000", 90, 60, 300, 70, "2026-10-25T22:30:00Z"),
        ("WH-ORD-01", "Chicago Central Depot", "CAB-HD12", 260, 120, 0, 120, "2026-10-26T00:00:00Z"),
        ("WH-ORD-01", "Chicago Central Depot", "MEM-64GB", 130, 110, 400, 80, "2026-10-26T02:00:00Z"),
        ("WH-ORD-01", "Chicago Central Depot", "FAN-9000", 120, 70, 0, 60, "2026-10-26T03:30:00Z"),
    ]

    records = []
    for idx, (wh_id, wh_name, sku, avail, reserved, inbound, safety, audit_time) in enumerate(raw_inventory, start=1):
        sku_info = SKU_CATALOG[sku]
        on_hand = avail + reserved
        if avail < int(safety * 0.5):
            status = "critical"
        elif avail < safety:
            status = "constrained"
        else:
            status = "healthy"

        records.append({
            "inventory_id": f"INV-{idx:03d}",
            "warehouse_id": wh_id,
            "warehouse_name": wh_name,
            "sku": sku,
            "sku_description": sku_info["name"],
            "category": sku_info["category"],
            "on_hand_units": on_hand,
            "available_units": avail,
            "reserved_units": reserved,
            "inbound_units": inbound,
            "safety_stock_threshold": safety,
            "unit_cost_usd": f"{sku_info['unit_cost']:.2f}",
            "status": status,
            "last_audited_at": audit_time,
        })
    return records


def generate_shipments() -> list[dict[str, str | int]]:
    """Generate exactly 12 shipments.

    Includes:
    - Critical shipment delayed by 48h (SHP-99214) carrying NVX-9400 to Rotterdam.
    - Associated delayed sea shipment (SHP-99215) carrying ETH-200X to Rotterdam.
    - Supplier delay shipment delayed by 72h (SHP-99220) causing MCU-8800 shortage in Chicago.
    - Customs hold shipment (SHP-99218) delayed by 24h.
    - On-schedule and delivered shipments providing healthy comparison baselines.
    """
    return [
        {
            "shipment_id": "SHP-99214",
            "tracking_number": "MSKU-781920-4",
            "carrier_name": "Maersk Line",
            "transport_mode": "Ocean",
            "origin": "Port of Yokohama",
            "destination": "Rotterdam Maasvlakte",
            "status": "delayed",
            "delay_hours": 48,
            "supplier_id": "SUP-KYT-02",
            "supplier_name": "Kyoto Advanced Substrates",
            "cargo_description": "800x NVX-9400 Accelerator Units",
            "promised_delivery_date": "2026-10-26T06:00:00Z",
            "estimated_delivery_date": "2026-10-28T06:00:00Z",
            "affected_orders_count": 5,
        },
        {
            "shipment_id": "SHP-99215",
            "tracking_number": "MSKU-781921-9",
            "carrier_name": "Maersk Line",
            "transport_mode": "Ocean",
            "origin": "Port of Kaohsiung",
            "destination": "Rotterdam Maasvlakte",
            "status": "delayed",
            "delay_hours": 48,
            "supplier_id": "SUP-APX-01",
            "supplier_name": "Apex Micro Devices Inc.",
            "cargo_description": "600x ETH-200X Networking Cards",
            "promised_delivery_date": "2026-10-26T08:00:00Z",
            "estimated_delivery_date": "2026-10-28T08:00:00Z",
            "affected_orders_count": 4,
        },
        {
            "shipment_id": "SHP-99216",
            "tracking_number": "LH-CARGO-4412",
            "carrier_name": "Lufthansa Cargo",
            "transport_mode": "Air",
            "origin": "Frankfurt CargoCity",
            "destination": "Chicago O'Hare ORD",
            "status": "on_schedule",
            "delay_hours": 0,
            "supplier_id": "SUP-BAV-03",
            "supplier_name": "Bavaria Sensorik GmbH",
            "cargo_description": "300x OPT-5000 Transceiver Units",
            "promised_delivery_date": "2026-10-27T16:00:00Z",
            "estimated_delivery_date": "2026-10-27T16:00:00Z",
            "affected_orders_count": 0,
        },
        {
            "shipment_id": "SHP-99217",
            "tracking_number": "DHL-EX-00918",
            "carrier_name": "DHL Freight",
            "transport_mode": "Road",
            "origin": "Munich Logistics Park",
            "destination": "Rotterdam Central Hub",
            "status": "on_schedule",
            "delay_hours": 0,
            "supplier_id": "SUP-BAV-03",
            "supplier_name": "Bavaria Sensorik GmbH",
            "cargo_description": "400x PWR-4500 Power Units",
            "promised_delivery_date": "2026-10-27T08:00:00Z",
            "estimated_delivery_date": "2026-10-27T08:00:00Z",
            "affected_orders_count": 0,
        },
        {
            "shipment_id": "SHP-99218",
            "tracking_number": "FDX-PRI-3310",
            "carrier_name": "FedEx Priority",
            "transport_mode": "Air",
            "origin": "Taipei Taoyuan TPE",
            "destination": "Chicago O'Hare ORD",
            "status": "customs_hold",
            "delay_hours": 24,
            "supplier_id": "SUP-APX-01",
            "supplier_name": "Apex Micro Devices Inc.",
            "cargo_description": "250x MCU-8800 Pilot MCUs",
            "promised_delivery_date": "2026-10-26T14:00:00Z",
            "estimated_delivery_date": "2026-10-27T14:00:00Z",
            "affected_orders_count": 2,
        },
        {
            "shipment_id": "SHP-99219",
            "tracking_number": "KAL-CARGO-802",
            "carrier_name": "Korean Air Cargo",
            "transport_mode": "Air",
            "origin": "Seoul Incheon ICN",
            "destination": "Frankfurt FRA Hub",
            "status": "on_schedule",
            "delay_hours": 0,
            "supplier_id": "SUP-VEX-04",
            "supplier_name": "Vextron Semiconductor Ltd",
            "cargo_description": "500x ETH-200X NICs",
            "promised_delivery_date": "2026-10-27T12:00:00Z",
            "estimated_delivery_date": "2026-10-27T12:00:00Z",
            "affected_orders_count": 0,
        },
        {
            "shipment_id": "SHP-99220",
            "tracking_number": "ONE-EXP-5591",
            "carrier_name": "Ocean Network Express",
            "transport_mode": "Ocean",
            "origin": "Port of Kaohsiung",
            "destination": "Chicago Hub via LAX",
            "status": "delayed",
            "delay_hours": 72,
            "supplier_id": "SUP-APX-01",
            "supplier_name": "Apex Micro Devices Inc.",
            "cargo_description": "1200x MCU-8800 Microcontrollers",
            "promised_delivery_date": "2026-10-27T10:00:00Z",
            "estimated_delivery_date": "2026-10-30T10:00:00Z",
            "affected_orders_count": 4,
        },
        {
            "shipment_id": "SHP-99221",
            "tracking_number": "NCA-AIR-7711",
            "carrier_name": "Nippon Cargo Airlines",
            "transport_mode": "Air",
            "origin": "Tokyo Narita NRT",
            "destination": "Frankfurt CargoCity",
            "status": "on_schedule",
            "delay_hours": 0,
            "supplier_id": "SUP-KYT-02",
            "supplier_name": "Kyoto Advanced Substrates",
            "cargo_description": "350x NVX-9400 Substrates",
            "promised_delivery_date": "2026-10-28T04:00:00Z",
            "estimated_delivery_date": "2026-10-28T04:00:00Z",
            "affected_orders_count": 0,
        },
        {
            "shipment_id": "SHP-99222",
            "tracking_number": "DBS-ROAD-119",
            "carrier_name": "DB Schenker",
            "transport_mode": "Road",
            "origin": "Stuttgart Hub",
            "destination": "Frankfurt CargoCity",
            "status": "delivered",
            "delay_hours": 0,
            "supplier_id": "SUP-BAV-03",
            "supplier_name": "Bavaria Sensorik GmbH",
            "cargo_description": "600x CAB-HD12 Fiber Looms",
            "promised_delivery_date": "2026-10-26T10:00:00Z",
            "estimated_delivery_date": "2026-10-26T09:30:00Z",
            "affected_orders_count": 0,
        },
        {
            "shipment_id": "SHP-99223",
            "tracking_number": "AAR-CARGO-404",
            "carrier_name": "Asiana Cargo",
            "transport_mode": "Air",
            "origin": "Seoul Incheon ICN",
            "destination": "Chicago O'Hare ORD",
            "status": "on_schedule",
            "delay_hours": 0,
            "supplier_id": "SUP-VEX-04",
            "supplier_name": "Vextron Semiconductor Ltd",
            "cargo_description": "400x MEM-64GB Server Kits",
            "promised_delivery_date": "2026-10-28T18:00:00Z",
            "estimated_delivery_date": "2026-10-28T18:00:00Z",
            "affected_orders_count": 0,
        },
        {
            "shipment_id": "SHP-99224",
            "tracking_number": "DHL-EXP-7702",
            "carrier_name": "DHL Express",
            "transport_mode": "Road",
            "origin": "Nuremberg Tech Center",
            "destination": "Rotterdam Central Hub",
            "status": "on_schedule",
            "delay_hours": 0,
            "supplier_id": "SUP-BAV-03",
            "supplier_name": "Bavaria Sensorik GmbH",
            "cargo_description": "500x FAN-9000 Cooling Blocks",
            "promised_delivery_date": "2026-10-27T14:00:00Z",
            "estimated_delivery_date": "2026-10-27T14:00:00Z",
            "affected_orders_count": 0,
        },
        {
            "shipment_id": "SHP-99225",
            "tracking_number": "HAP-SEA-9901",
            "carrier_name": "Hapag-Lloyd",
            "transport_mode": "Ocean",
            "origin": "Port of Busan",
            "destination": "Rotterdam Maasvlakte",
            "status": "delayed",
            "delay_hours": 24,
            "supplier_id": "SUP-VEX-04",
            "supplier_name": "Vextron Semiconductor Ltd",
            "cargo_description": "300x ETH-200X Network Modules",
            "promised_delivery_date": "2026-10-28T10:00:00Z",
            "estimated_delivery_date": "2026-10-29T10:00:00Z",
            "affected_orders_count": 1,
        },
    ]


def generate_orders_and_lines() -> tuple[list[dict[str, str | int | float]], list[dict[str, str | int | float]]]:
    """Generate exactly 20 orders and at least 30 order lines (38 lines).

    Demonstrates:
    - Multiple priorities: P1 (Critical), P2 (High), P3 (Standard)
    - Full fulfillment policies (FULL_ONLY) vs Partial fulfillment policies (PARTIAL_ALLOWED)
    - Multi-line purchase orders
    - Precise hours_until_breach relative to SIMULATION_CLOCK (2026-10-26T18:00:00Z)
    - Order value exactly equals the sum of line totals
    - None of the disrupted/unfulfilled orders are marked as fulfilled
    """
    raw_orders = [
        # Disruption 1 (DIS-2026-0891): 48h sea delay impacting Rotterdam orders (ORD-8401 to ORD-8408)
        {
            "id": "ORD-8401",
            "customer": "AeroTech Avionics AG",
            "tier": "Enterprise",
            "priority": "P1",
            "deadline": "2026-10-27T08:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "FULL_ONLY",
            "risk_score": 98,
            "risk_level": "critical",
            "status": "unmitigated",
            "lines": [
                ("NVX-9400", 150, Decimal("950.00")),
                ("ETH-200X", 50, Decimal("380.00")),
            ],
            "explanation": "Critical hyperscale aerospace cluster rollout. Strict FULL_ONLY policy; delayed ocean cargo SHP-99214 threatens imminent $15,000/day SLA breach.",
        },
        {
            "id": "ORD-8402",
            "customer": "Nordic Data Grid AB",
            "tier": "Enterprise",
            "priority": "P1",
            "deadline": "2026-10-27T10:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "FULL_ONLY",
            "risk_score": 95,
            "risk_level": "critical",
            "status": "unmitigated",
            "lines": [
                ("NVX-9400", 120, Decimal("950.00")),
                ("ETH-200X", 40, Decimal("380.00")),
            ],
            "explanation": "Stockholm cloud expansion node deployment. Hub stock depleted below safety threshold by vessel berth delay.",
        },
        {
            "id": "ORD-8403",
            "customer": "Bavaria Telecom Networks",
            "tier": "Strategic",
            "priority": "P1",
            "deadline": "2026-10-27T14:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 90,
            "risk_level": "critical",
            "status": "unmitigated",
            "lines": [
                ("ETH-200X", 220, Decimal("380.00")),
                ("CAB-HD12", 100, Decimal("110.00")),
            ],
            "explanation": "Core telecommunications routing backbone. PARTIAL_ALLOWED allows partial dispatch of fiber looms while awaiting NIC cards.",
        },
        {
            "id": "ORD-8404",
            "customer": "Zurich Quantum Labs",
            "tier": "Enterprise",
            "priority": "P2",
            "deadline": "2026-10-27T22:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "FULL_ONLY",
            "risk_score": 82,
            "risk_level": "high",
            "status": "unmitigated",
            "lines": [
                ("NVX-9400", 90, Decimal("950.00")),
                ("MEM-64GB", 60, Decimal("240.00")),
            ],
            "explanation": "Scheduled pilot compute cluster installation. Requires complete delivery for synchronized lab integration.",
        },
        {
            "id": "ORD-8405",
            "customer": "Paris Edge Computing SA",
            "tier": "Strategic",
            "priority": "P2",
            "deadline": "2026-10-28T04:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 76,
            "risk_level": "high",
            "status": "unmitigated",
            "lines": [
                ("ETH-200X", 180, Decimal("380.00")),
                ("FAN-9000", 80, Decimal("170.00")),
            ],
            "explanation": "Edge analytics gateway nodes. Customer accepts partial shipment of cooling blocks ahead of network modules.",
        },
        {
            "id": "ORD-8406",
            "customer": "FinTech High Frequency S.A.",
            "tier": "Enterprise",
            "priority": "P1",
            "deadline": "2026-10-27T12:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "FULL_ONLY",
            "risk_score": 96,
            "risk_level": "critical",
            "status": "unmitigated",
            "lines": [
                ("NVX-9400", 110, Decimal("950.00")),
                ("OPT-5000", 40, Decimal("560.00")),
            ],
            "explanation": "Financial exchange trading engine build. Firm contract breach penalties if delayed past SLA cutoff.",
        },
        {
            "id": "ORD-8407",
            "customer": "Milan Robotics Automation",
            "tier": "Strategic",
            "priority": "P2",
            "deadline": "2026-10-28T12:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 68,
            "risk_level": "medium",
            "status": "unmitigated",
            "lines": [
                ("ETH-200X", 140, Decimal("380.00")),
                ("PWR-4500", 60, Decimal("275.00")),
            ],
            "explanation": "Factory robotics line controller assembly stage 2. Power modules available for immediate dispatch.",
        },
        {
            "id": "ORD-8408",
            "customer": "Krakow Academic Supercomputing",
            "tier": "Standard",
            "priority": "P3",
            "deadline": "2026-10-29T08:00:00Z",
            "disruption": "DIS-2026-0891",
            "wh_id": "WH-RTM-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 42,
            "risk_level": "medium",
            "status": "unmitigated",
            "lines": [
                ("NVX-9400", 30, Decimal("950.00")),
                ("ETH-200X", 20, Decimal("380.00")),
            ],
            "explanation": "University research cluster upgrade. Flexible SLA window; minor delay permissible.",
        },

        # Disruption 2 (DIS-2026-0894): Tier-1 supplier quality hold in Kaohsiung affecting Chicago hub (ORD-8409 to ORD-8414)
        {
            "id": "ORD-8409",
            "customer": "Detroit Mobility Drive Systems",
            "tier": "Enterprise",
            "priority": "P1",
            "deadline": "2026-10-27T16:00:00Z",
            "disruption": "DIS-2026-0894",
            "wh_id": "WH-ORD-01",
            "policy": "FULL_ONLY",
            "risk_score": 94,
            "risk_level": "critical",
            "status": "unmitigated",
            "lines": [
                ("MCU-8800", 250, Decimal("185.00")),
                ("PWR-4500", 100, Decimal("275.00")),
            ],
            "explanation": "Automotive assembly line microcontroller integration. Supplier batch hold creates acute stockout risk; candidate for alternative supplier sourcing (SUP-VEX-04).",
        },
        {
            "id": "ORD-8410",
            "customer": "Midwest EV Powertrain",
            "tier": "Strategic",
            "priority": "P2",
            "deadline": "2026-10-28T08:00:00Z",
            "disruption": "DIS-2026-0894",
            "wh_id": "WH-ORD-01",
            "policy": "FULL_ONLY",
            "risk_score": 80,
            "risk_level": "high",
            "status": "unmitigated",
            "lines": [
                ("MCU-8800", 150, Decimal("185.00")),
                ("CAB-HD12", 80, Decimal("110.00")),
            ],
            "explanation": "Electric vehicle inverter manufacturing. Full lot required for unified batch calibration.",
        },
        {
            "id": "ORD-8411",
            "customer": "Great Lakes Defense Systems",
            "tier": "Enterprise",
            "priority": "P1",
            "deadline": "2026-10-27T20:00:00Z",
            "disruption": "DIS-2026-0894",
            "wh_id": "WH-ORD-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 88,
            "risk_level": "high",
            "status": "unmitigated",
            "lines": [
                ("MCU-8800", 120, Decimal("185.00")),
                ("OPT-5000", 40, Decimal("560.00")),
            ],
            "explanation": "Avionics telemetry processing boards. PARTIAL_ALLOWED allows immediate optical sensor delivery while MCU stock is expedited.",
        },
        {
            "id": "ORD-8412",
            "customer": "Calumet Industrial Automation",
            "tier": "Strategic",
            "priority": "P2",
            "deadline": "2026-10-28T18:00:00Z",
            "disruption": "DIS-2026-0894",
            "wh_id": "WH-ORD-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 70,
            "risk_level": "medium",
            "status": "unmitigated",
            "lines": [
                ("MCU-8800", 80, Decimal("185.00")),
                ("MEM-64GB", 50, Decimal("240.00")),
            ],
            "explanation": "SCADA programmable logic controller refresh. Partial shipment accepted by plant engineering.",
        },
        {
            "id": "ORD-8413",
            "customer": "Rockford Precision Medical",
            "tier": "Strategic",
            "priority": "P3",
            "deadline": "2026-10-29T18:00:00Z",
            "disruption": "DIS-2026-0894",
            "wh_id": "WH-ORD-01",
            "policy": "FULL_ONLY",
            "risk_score": 52,
            "risk_level": "medium",
            "status": "unmitigated",
            "lines": [
                ("MCU-8800", 50, Decimal("185.00")),
                ("PWR-4500", 30, Decimal("275.00")),
            ],
            "explanation": "Medical diagnostic cart sub-assemblies. Requires single coordinated receipt for sterilization protocol.",
        },
        {
            "id": "ORD-8414",
            "customer": "Prairie State Agriculture IoT",
            "tier": "Standard",
            "priority": "P3",
            "deadline": "2026-10-30T06:00:00Z",
            "disruption": "DIS-2026-0894",
            "wh_id": "WH-ORD-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 35,
            "risk_level": "low",
            "status": "unmitigated",
            "lines": [
                ("MCU-8800", 40, Decimal("185.00")),
                ("CAB-HD12", 40, Decimal("110.00")),
            ],
            "explanation": "Field telemetry sensor deployment for upcoming season. Moderate lead-time buffer available.",
        },

        # Unaffected Baseline Orders for comparison (ORD-8415 to ORD-8420)
        {
            "id": "ORD-8415",
            "customer": "Rhine-Main Telematics GmbH",
            "tier": "Enterprise",
            "priority": "P2",
            "deadline": "2026-10-28T14:00:00Z",
            "disruption": "",
            "wh_id": "WH-FRA-01",
            "policy": "FULL_ONLY",
            "risk_score": 15,
            "risk_level": "low",
            "status": "protected",
            "lines": [
                ("OPT-5000", 60, Decimal("560.00")),
                ("CAB-HD12", 150, Decimal("110.00")),
            ],
            "explanation": "Fleet tracking hub hardware. Sourced from healthy Frankfurt stock; no disruption impact.",
        },
        {
            "id": "ORD-8416",
            "customer": "Alpine Renewable Grid AG",
            "tier": "Standard",
            "priority": "P3",
            "deadline": "2026-10-29T12:00:00Z",
            "disruption": "",
            "wh_id": "WH-FRA-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 12,
            "risk_level": "low",
            "status": "protected",
            "lines": [
                ("PWR-4500", 40, Decimal("275.00")),
                ("FAN-9000", 30, Decimal("170.00")),
            ],
            "explanation": "Solar inverter cooling upgrade. Stock on hand in Frankfurt exceeds order reservation demands.",
        },
        {
            "id": "ORD-8417",
            "customer": "Berlin Quantum Computing Labs",
            "tier": "Strategic",
            "priority": "P2",
            "deadline": "2026-10-28T16:00:00Z",
            "disruption": "",
            "wh_id": "WH-FRA-01",
            "policy": "FULL_ONLY",
            "risk_score": 18,
            "risk_level": "low",
            "status": "protected",
            "lines": [
                ("NVX-9400", 50, Decimal("950.00")),
                ("MEM-64GB", 50, Decimal("240.00")),
            ],
            "explanation": "Research cluster expansion. Allocated from Frankfurt's healthy available units (410 available).",
        },
        {
            "id": "ORD-8418",
            "customer": "Cologne Industrial Drives",
            "tier": "Standard",
            "priority": "P3",
            "deadline": "2026-10-30T10:00:00Z",
            "disruption": "",
            "wh_id": "WH-FRA-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 10,
            "risk_level": "low",
            "status": "protected",
            "lines": [
                ("ETH-200X", 40, Decimal("380.00")),
                ("CAB-HD12", 60, Decimal("110.00")),
            ],
            "explanation": "Manufacturing robotics cabling. Fully backed by on-hand inventory in Frankfurt.",
        },
        {
            "id": "ORD-8419",
            "customer": "Twin Cities Health Systems",
            "tier": "Strategic",
            "priority": "P2",
            "deadline": "2026-10-29T04:00:00Z",
            "disruption": "",
            "wh_id": "WH-ORD-01",
            "policy": "FULL_ONLY",
            "risk_score": 20,
            "risk_level": "low",
            "status": "protected",
            "lines": [
                ("OPT-5000", 30, Decimal("560.00")),
                ("MEM-64GB", 40, Decimal("240.00")),
            ],
            "explanation": "Hospital PACS server refresh. Sourced from Chicago inventory lines unaffected by MCU shortage.",
        },
        {
            "id": "ORD-8420",
            "customer": "Rotterdam Marine Navigations",
            "tier": "Standard",
            "priority": "P3",
            "deadline": "2026-10-30T14:00:00Z",
            "disruption": "",
            "wh_id": "WH-RTM-01",
            "policy": "PARTIAL_ALLOWED",
            "risk_score": 14,
            "risk_level": "low",
            "status": "protected",
            "lines": [
                ("PWR-4500", 50, Decimal("275.00")),
                ("CAB-HD12", 80, Decimal("110.00")),
            ],
            "explanation": "Harbor vessel tracking maintenance. Rotterdam warehouse has 200 available power modules; no delay impact.",
        },
    ]

    orders: list[dict[str, str | int | float]] = []
    order_lines: list[dict[str, str | int | float]] = []
    line_counter = 1

    for order in raw_orders:
        order_id = str(order["id"])
        deadline_dt = datetime.fromisoformat(str(order["deadline"]))
        hours_until_breach = int(round((deadline_dt - SIMULATION_CLOCK).total_seconds() / 3600))
        if hours_until_breach < 0:
            hours_until_breach = 0

        total_value = Decimal("0.00")
        for sku, qty, price in order["lines"]:
            line_id = f"LINE-{order_id.replace('ORD-', '')}-{line_counter:02d}"
            line_total = (Decimal(qty) * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            total_value += line_total

            order_lines.append({
                "order_line_id": line_id,
                "order_id": order_id,
                "sku": sku,
                "sku_description": SKU_CATALOG[sku]["name"],
                "quantity": qty,
                "unit_price_usd": f"{price:.2f}",
                "line_total_usd": f"{line_total:.2f}",
            })
            line_counter += 1

        orders.append({
            "order_id": order_id,
            "customer_name": str(order["customer"]),
            "customer_tier": str(order["tier"]),
            "priority": str(order["priority"]),
            "promised_deadline": str(order["deadline"]),
            "hours_until_breach": hours_until_breach,
            "order_value_usd": f"{total_value:.2f}",
            "risk_score": int(order["risk_score"]),
            "risk_level": str(order["risk_level"]),
            "mitigation_status": str(order["status"]),
            "associated_disruption_id": str(order["disruption"]) if order["disruption"] else "",
            "primary_warehouse_id": str(order["wh_id"]),
            "fulfillment_policy": str(order["policy"]),
            "explanation": str(order["explanation"]),
        })

    return orders, order_lines


# ---------------------------------------------------------------------------
# Main Writer Function
# ---------------------------------------------------------------------------

def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    """Write list of dicts to a CSV file deterministically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"  [OK] Wrote {len(rows):2d} rows -> {path.name}")


def generate_all(target_dir: Path | None = None) -> None:
    """Generate all 6 synthetic datasets deterministically."""
    random.seed(SEED)
    out_dir = target_dir or OUTPUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Generating synthetic supply chain datasets (Seed: {SEED}, Clock: {SIMULATION_CLOCK.isoformat()})...")

    # 1. Warehouses (3)
    warehouses = generate_warehouses()
    write_csv(
        out_dir / "warehouses.csv",
        ["warehouse_id", "name", "location", "city", "country", "total_capacity_sqm", "available_dock_doors", "status"],
        warehouses,
    )

    # 2. Suppliers (4)
    suppliers = generate_suppliers()
    write_csv(
        out_dir / "suppliers.csv",
        [
            "supplier_id", "name", "country", "category", "tier", "reliability_score",
            "on_time_delivery_rate", "average_lead_time_days", "delay_incidents_last_90d",
            "status", "contact_email",
        ],
        suppliers,
    )

    # 3. Inventory (24)
    inventory = generate_inventory()
    write_csv(
        out_dir / "inventory.csv",
        [
            "inventory_id", "warehouse_id", "warehouse_name", "sku", "sku_description",
            "category", "on_hand_units", "available_units", "reserved_units", "inbound_units",
            "safety_stock_threshold", "unit_cost_usd", "status", "last_audited_at",
        ],
        inventory,
    )

    # 4. Shipments (12)
    shipments = generate_shipments()
    write_csv(
        out_dir / "shipments.csv",
        [
            "shipment_id", "tracking_number", "carrier_name", "transport_mode", "origin",
            "destination", "status", "delay_hours", "supplier_id", "supplier_name",
            "cargo_description", "promised_delivery_date", "estimated_delivery_date",
            "affected_orders_count",
        ],
        shipments,
    )

    # 5. Orders (20) & Order Lines (38)
    orders, order_lines = generate_orders_and_lines()
    write_csv(
        out_dir / "orders.csv",
        [
            "order_id", "customer_name", "customer_tier", "priority", "promised_deadline",
            "hours_until_breach", "order_value_usd", "risk_score", "risk_level",
            "mitigation_status", "associated_disruption_id", "primary_warehouse_id",
            "fulfillment_policy", "explanation",
        ],
        orders,
    )

    write_csv(
        out_dir / "order_lines.csv",
        ["order_line_id", "order_id", "sku", "sku_description", "quantity", "unit_price_usd", "line_total_usd"],
        order_lines,
    )

    print(f"\nSynthetic datasets successfully generated in: {out_dir}")


if __name__ == "__main__":
    generate_all()
