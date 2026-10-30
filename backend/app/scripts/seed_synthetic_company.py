"""Synthetic Company Dataset Seeder for DisruptionIQ Logistics Pvt. Ltd.

Creates a completely consistent demonstration dataset:
  - 1 company: DisruptionIQ Logistics Pvt. Ltd.
  - 5 warehouses: Frankfurt, Chicago, Singapore, Chennai, Dubai
  - 10 suppliers
  - 20 products / SKUs
  - 100 warehouse-SKU inventory records (5 x 20)
  - 30 shipments
  - 50 customer orders
  - 100 order lines (50 x 2)
  - 10 initial warehouse transfer records (REQUESTED, APPROVED, IN_TRANSIT, RECEIVED, CANCELLED)
  - 8 disruptions (fully linked to entities, shipments, warehouses, and orders)
  - Append-only stock movement ledger history

Safe to run repeatedly: idempotent inserts that never duplicate records or reset existing baseline data.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
import sys

from sqlalchemy import func, select
from sqlalchemy.orm import Session

# Allow running as script or module
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core import database
from app.models.governance import DisruptionImpact, DisruptionRecord
from app.models.supply_chain import (
    Company,
    Inventory,
    Order,
    OrderLine,
    Product,
    Shipment,
    StockMovement,
    Supplier,
    Warehouse,
    WarehouseTransfer,
)


def _dt(iso_str: str) -> datetime:
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


def seed_synthetic_company(db: Session | None = None) -> dict[str, int]:
    """Idempotently seed DisruptionIQ Logistics Pvt. Ltd. demo dataset."""
    database.init_database()
    close_session = False
    if db is None:
        db = database.SessionLocal()
        close_session = True

    counts = {
        "company": 0,
        "warehouses": 0,
        "suppliers": 0,
        "products": 0,
        "inventory": 0,
        "shipments": 0,
        "orders": 0,
        "order_lines": 0,
        "transfers": 0,
        "disruptions": 0,
        "stock_movements": 0,
    }

    try:
        now = datetime(2026, 10, 26, 18, 0, 0, tzinfo=timezone.utc)

        # -------------------------------------------------------------------
        # 1. Company
        # -------------------------------------------------------------------
        company_id = "COMP-DIQ-01"
        company = db.get(Company, company_id)
        if not company:
            company = Company(
                id=company_id,
                name="DisruptionIQ Logistics Pvt. Ltd.",
                code="DIQPL",
                registration_number="U63090TN2026PTC158942",
                headquarters="Chennai, India",
                country="India",
                contact_email="operations@disruptioniq-logistics.demo",
                is_demo=True,
                status="active",
                created_at=now - timedelta(days=90),
            )
            db.add(company)
            db.flush()
            counts["company"] += 1

        # -------------------------------------------------------------------
        # 2. 5 Warehouses (Frankfurt, Chicago, Singapore, Chennai, Dubai)
        # -------------------------------------------------------------------
        warehouses_data = [
            {
                "id": "WH-FRA-02",
                "name": "Frankfurt Intermodal Logistics Hub",
                "location": "CargoCity South Area 4, Gateway Gardens",
                "city": "Frankfurt",
                "country": "Germany",
                "total_capacity_sqm": 38000,
                "available_dock_doors": 16,
                "status": "active",
                "manager_name": "Klaus Schneider",
                "contact_email": "fra.hub@disruptioniq-logistics.demo",
                "max_pallet_capacity": 14000,
            },
            {
                "id": "WH-CHI-01",
                "name": "Chicago Midwest Distribution Center",
                "location": "O'Hare North Cargo Bypass, Des Plaines",
                "city": "Chicago",
                "country": "United States",
                "total_capacity_sqm": 52000,
                "available_dock_doors": 24,
                "status": "active",
                "manager_name": "David Martinez",
                "contact_email": "chi.hub@disruptioniq-logistics.demo",
                "max_pallet_capacity": 18000,
            },
            {
                "id": "WH-SIN-01",
                "name": "Singapore FreePort Gateway",
                "location": "Changi South Aviation Park Sector 3",
                "city": "Singapore",
                "country": "Singapore",
                "total_capacity_sqm": 45000,
                "available_dock_doors": 20,
                "status": "active",
                "manager_name": "Wei-Ming Tan",
                "contact_email": "sin.hub@disruptioniq-logistics.demo",
                "max_pallet_capacity": 16000,
            },
            {
                "id": "WH-CHN-01",
                "name": "Chennai Coastal Logistics Park",
                "location": "Ennore Expressway Logistics Cluster Phase 2",
                "city": "Chennai",
                "country": "India",
                "total_capacity_sqm": 60000,
                "available_dock_doors": 28,
                "status": "active",
                "manager_name": "Ramanathan Iyer",
                "contact_email": "chn.hub@disruptioniq-logistics.demo",
                "max_pallet_capacity": 22000,
            },
            {
                "id": "WH-DXB-01",
                "name": "Dubai JAFZA Free Zone Terminal",
                "location": "Jebel Ali Free Zone Gate 7 Logistics City",
                "city": "Dubai",
                "country": "United Arab Emirates",
                "total_capacity_sqm": 44000,
                "available_dock_doors": 18,
                "status": "active",
                "manager_name": "Tariq Al-Mansoor",
                "contact_email": "dxb.hub@disruptioniq-logistics.demo",
                "max_pallet_capacity": 15000,
            },
        ]
        for w_data in warehouses_data:
            wh = db.get(Warehouse, w_data["id"])
            if not wh:
                wh = Warehouse(
                    id=w_data["id"],
                    name=w_data["name"],
                    location=w_data["location"],
                    city=w_data["city"],
                    country=w_data["country"],
                    total_capacity_sqm=w_data["total_capacity_sqm"],
                    available_dock_doors=w_data["available_dock_doors"],
                    status=w_data["status"],
                    company_id=company_id,
                    is_demo=True,
                    manager_name=w_data["manager_name"],
                    contact_email=w_data["contact_email"],
                    max_pallet_capacity=w_data["max_pallet_capacity"],
                    current_utilization_pct=Decimal("0.0"),
                )
                db.add(wh)
                counts["warehouses"] += 1
        db.flush()

        # Also associate existing warehouses if they don't have a company yet
        for existing_wh_id in ["WH-RTM-01", "WH-FRA-01", "WH-ORD-01"]:
            ewh = db.get(Warehouse, existing_wh_id)
            if ewh and not ewh.company_id:
                ewh.company_id = company_id
        db.flush()

        # -------------------------------------------------------------------
        # 3. 10 Suppliers
        # -------------------------------------------------------------------
        suppliers_data = [
            {
                "id": "SUP-DIQ-01",
                "name": "Bharat Silicon Foundry Ltd.",
                "country": "India",
                "category": "Microcontrollers & Embedded ICs",
                "tier": "Tier 1",
                "reliability_score": 96,
                "on_time_delivery_rate": Decimal("97.2"),
                "average_lead_time_days": 7,
                "delay_incidents_last_90d": 0,
                "status": "preferred",
                "contact_email": "orders@bharatsilicon.demo",
            },
            {
                "id": "SUP-DIQ-02",
                "name": "Rhine MicroPower Systems GmbH",
                "country": "Germany",
                "category": "Power Electronics & Inverters",
                "tier": "Tier 1",
                "reliability_score": 98,
                "on_time_delivery_rate": Decimal("98.9"),
                "average_lead_time_days": 4,
                "delay_incidents_last_90d": 0,
                "status": "preferred",
                "contact_email": "dispatch@rhine-micropower.demo",
            },
            {
                "id": "SUP-DIQ-03",
                "name": "SingaOptics Semiconductor PTE",
                "country": "Singapore",
                "category": "Optics & High-Speed Transceivers",
                "tier": "Tier 1",
                "reliability_score": 95,
                "on_time_delivery_rate": Decimal("95.4"),
                "average_lead_time_days": 6,
                "delay_incidents_last_90d": 1,
                "status": "preferred",
                "contact_email": "fulfillment@singaoptics.demo",
            },
            {
                "id": "SUP-DIQ-04",
                "name": "Midwest Sensor Matrix Corp",
                "country": "United States",
                "category": "Industrial Sensors & Telemetry",
                "tier": "Tier 1",
                "reliability_score": 92,
                "on_time_delivery_rate": Decimal("93.0"),
                "average_lead_time_days": 8,
                "delay_incidents_last_90d": 2,
                "status": "preferred",
                "contact_email": "logistics@midwest-sensors.demo",
            },
            {
                "id": "SUP-DIQ-05",
                "name": "Gulf Interconnect Cabling LLC",
                "country": "United Arab Emirates",
                "category": "Fiber Optics & Cabling Looms",
                "tier": "Tier 2",
                "reliability_score": 89,
                "on_time_delivery_rate": Decimal("90.5"),
                "average_lead_time_days": 9,
                "delay_incidents_last_90d": 2,
                "status": "preferred",
                "contact_email": "supply@gulf-interconnect.demo",
            },
            {
                "id": "SUP-DIQ-06",
                "name": "Tokyo Nanotech Compute Corp",
                "country": "Japan",
                "category": "Compute Accelerators & ASICs",
                "tier": "Tier 1",
                "reliability_score": 97,
                "on_time_delivery_rate": Decimal("97.8"),
                "average_lead_time_days": 10,
                "delay_incidents_last_90d": 1,
                "status": "preferred",
                "contact_email": "export@tokyo-nanotech.demo",
            },
            {
                "id": "SUP-DIQ-07",
                "name": "Seoul High-Bandwidth Memory Ltd",
                "country": "South Korea",
                "category": "DDR5 & Enterprise Storage",
                "tier": "Tier 1",
                "reliability_score": 94,
                "on_time_delivery_rate": Decimal("94.2"),
                "average_lead_time_days": 8,
                "delay_incidents_last_90d": 1,
                "status": "preferred",
                "contact_email": "b2b@seoul-memory.demo",
            },
            {
                "id": "SUP-DIQ-08",
                "name": "Formosa Micro-Packaging Inc",
                "country": "Taiwan",
                "category": "Microcontrollers & Substrates",
                "tier": "Tier 2",
                "reliability_score": 84,
                "on_time_delivery_rate": Decimal("83.5"),
                "average_lead_time_days": 15,
                "delay_incidents_last_90d": 4,
                "status": "conditional",
                "contact_email": "qa@formosa-pkg.demo",
            },
            {
                "id": "SUP-DIQ-09",
                "name": "Nordic Thermal Solutions AB",
                "country": "Sweden",
                "category": "Cooling Pumps & Heat Exchangers",
                "tier": "Tier 2",
                "reliability_score": 91,
                "on_time_delivery_rate": Decimal("91.8"),
                "average_lead_time_days": 11,
                "delay_incidents_last_90d": 2,
                "status": "preferred",
                "contact_email": "orders@nordic-thermal.demo",
            },
            {
                "id": "SUP-DIQ-10",
                "name": "Deccan Embedded Systems Ltd",
                "country": "India",
                "category": "Industrial Gateways & RTK Telematics",
                "tier": "Tier 2",
                "reliability_score": 87,
                "on_time_delivery_rate": Decimal("88.0"),
                "average_lead_time_days": 12,
                "delay_incidents_last_90d": 3,
                "status": "conditional",
                "contact_email": "ops@deccan-embedded.demo",
            },
        ]
        for s_data in suppliers_data:
            sup = db.get(Supplier, s_data["id"])
            if not sup:
                sup = Supplier(
                    id=s_data["id"],
                    name=s_data["name"],
                    country=s_data["country"],
                    category=s_data["category"],
                    tier=s_data["tier"],
                    reliability_score=s_data["reliability_score"],
                    on_time_delivery_rate=s_data["on_time_delivery_rate"],
                    average_lead_time_days=s_data["average_lead_time_days"],
                    delay_incidents_last_90d=s_data["delay_incidents_last_90d"],
                    status=s_data["status"],
                    contact_email=s_data["contact_email"],
                    company_id=company_id,
                    is_demo=True,
                )
                db.add(sup)
                counts["suppliers"] += 1
        db.flush()

        # -------------------------------------------------------------------
        # 4. 20 Products / SKUs
        # -------------------------------------------------------------------
        products_data = [
            ("SKU-ACC-01", "Matrix AI Accelerator Board", "Dense neural compute inference accelerator with PCIe Gen 5 link", "Compute Accelerators", "850.00", "1.4"),
            ("SKU-NIC-02", "Dual-Port 200GbE Optical NIC", "Low-latency network interface card with hardware offload", "Networking Modules", "340.00", "0.6"),
            ("SKU-MCU-03", "ASIL-D Automotive Controller MCU", "High-reliability functional safety microcontroller for drive-by-wire", "Microcontrollers", "160.00", "0.2"),
            ("SKU-PWR-04", "Modular 4kW Titanium Power Module", "96% efficiency hot-swappable enterprise DC power converter", "Power Systems", "240.00", "3.2"),
            ("SKU-OPT-05", "400G Coherent Optical Transceiver", "Dense wavelength division multiplexing pluggable transceiver", "Optics & Transducers", "510.00", "0.3"),
            ("SKU-FIB-06", "Armored MPO-24 Trunk Cable 50m", "Laser-optimized OM4 multi-fiber optical harness", "Interconnects", "88.00", "1.1"),
            ("SKU-MEM-07", "128GB ECC DDR5-5600 Server Kit", "Registered dual-rank server memory kit with on-die ECC", "Memory Modules", "275.00", "0.3"),
            ("SKU-FAN-08", "Vapor Chamber Liquid Chiller Pump", "Dual-impeller ceramic bearing closed-loop liquid cooling assembly", "Thermal Solutions", "150.00", "2.1"),
            ("SKU-SEN-09", "Triaxial High-Bandwidth Vibration Sensor", "Piezoelectric industrial condition monitoring accelerometer", "Industrial Sensors", "115.00", "0.4"),
            ("SKU-CON-10", "Isolated CAN-FD Industrial Gateway", "Dual-channel galvanically isolated bus transceiver module", "Communication Modules", "95.00", "0.5"),
            ("SKU-DSP-11", "Precision Multi-Core Signal DSP", "32-bit floating point high sample rate digital signal processor", "Microcontrollers", "180.00", "0.3"),
            ("SKU-SSD-12", "7.68TB Enterprise U.3 NVMe SSD", "High-endurance power-loss protected datacenter solid state drive", "Storage Modules", "680.00", "0.4"),
            ("SKU-BAT-13", "48V 100Ah LiFePO4 Backup Battery", "Rack-mounted uninterruptible DC reserve storage module", "Power Systems", "620.00", "18.5"),
            ("SKU-ENC-14", "Die-Cast IP67 Gateway Chassis", "Corrosion resistant sealed aluminum enclosure with heat pipe array", "Structural Enclosures", "130.00", "4.8"),
            ("SKU-ANT-15", "5G Beamforming Phased Antenna", "Multi-band high-gain mmWave antenna array with active steer logic", "Telecom & RF", "225.00", "1.8"),
            ("SKU-SWI-16", "32-Port 100G Spine Switch Blade", "Non-blocking Layer 3 datacenter top-of-rack aggregation board", "Networking Modules", "1480.00", "5.6"),
            ("SKU-FUS-17", "High-Speed Pyro-Safety Actuator", "Sub-millisecond high-voltage DC protection breaker", "Power Systems", "68.00", "0.7"),
            ("SKU-REL-18", "Opto-Isolated Solid State Relay 200A", "High-speed switching semiconductor contactor with thermal trip", "Electrical Controls", "82.00", "0.8"),
            ("SKU-TRA-19", "High-Frequency Pulse Step-Down Transformer", "Ferrite planar core magnetic coupling inductor", "Electrical Controls", "54.00", "1.2"),
            ("SKU-GPS-20", "Multi-Constellation RTK GNSS Board", "Centimeter-level positioning receiver with dual-band antenna", "Telematics & Tracking", "195.00", "0.3"),
        ]
        for sku, name, desc, cat, cost, wt in products_data:
            p = db.get(Product, sku)
            if not p:
                p = Product(
                    sku=sku,
                    name=name,
                    description=desc,
                    category=cat,
                    unit_cost_usd=Decimal(cost),
                    weight_kg=Decimal(wt),
                    is_demo=True,
                    status="active",
                )
                db.add(p)
                counts["products"] += 1
        db.flush()

        # -------------------------------------------------------------------
        # 5. 100 Warehouse-SKU Inventory Records (5 Warehouses x 20 SKUs)
        # -------------------------------------------------------------------
        # Pattern of realistic inventory: on_hand = available + reserved
        # Some are healthy, some constrained, some critical (below safety threshold)
        inv_profile = [
            # (avail, reserved, inbound, safety)
            (320, 80, 200, 100),   # 0: Healthy
            (180, 120, 150, 80),   # 1: Healthy
            (60, 180, 300, 100),   # 2: Critical / Below safety
            (40, 60, 100, 80),     # 3: Critical / Below safety
            (210, 50, 0, 90),      # 4: Healthy
            (95, 110, 250, 80),    # 5: Constrained
            (140, 90, 100, 100),   # 6: Healthy
            (25, 120, 400, 80),    # 7: Critical (Shortage hotspot)
            (310, 40, 0, 70),      # 8: Healthy
            (500, 100, 200, 120),  # 9: Very healthy
            (15, 140, 350, 80),    # 10: Critical (Shortage hotspot)
            (85, 45, 100, 60),     # 11: Healthy
            (110, 80, 120, 75),    # 12: Healthy
            (220, 60, 0, 90),      # 13: Healthy
            (45, 75, 180, 70),     # 14: Critical
            (70, 30, 50, 50),      # 15: Healthy
            (350, 90, 0, 100),     # 16: Healthy
            (190, 60, 80, 80),     # 17: Healthy
            (260, 40, 100, 90),    # 18: Healthy
            (130, 70, 150, 60),    # 19: Healthy
        ]

        for w_idx, w_data in enumerate(warehouses_data):
            wh_id = w_data["id"]
            wh_name = w_data["name"]

            for p_idx, prod_info in enumerate(products_data):
                sku, name, desc, cat, cost, _ = prod_info
                inv_id = f"INV-{wh_id}-{sku}"
                existing_inv = db.get(Inventory, inv_id)
                if existing_inv:
                    continue

                # Vary parameters per warehouse to avoid identical numbers
                base_avail, base_res, base_inbound, base_safety = inv_profile[(p_idx + w_idx * 3) % len(inv_profile)]
                mult = 1.0 + (w_idx * 0.15)
                avail = int(base_avail * mult)
                res = int(base_res * mult)
                inbound = int(base_inbound * mult)
                safety = int(base_safety * mult)
                on_hand = avail + res

                if avail <= 0:
                    status_str = "depleted"
                elif avail < safety:
                    status_str = "critical"
                elif avail < int(safety * 1.5):
                    status_str = "constrained"
                else:
                    status_str = "healthy"

                item = Inventory(
                    id=inv_id,
                    warehouse_id=wh_id,
                    warehouse_name=wh_name,
                    sku=sku,
                    sku_description=desc,
                    category=cat,
                    on_hand_units=on_hand,
                    available_units=avail,
                    reserved_units=res,
                    inbound_units=inbound,
                    safety_stock_threshold=safety,
                    unit_cost_usd=Decimal(cost),
                    status=status_str,
                    last_audited_at=now - timedelta(days=p_idx % 7),
                    is_demo=True,
                )
                db.add(item)
                counts["inventory"] += 1

                # Initial ledger record
                db.add(
                    StockMovement(
                        id=f"MVT-INIT-{wh_id}-{sku}",
                        timestamp=now - timedelta(days=14),
                        movement_type="RECEIPT",
                        warehouse_id=wh_id,
                        sku=sku,
                        quantity=on_hand,
                        balance_before=0,
                        balance_after=on_hand,
                        reference_type="OPENING_BALANCE",
                        reference_id=f"AUDIT-2026-Q4-{wh_id}",
                        actor_id="system_inventory_seeder",
                        notes=f"Initial audited opening balance for {sku} at {wh_id}",
                        is_demo=True,
                    )
                )
                counts["stock_movements"] += 1
        db.flush()

        # -------------------------------------------------------------------
        # 6. 30 Shipments (connecting suppliers to demo warehouses)
        # -------------------------------------------------------------------
        shipments_specs = [
            ("DIQ-SHP-001", "MAERSK-IN-9101", "Maersk Line", "Ocean", "Port of Chennai", "FrankfurtFRA via Rotterdam", "delayed", 48, "SUP-DIQ-01", "800x Matrix AI Accelerators", 1, 3, 5),
            ("DIQ-SHP-002", "LH-CARGO-8812", "Lufthansa Cargo", "Air", "Frankfurt Airport", "Chicago O'Hare ORD", "on_schedule", 0, "SUP-DIQ-02", "500x Titanium Power Modules", 2, 2, 0),
            ("DIQ-SHP-003", "SIA-CARGO-3301", "Singapore Airlines Cargo", "Air", "Singapore Changi SIN", "Chennai MAA Airport", "on_schedule", 0, "SUP-DIQ-03", "600x 400G Optical Transceivers", 3, 4, 0),
            ("DIQ-SHP-004", "FEDEX-EXP-4491", "FedEx Express", "Air", "Chicago O'Hare ORD", "Dubai DXB Airport", "on_schedule", 0, "SUP-DIQ-04", "450x Triaxial Vibration Sensors", 4, 5, 0),
            ("DIQ-SHP-005", "HAPAG-ME-7721", "Hapag-Lloyd", "Ocean", "Jebel Ali Port", "Port of Singapore", "delayed", 36, "SUP-DIQ-05", "1200x MPO-24 Armored Fibers", 5, 3, 4),
            ("DIQ-SHP-006", "NCA-CARGO-1109", "Nippon Cargo Airlines", "Air", "Tokyo Narita NRT", "Frankfurt FRA Hub", "on_schedule", 0, "SUP-DIQ-06", "400x Matrix AI Accelerators", 6, 1, 0),
            ("DIQ-SHP-007", "KOREAN-AIR-664", "Korean Air Cargo", "Air", "Seoul Incheon ICN", "Chicago ORD Depot", "on_schedule", 0, "SUP-DIQ-07", "700x 128GB DDR5 Server Kits", 7, 2, 0),
            ("DIQ-SHP-008", "EVERGREEN-TW-22", "Evergreen Marine", "Ocean", "Port of Kaohsiung", "Chennai Port", "delayed", 72, "SUP-DIQ-08", "1500x Automotive MCUs", 8, 4, 6),
            ("DIQ-SHP-009", "SAS-CARGO-5511", "SAS Cargo", "Air", "Stockholm Arlanda", "Frankfurt FRA Hub", "on_schedule", 0, "SUP-DIQ-09", "350x Liquid Chiller Pumps", 9, 1, 0),
            ("DIQ-SHP-010", "BLUEDART-EXP-01", "Blue Dart Express", "Air", "Bengaluru BLR", "Dubai DXB Terminal", "on_schedule", 0, "SUP-DIQ-10", "400x RTK GNSS Receiver Boards", 10, 5, 0),
            ("DIQ-SHP-011", "MAERSK-IN-9102", "Maersk Line", "Ocean", "Port of Chennai", "Dubai JAFZA Port", "customs_hold", 24, "SUP-DIQ-01", "1000x ASIL-D MCUs", 1, 5, 2),
            ("DIQ-SHP-012", "DB-SCHENKER-33", "DB Schenker", "Road", "Stuttgart Hub", "Frankfurt Logistics Hub", "delivered", 0, "SUP-DIQ-02", "400x 4kW Power Modules", 2, 1, 0),
            ("DIQ-SHP-013", "DHL-GLOBAL-991", "DHL Global Forwarding", "Air", "Singapore SIN", "Chicago ORD Depot", "on_schedule", 0, "SUP-DIQ-03", "300x 400G Transceivers", 3, 2, 0),
            ("DIQ-SHP-014", "UPS-AIR-7720", "UPS Air Freight", "Air", "Chicago ORD", "Frankfurt FRA Center", "on_schedule", 0, "SUP-DIQ-04", "500x Industrial Sensors", 4, 1, 0),
            ("DIQ-SHP-015", "EMIRATES-SKY-81", "Emirates SkyCargo", "Air", "Dubai Al Maktoum", "Singapore SIN FreePort", "on_schedule", 0, "SUP-DIQ-05", "800x Fiber Trunk Cables", 5, 3, 0),
            ("DIQ-SHP-016", "ONE-OCEAN-4481", "Ocean Network Express", "Ocean", "Yokohama Port", "Chennai Port", "delayed", 30, "SUP-DIQ-06", "600x AI Compute Boards", 6, 4, 3),
            ("DIQ-SHP-017", "ASIANA-AIR-990", "Asiana Cargo", "Air", "Seoul ICN", "Frankfurt FRA Hub", "on_schedule", 0, "SUP-DIQ-07", "450x DDR5 Server Kits", 7, 1, 0),
            ("DIQ-SHP-018", "YANG-MING-552", "Yang Ming Marine", "Ocean", "Keelung Port", "Dubai Jebel Ali", "delayed", 40, "SUP-DIQ-08", "900x CAN-FD Modules", 8, 5, 3),
            ("DIQ-SHP-019", "FINNAIR-CARGO-2", "Finnair Cargo", "Air", "Helsinki HEL", "Chicago ORD Depot", "on_schedule", 0, "SUP-DIQ-09", "280x Chiller Pumps", 9, 2, 0),
            ("DIQ-SHP-020", "AIR-INDIA-CARGO", "Air India Cargo", "Air", "Chennai MAA", "Singapore SIN Terminal", "on_schedule", 0, "SUP-DIQ-10", "350x GNSS Receiver Boards", 10, 3, 0),
            ("DIQ-SHP-021", "CMA-CGM-EU-101", "CMA CGM", "Ocean", "Port of Colombo", "Frankfurt via Hamburg", "on_schedule", 0, "SUP-DIQ-01", "850x Signal DSP Processors", 1, 1, 0),
            ("DIQ-SHP-022", "DHL-ROAD-EURO-4", "DHL Freight", "Road", "Munich Cargo Terminal", "Frankfurt FRA Center", "on_schedule", 0, "SUP-DIQ-02", "300x Solid State Relays", 2, 1, 0),
            ("DIQ-SHP-023", "SINGAPORE-POST-9", "Singapore Post Air", "Air", "Singapore SIN", "Dubai DXB Terminal", "on_schedule", 0, "SUP-DIQ-03", "400x 200GbE Optical NICs", 3, 5, 0),
            ("DIQ-SHP-024", "EXPEDITORS-US-8", "Expeditors International", "Air", "Detroit DTW", "Chicago ORD Hub", "delivered", 0, "SUP-DIQ-04", "600x Industrial Sensors", 4, 2, 0),
            ("DIQ-SHP-025", "ARAMEX-GULF-331", "Aramex Freight", "Road", "Abu Dhabi Hub", "Dubai JAFZA Hub", "on_schedule", 0, "SUP-DIQ-05", "500x Sealed Enclosures", 5, 5, 0),
            ("DIQ-SHP-026", "ANA-CARGO-7740", "All Nippon Airways Cargo", "Air", "Tokyo HND", "Chicago ORD Terminal", "on_schedule", 0, "SUP-DIQ-06", "320x Spine Switch Blades", 6, 2, 0),
            ("DIQ-SHP-027", "HYUNDAI-GLOVIS-1", "Hyundai Glovis", "Ocean", "Busan Port", "Singapore Jurong", "delayed", 24, "SUP-DIQ-07", "800x 7.68TB NVMe SSDs", 7, 3, 2),
            ("DIQ-SHP-028", "WAN-HAI-LINES-8", "Wan Hai Lines", "Ocean", "Kaohsiung Port", "Chennai Harbour", "on_schedule", 0, "SUP-DIQ-08", "1100x Pyro-Safety Modules", 8, 4, 0),
            ("DIQ-SHP-029", "VOLVO-LOGISTICS-7", "Volvo Logistics Road", "Road", "Gothenburg Terminal", "Frankfurt FRA Hub", "delivered", 0, "SUP-DIQ-09", "250x Chiller Pumps", 9, 1, 0),
            ("DIQ-SHP-030", "CONCOR-RAIL-IN-5", "Container Corp of India", "Rail", "Hyderabad ICD", "Chennai Coastal Hub", "on_schedule", 0, "SUP-DIQ-10", "450x Pulse Transformers", 10, 4, 0),
        ]

        wh_map = {1: "WH-FRA-02", 2: "WH-CHI-01", 3: "WH-SIN-01", 4: "WH-CHN-01", 5: "WH-DXB-01"}
        for s_spec in shipments_specs:
            (
                shp_id, trk, carrier, mode, origin, dest, st, delay_h, sup_id, cargo,
                sup_idx, wh_idx, aff_cnt
            ) = s_spec
            existing_shp = db.get(Shipment, shp_id)
            if existing_shp:
                continue

            target_wh_id = wh_map[wh_idx]
            sup = db.get(Supplier, sup_id)
            sup_name = sup.name if sup else "Enterprise Partner"
            p_date = now + timedelta(days=(int(shp_id[-2:]) % 5) - 2)
            e_date = p_date + timedelta(hours=delay_h)

            shp = Shipment(
                id=shp_id,
                tracking_number=trk,
                carrier_name=carrier,
                transport_mode=mode,
                origin=origin,
                destination=dest,
                status=st,
                delay_hours=delay_h,
                supplier_id=sup_id,
                supplier_name=sup_name,
                cargo_description=cargo,
                promised_delivery_date=p_date,
                estimated_delivery_date=e_date,
                affected_orders_count=aff_cnt,
                destination_warehouse_id=target_wh_id,
                last_event_at=now,
                is_demo=True,
            )
            db.add(shp)
            counts["shipments"] += 1
        db.flush()

        # -------------------------------------------------------------------
        # 7. 50 Customer Orders & 100 Order Lines (50 x 2 lines)
        # -------------------------------------------------------------------
        customer_names = [
            ("Siemens Healthineers AG", "Enterprise"),
            ("Bosch Mobility Solutions", "Enterprise"),
            ("Tata Motors Electric Drive", "Enterprise"),
            ("Schneider Electric SA", "Enterprise"),
            ("Emirates Global Transport", "Enterprise"),
            ("Micron Technology Singapore", "Enterprise"),
            ("Abbott Precision Labs", "Strategic"),
            ("Caterpillar Autonomous Systems", "Strategic"),
            ("Larsen & Toubro Defense", "Strategic"),
            ("Continental Automotive Systems", "Strategic"),
            ("STMicroelectronics Asia", "Strategic"),
            ("Boeing Commercial Space", "Enterprise"),
            ("Nokia Cloud Networks", "Strategic"),
            ("Foxconn Industrial Internet", "Strategic"),
            ("Dubai Ports World Tech", "Strategic"),
            ("Infosys High-Tech Infrastructure", "Standard"),
            ("Alstom Rail Systems", "Standard"),
            ("Wipro Engineering Edge", "Standard"),
            ("Collins Aerospace Systems", "Enterprise"),
            ("Hitachi High-Tech Instruments", "Standard"),
            ("Medtronic Surgical Robotics", "Enterprise"),
            ("Thales Defense & Security", "Enterprise"),
            ("Cummins Power Systems", "Strategic"),
            ("Brocade Datacenter Fabric", "Strategic"),
            ("Danfoss Drives Solutions", "Standard"),
        ]

        # 50 orders
        for i in range(1, 51):
            ord_id = f"DIQ-ORD-{100 + i}"
            existing_ord = db.get(Order, ord_id)
            if existing_ord:
                continue

            cust_name, cust_tier = customer_names[(i - 1) % len(customer_names)]
            wh_assigned = wh_map[((i - 1) % 5) + 1]

            # Priority distribution: P1: ~35%, P2: ~40%, P3: ~25%
            if i % 3 == 1:
                prio = "P1"
                hours_until_breach = 12 + (i % 8) * 2
                base_risk = 85 + (i % 12)
                r_level = "critical"
            elif i % 3 == 2:
                prio = "P2"
                hours_until_breach = 28 + (i % 12) * 2
                base_risk = 65 + (i % 10)
                r_level = "high"
            else:
                prio = "P3"
                hours_until_breach = 60 + (i % 15) * 2
                base_risk = 25 + (i % 15)
                r_level = "low" if base_risk < 30 else "medium"

            # 2 Order Lines per Order
            sku1_idx = (i * 2 - 1) % 20
            sku2_idx = (i * 2) % 20
            sku1_info = products_data[sku1_idx]
            sku2_info = products_data[sku2_idx]

            qty1 = 15 + ((i * 7) % 40)
            qty2 = 20 + ((i * 11) % 50)
            price1 = Decimal(sku1_info[4])
            price2 = Decimal(sku2_info[4])
            total1 = qty1 * price1
            total2 = qty2 * price2
            order_val = total1 + total2

            # Policy
            policy = "FULL_ONLY" if prio == "P1" else "PARTIAL_ALLOWED"
            status_mit = "unmitigated" if base_risk >= 70 else "protected"

            ord_obj = Order(
                id=ord_id,
                customer_name=cust_name,
                customer_tier=cust_tier,
                priority=prio,
                promised_deadline=now + timedelta(hours=hours_until_breach),
                hours_until_breach=hours_until_breach,
                order_value_usd=order_val,
                risk_score=min(100, base_risk),
                risk_level=r_level,
                mitigation_status=status_mit,
                associated_disruption_id=None,
                primary_warehouse_id=wh_assigned,
                fulfillment_policy=policy,
                explanation=f"Strategic demand commitment fulfillment at {wh_assigned}.",
                is_demo=True,
            )
            db.add(ord_obj)
            counts["orders"] += 1

            # Line 1
            line1_id = f"DIQ-OL-{100 + i}-1"
            db.add(
                OrderLine(
                    id=line1_id,
                    order_id=ord_id,
                    sku=sku1_info[0],
                    sku_description=sku1_info[1],
                    quantity=qty1,
                    unit_price_usd=price1,
                    line_total_usd=total1,
                    is_demo=True,
                )
            )
            # Line 2
            line2_id = f"DIQ-OL-{100 + i}-2"
            db.add(
                OrderLine(
                    id=line2_id,
                    order_id=ord_id,
                    sku=sku2_info[0],
                    sku_description=sku2_info[1],
                    quantity=qty2,
                    unit_price_usd=price2,
                    line_total_usd=total2,
                    is_demo=True,
                )
            )
            counts["order_lines"] += 2
        db.flush()

        # -------------------------------------------------------------------
        # 8. 10 Initial Warehouse Transfer Records (Diverse Lifecycle States)
        # -------------------------------------------------------------------
        transfers_specs = [
            # id, from, to, sku, qty, status, reason
            ("DIQ-TRF-001", "WH-FRA-02", "WH-CHI-01", "SKU-ACC-01", 40, "REQUESTED", "Emergency buffer replenishment for Midwest EV line"),
            ("DIQ-TRF-002", "WH-SIN-01", "WH-CHN-01", "SKU-NIC-02", 50, "REQUESTED", "Telecom backbone installation stock balancing"),
            ("DIQ-TRF-003", "WH-CHI-01", "WH-FRA-02", "SKU-PWR-04", 30, "APPROVED", "European server rack deployment preparation"),
            ("DIQ-TRF-004", "WH-CHN-01", "WH-DXB-01", "SKU-MCU-03", 60, "APPROVED", "Middle East smart city telematics contract fulfillment"),
            ("DIQ-TRF-005", "WH-FRA-02", "WH-SIN-01", "SKU-OPT-05", 25, "IN_TRANSIT", "Air expedite transfer for Singapore hyperscale cluster"),
            ("DIQ-TRF-006", "WH-DXB-01", "WH-FRA-02", "SKU-FIB-06", 80, "IN_TRANSIT", "Cross-dock rebalance for Frankfurt datacenter expansion"),
            ("DIQ-TRF-007", "WH-SIN-01", "WH-CHI-01", "SKU-MEM-07", 45, "IN_TRANSIT", "High-priority memory replenishment for medical robotics"),
            ("DIQ-TRF-008", "WH-CHN-01", "WH-FRA-02", "SKU-SEN-09", 50, "RECEIVED", "Completed stock rebalance of vibration sensors"),
            ("DIQ-TRF-009", "WH-DXB-01", "WH-CHN-01", "SKU-CON-10", 35, "RECEIVED", "Automotive gateway module inter-hub replenishment"),
            ("DIQ-TRF-010", "WH-CHI-01", "WH-SIN-01", "SKU-FAN-08", 20, "CANCELLED", "Order cancelled by customer; transfer aborted"),
        ]

        for trf_spec in transfers_specs:
            t_id, f_wh, t_wh, sku_code, qty, st, rsn = trf_spec
            existing_trf = db.get(WarehouseTransfer, t_id)
            if existing_trf:
                continue

            app_by = "manager" if st in ("APPROVED", "IN_TRANSIT", "RECEIVED") else None
            app_at = now - timedelta(hours=36) if app_by else None
            disp_by = "warehouse" if st in ("IN_TRANSIT", "RECEIVED") else None
            disp_at = now - timedelta(hours=24) if disp_by else None
            recv_by = "warehouse" if st == "RECEIVED" else None
            recv_at = now - timedelta(hours=6) if recv_by else None
            canc_by = "manager" if st == "CANCELLED" else None
            canc_at = now - timedelta(hours=12) if canc_by else None

            trf = WarehouseTransfer(
                id=t_id,
                source_warehouse_id=f_wh,
                destination_warehouse_id=t_wh,
                sku=sku_code,
                quantity=qty,
                status=st,
                reason=rsn,
                requested_by="analyst",
                requested_at=now - timedelta(hours=48),
                approved_by=app_by,
                approved_at=app_at,
                dispatched_by=disp_by,
                dispatched_at=disp_at,
                received_by=recv_by,
                received_at=recv_at,
                cancelled_by=canc_by,
                cancelled_at=canc_at,
                cancellation_reason="Rebalance no longer necessary" if canc_by else None,
                expected_arrival=now + timedelta(hours=18) if st == "IN_TRANSIT" else None,
                tracking_reference=f"DIQ-XFER-{t_id[-3:]}" if st in ("IN_TRANSIT", "RECEIVED") else None,
                authorization_code=f"AUTH-XFER-{t_id[-4:]}",
                is_demo=True,
            )
            db.add(trf)
            counts["transfers"] += 1

            # Adjust source/dest inventory records to be consistent with transfer state!
            src_item = db.scalar(select(Inventory).where(Inventory.warehouse_id == f_wh, Inventory.sku == sku_code))
            dest_item = db.scalar(select(Inventory).where(Inventory.warehouse_id == t_wh, Inventory.sku == sku_code))

            if st == "IN_TRANSIT":
                if src_item and src_item.available_units >= qty:
                    src_item.available_units -= qty
                    src_item.reserved_units += qty
                if dest_item:
                    dest_item.inbound_units += qty

            elif st == "RECEIVED":
                # Record ledger movements for the already-completed transfers
                if src_item and dest_item:
                    db.add(
                        StockMovement(
                            id=f"MVT-TRF-OUT-{t_id}",
                            timestamp=now - timedelta(hours=10),
                            movement_type="TRANSFER_OUT",
                            warehouse_id=f_wh,
                            sku=sku_code,
                            quantity=qty,
                            balance_before=src_item.on_hand_units + qty,
                            balance_after=src_item.on_hand_units,
                            reference_type="TRANSFER",
                            reference_id=t_id,
                            actor_id="warehouse",
                            notes=f"Completed stock transfer out to {t_wh}",
                            is_demo=True,
                        )
                    )
                    db.add(
                        StockMovement(
                            id=f"MVT-TRF-IN-{t_id}",
                            timestamp=now - timedelta(hours=6),
                            movement_type="TRANSFER_IN",
                            warehouse_id=t_wh,
                            sku=sku_code,
                            quantity=qty,
                            balance_before=dest_item.on_hand_units - qty,
                            balance_after=dest_item.on_hand_units,
                            reference_type="TRANSFER",
                            reference_id=t_id,
                            actor_id="warehouse",
                            notes=f"Stock received from {f_wh} via transfer {t_id}",
                            is_demo=True,
                        )
                    )
                    counts["stock_movements"] += 2
        db.flush()

        # -------------------------------------------------------------------
        # 9. 8 Disruptions (Clearly articulated and relationally consistent)
        # -------------------------------------------------------------------
        disruptions_specs = [
            {
                "id": "DIS-DIQ-01",
                "title": "Port of Chennai Severe Cyclone Advisory & Berth Closure",
                "severity": "critical",
                "status": "active",
                "detected_at": now - timedelta(hours=14),
                "source_key": "canonical:DIS-DIQ-01",
                "payload": {
                    "type": "carrier_delay",
                    "typeLabel": "Coastal Port Weather Disruption",
                    "delayHours": 48,
                    "location": "Bay of Bengal / Port of Chennai Container Basin",
                    "carrierOrSupplier": "Maersk Line & Evergreen Marine",
                    "estimatedFinancialImpactUSD": 340000,
                    "summary": "Severe weather alert enacted by Chennai Port Trust; container terminals ceased gantry operations for 48 hours.",
                    "rootCause": "Bay of Bengal deep depression escalated into cyclonic storm; berth operations halted.",
                    "affectedOrderCount": 6,
                    "affectedSKUs": ["SKU-ACC-01", "SKU-MCU-03"],
                    "linkedShipmentIds": ["DIQ-SHP-001", "DIQ-SHP-008"],
                    "linkedWarehouseIds": ["WH-CHN-01"],
                },
                "impacts": [
                    ("shipment", "DIQ-SHP-001", {"kind": "delayed_shipment", "facts": {"delayHours": 48}}),
                    ("shipment", "DIQ-SHP-008", {"kind": "delayed_shipment", "facts": {"delayHours": 72}}),
                    ("warehouse", "WH-CHN-01", {"kind": "affected_hub", "facts": {"hubCode": "WH-CHN-01"}}),
                    ("sku", "SKU-ACC-01", {"kind": "affected_sku", "facts": {"sku": "SKU-ACC-01"}}),
                    ("sku", "SKU-MCU-03", {"kind": "affected_sku", "facts": {"sku": "SKU-MCU-03"}}),
                    ("order", "DIQ-ORD-101", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 95}}),
                    ("order", "DIQ-ORD-104", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 92}}),
                    ("order", "DIQ-ORD-107", {"kind": "at_risk_order", "facts": {"priority": "P2", "riskScore": 78}}),
                ],
            },
            {
                "id": "DIS-DIQ-02",
                "title": "Frankfurt CargoCity South Ground Handler Walkout",
                "severity": "critical",
                "status": "active",
                "detected_at": now - timedelta(hours=10),
                "source_key": "canonical:DIS-DIQ-02",
                "payload": {
                    "type": "carrier_delay",
                    "typeLabel": "Airport Cargo Ground Logistics Halt",
                    "delayHours": 36,
                    "location": "Frankfurt Airport (FRA) CargoCity South",
                    "carrierOrSupplier": "Lufthansa Cargo & Fraport Ground Handling",
                    "estimatedFinancialImpactUSD": 290000,
                    "summary": "Spontaneous 36-hour strike by airport cargo equipment operators causing import pallet processing freeze.",
                    "rootCause": "Collective bargaining dispute on night-shift cold-chain freight handling.",
                    "affectedOrderCount": 5,
                    "affectedSKUs": ["SKU-PWR-04", "SKU-OPT-05"],
                    "linkedShipmentIds": ["DIQ-SHP-002"],
                    "linkedWarehouseIds": ["WH-FRA-02"],
                },
                "impacts": [
                    ("shipment", "DIQ-SHP-002", {"kind": "delayed_shipment", "facts": {"delayHours": 36}}),
                    ("warehouse", "WH-FRA-02", {"kind": "affected_hub", "facts": {"hubCode": "WH-FRA-02"}}),
                    ("sku", "SKU-PWR-04", {"kind": "affected_sku", "facts": {"sku": "SKU-PWR-04"}}),
                    ("order", "DIQ-ORD-102", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 96}}),
                    ("order", "DIQ-ORD-105", {"kind": "at_risk_order", "facts": {"priority": "P2", "riskScore": 84}}),
                ],
            },
            {
                "id": "DIS-DIQ-03",
                "title": "Singapore Pasir Panjang Gantry Crane Failure",
                "severity": "high",
                "status": "active",
                "detected_at": now - timedelta(hours=18),
                "source_key": "canonical:DIS-DIQ-03",
                "payload": {
                    "type": "port_congestion",
                    "typeLabel": "Container Terminal Automation Outage",
                    "delayHours": 36,
                    "location": "PSA Singapore Pasir Panjang Terminal 4",
                    "carrierOrSupplier": "PSA Singapore & Hapag-Lloyd",
                    "estimatedFinancialImpactUSD": 185000,
                    "summary": "Supervisory control network glitch halted 6 automated rail-mounted gantry cranes during container offloading.",
                    "rootCause": "Power bus bar surge during monsoon lightning discharge tripped sub-station breaker 4B.",
                    "affectedOrderCount": 4,
                    "affectedSKUs": ["SKU-FIB-06"],
                    "linkedShipmentIds": ["DIQ-SHP-005"],
                    "linkedWarehouseIds": ["WH-SIN-01"],
                },
                "impacts": [
                    ("shipment", "DIQ-SHP-005", {"kind": "delayed_shipment", "facts": {"delayHours": 36}}),
                    ("warehouse", "WH-SIN-01", {"kind": "affected_hub", "facts": {"hubCode": "WH-SIN-01"}}),
                    ("sku", "SKU-FIB-06", {"kind": "affected_sku", "facts": {"sku": "SKU-FIB-06"}}),
                    ("order", "DIQ-ORD-103", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 90}}),
                    ("order", "DIQ-ORD-106", {"kind": "at_risk_order", "facts": {"priority": "P2", "riskScore": 75}}),
                ],
            },
            {
                "id": "DIS-DIQ-04",
                "title": "Bab-el-Mandeb Maritime Security Reroute via Cape of Good Hope",
                "severity": "critical",
                "status": "active",
                "detected_at": now - timedelta(hours=28),
                "source_key": "canonical:DIS-DIQ-04",
                "payload": {
                    "type": "carrier_delay",
                    "typeLabel": "Geopolitical Route Diversion",
                    "delayHours": 120,
                    "location": "Red Sea / Gulf of Aden Approach",
                    "carrierOrSupplier": "ONE Ocean Network Express & Maersk",
                    "estimatedFinancialImpactUSD": 480000,
                    "summary": "Carrier security council mandated circumnavigation of African continent, adding 5 days transit time.",
                    "rootCause": "Drone threat escalations in southern Red Sea shipping fairway.",
                    "affectedOrderCount": 7,
                    "affectedSKUs": ["SKU-ACC-01", "SKU-CON-10"],
                    "linkedShipmentIds": ["DIQ-SHP-016", "DIQ-SHP-018"],
                    "linkedWarehouseIds": ["WH-DXB-01", "WH-CHN-01"],
                },
                "impacts": [
                    ("shipment", "DIQ-SHP-016", {"kind": "delayed_shipment", "facts": {"delayHours": 30}}),
                    ("shipment", "DIQ-SHP-018", {"kind": "delayed_shipment", "facts": {"delayHours": 40}}),
                    ("warehouse", "WH-DXB-01", {"kind": "affected_hub", "facts": {"hubCode": "WH-DXB-01"}}),
                    ("order", "DIQ-ORD-108", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 94}}),
                    ("order", "DIQ-ORD-109", {"kind": "at_risk_order", "facts": {"priority": "P2", "riskScore": 82}}),
                ],
            },
            {
                "id": "DIS-DIQ-05",
                "title": "Chicago BNSF Intermodal Rail Freeze & Terminal Stacking",
                "severity": "high",
                "status": "active",
                "detected_at": now - timedelta(hours=20),
                "source_key": "canonical:DIS-DIQ-05",
                "payload": {
                    "type": "carrier_delay",
                    "typeLabel": "Winter Rail Intermodal Freeze",
                    "delayHours": 40,
                    "location": "BNSF Logistics Park Chicago, Elwood IL",
                    "carrierOrSupplier": "BNSF Railway & Expeditors",
                    "estimatedFinancialImpactUSD": 165000,
                    "summary": "Sub-zero temperatures caused pneumatic airbrake line freezing on container transfer trains from West Coast.",
                    "rootCause": "Early polar vortex front dropped ambient temperatures to -18C.",
                    "affectedOrderCount": 4,
                    "affectedSKUs": ["SKU-MEM-07", "SKU-SEN-09"],
                    "linkedShipmentIds": ["DIQ-SHP-007"],
                    "linkedWarehouseIds": ["WH-CHI-01"],
                },
                "impacts": [
                    ("warehouse", "WH-CHI-01", {"kind": "affected_hub", "facts": {"hubCode": "WH-CHI-01"}}),
                    ("sku", "SKU-MEM-07", {"kind": "affected_sku", "facts": {"sku": "SKU-MEM-07"}}),
                    ("order", "DIQ-ORD-110", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 88}}),
                    ("order", "DIQ-ORD-111", {"kind": "at_risk_order", "facts": {"priority": "P2", "riskScore": 76}}),
                ],
            },
            {
                "id": "DIS-DIQ-06",
                "title": "Dubai JAFZA Customs Automated Clearance EDI Gateway Outage",
                "severity": "medium",
                "status": "active",
                "detected_at": now - timedelta(hours=8),
                "source_key": "canonical:DIS-DIQ-06",
                "payload": {
                    "type": "customs_hold",
                    "typeLabel": "Customs Electronic Data Interchange Halt",
                    "delayHours": 24,
                    "location": "Dubai Customs Mirsal 2 Electronic Gateway",
                    "carrierOrSupplier": "Dubai Customs Authority",
                    "estimatedFinancialImpactUSD": 95000,
                    "summary": "Fiber cable cut during expressway excavation disabled customs declaration clearance server for JAFZA Gate 7.",
                    "rootCause": "Civil contractor roadworks trenching breached municipal fiber duct.",
                    "affectedOrderCount": 3,
                    "affectedSKUs": ["SKU-MCU-03"],
                    "linkedShipmentIds": ["DIQ-SHP-011"],
                    "linkedWarehouseIds": ["WH-DXB-01"],
                },
                "impacts": [
                    ("shipment", "DIQ-SHP-011", {"kind": "delayed_shipment", "facts": {"delayHours": 24}}),
                    ("warehouse", "WH-DXB-01", {"kind": "affected_hub", "facts": {"hubCode": "WH-DXB-01"}}),
                    ("order", "DIQ-ORD-112", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 84}}),
                ],
            },
            {
                "id": "DIS-DIQ-07",
                "title": "Formosa Micro-Packaging Thermal Cycle Qualification Failure",
                "severity": "critical",
                "status": "active",
                "detected_at": now - timedelta(hours=32),
                "source_key": "canonical:DIS-DIQ-07",
                "payload": {
                    "type": "supplier_outage",
                    "typeLabel": "Component Quality Hold & Recall",
                    "delayHours": 72,
                    "location": "Hsinchu Science Park Fab 2, Taiwan",
                    "carrierOrSupplier": "Formosa Micro-Packaging Inc (SUP-DIQ-08)",
                    "estimatedFinancialImpactUSD": 275000,
                    "summary": "Automated microscopic acoustic inspection revealed delamination in potting compound across Lot 2026-FMP-881.",
                    "rootCause": "Resin curing temperature drift in cleanroom oven chamber 3.",
                    "affectedOrderCount": 5,
                    "affectedSKUs": ["SKU-MCU-03"],
                    "linkedShipmentIds": ["DIQ-SHP-008"],
                    "linkedWarehouseIds": ["WH-CHN-01"],
                },
                "impacts": [
                    ("supplier", "SUP-DIQ-08", {"kind": "affected_supplier", "facts": {"supplierId": "SUP-DIQ-08"}}),
                    ("sku", "SKU-MCU-03", {"kind": "affected_sku", "facts": {"sku": "SKU-MCU-03"}}),
                    ("order", "DIQ-ORD-113", {"kind": "at_risk_order", "facts": {"priority": "P1", "riskScore": 96}}),
                    ("order", "DIQ-ORD-114", {"kind": "at_risk_order", "facts": {"priority": "P2", "riskScore": 85}}),
                ],
            },
            {
                "id": "DIS-DIQ-08",
                "title": "Kyushu High-Purity Silicon Chemical Precursor Shortage",
                "severity": "medium",
                "status": "evaluating",
                "detected_at": now - timedelta(hours=6),
                "source_key": "canonical:DIS-DIQ-08",
                "payload": {
                    "type": "supplier_outage",
                    "typeLabel": "Raw Material Allocation Shortage",
                    "delayHours": 30,
                    "location": "Kitakyushu Chemical Complex, Japan",
                    "carrierOrSupplier": "Tokyo Nanotech Compute Corp (SUP-DIQ-06)",
                    "estimatedFinancialImpactUSD": 110000,
                    "summary": "Scheduled maintenance on trichlorosilane gas pipeline resulted in temporary 30% quota rationing for semiconductor fab clients.",
                    "rootCause": "Planned regulatory safety valve recertification took longer than scheduled outage window.",
                    "affectedOrderCount": 3,
                    "affectedSKUs": ["SKU-ACC-01"],
                    "linkedShipmentIds": ["DIQ-SHP-006"],
                    "linkedWarehouseIds": ["WH-FRA-02"],
                },
                "impacts": [
                    ("supplier", "SUP-DIQ-06", {"kind": "affected_supplier", "facts": {"supplierId": "SUP-DIQ-06"}}),
                    ("sku", "SKU-ACC-01", {"kind": "affected_sku", "facts": {"sku": "SKU-ACC-01"}}),
                    ("warehouse", "WH-FRA-02", {"kind": "affected_hub", "facts": {"hubCode": "WH-FRA-02"}}),
                    ("order", "DIQ-ORD-115", {"kind": "at_risk_order", "facts": {"priority": "P2", "riskScore": 68}}),
                ],
            },
        ]

        for dis_spec in disruptions_specs:
            dis_id = dis_spec["id"]
            existing_dis = db.get(DisruptionRecord, dis_id)
            if not existing_dis:
                dis_record = DisruptionRecord(
                    id=dis_id,
                    title=dis_spec["title"],
                    severity=dis_spec["severity"],
                    status=dis_spec["status"],
                    detected_at=dis_spec["detected_at"],
                    source_key=dis_spec["source_key"],
                    payload_json=json.dumps(dis_spec["payload"]),
                )
                db.add(dis_record)
                db.flush()

                for entity_type, entity_id, evidence in dis_spec["impacts"]:
                    db.add(
                        DisruptionImpact(
                            disruption_id=dis_id,
                            entity_type=entity_type,
                            entity_id=entity_id,
                            evidence_json=json.dumps(evidence),
                        )
                    )
                    # Link order directly
                    if entity_type == "order":
                        ord_obj = db.get(Order, entity_id)
                        if ord_obj:
                            ord_obj.associated_disruption_id = dis_id

                counts["disruptions"] += 1
        db.flush()

        # Recalculate warehouse utilization
        for w_data in warehouses_data:
            wh_obj = db.get(Warehouse, w_data["id"])
            if wh_obj:
                total_units = db.scalar(
                    select(func.sum(Inventory.on_hand_units)).where(Inventory.warehouse_id == wh_obj.id)
                ) or 0
                max_cap = wh_obj.max_pallet_capacity or 14000
                wh_obj.current_utilization_pct = Decimal(str(min(100.0, round((total_units / max_cap) * 100, 2))))
        db.flush()

        db.commit()
        return counts

    except Exception:
        db.rollback()
        raise
    finally:
        if close_session:
            db.close()


def main() -> None:
    print(f"Target Database: {database.engine.url}")
    print("Seeding synthetic company dataset: DisruptionIQ Logistics Pvt. Ltd...")
    counts = seed_synthetic_company()
    print("\n[OK] Demonstration dataset successfully loaded:")
    for k, v in counts.items():
        print(f"  - {k:<18}: {v} records seeded/verified")


if __name__ == "__main__":
    main()
