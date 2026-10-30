"""Warehouse Management, Stock Transfer Lifecycle, and Movement Ledger Service.

Implements:
  - Warehouse directory & detail aggregation (inventory, shipments, orders, shortages, transfers, disruptions)
  - Authorized warehouse CRUD & SKU/Product master management
  - Complete, persistent stock transfer workflow: REQUESTED -> APPROVED -> IN_TRANSIT -> RECEIVED
  - Negative-stock, reservation breach, safety-stock, and capacity constraints
  - Idempotent and duplicate-safe dispatch/receipt
  - Append-only stock movement ledger tracking
  - Shortage recalculation & order risk refresh
  - Complete audit trail logging
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import json
from math import ceil
from typing import Any
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.auth import User, UserRole
from app.models.governance import AuditRecord, DisruptionImpact, DisruptionRecord
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
from app.schemas.inventory import (
    CompanySchema,
    InventoryCreateRequest,
    ProductCreatePayload,
    ProductSchema,
    ShortageAnalysisItem,
    StockMovementSchema,
    StockReceiptRequest,
    TransferRequestPayload,
    WarehouseCreatePayload,
    WarehouseInventory,
    WarehouseSchema,
    WarehouseTransferSchema,
    WarehouseUpdatePayload,
)
from app.services.manual_data_service import record_audit, to_disruption_schema, to_shipment_schema, to_warehouse_inventory_schema
from app.services.read_models import list_orders_at_risk


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(val: Any) -> str:
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val) if val is not None else ""


def _recalculate_inventory_status(item: Inventory) -> str:
    """Derive health status strictly based on available units and safety buffer."""
    if item.available_units <= 0:
        return "depleted"
    if item.available_units < item.safety_stock_threshold:
        return "critical"
    if item.available_units < int(item.safety_stock_threshold * 1.5):
        return "constrained"
    return "healthy"


def _recalculate_warehouse_utilization(db: Session, warehouse: Warehouse) -> None:
    """Calculate pallet capacity utilization based on on-hand units."""
    total_units = db.scalar(
        select(func.sum(Inventory.on_hand_units)).where(Inventory.warehouse_id == warehouse.id)
    ) or 0
    max_cap = warehouse.max_pallet_capacity or 10000
    utilization = min(100.0, round((total_units / max_cap) * 100, 2))
    warehouse.current_utilization_pct = Decimal(str(utilization))


def _refresh_affected_orders_risk(db: Session, warehouse_id: str, sku: str) -> None:
    """
    After stock receipt or transfer arrival, recalculate risk for orders
    dependent on this SKU at this destination warehouse.
    """
    inventory_item = db.scalar(
        select(Inventory).where(Inventory.warehouse_id == warehouse_id, Inventory.sku == sku)
    )
    available = inventory_item.available_units if inventory_item else 0

    orders = db.scalars(
        select(Order)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .where(Order.primary_warehouse_id == warehouse_id, OrderLine.sku == sku)
        .distinct()
    ).all()

    settings = get_settings()
    now_utc = _now()

    for order in orders:
        lines = db.scalars(select(OrderLine).where(OrderLine.order_id == order.id)).all()
        shortage = False
        for line in lines:
            line_inv = db.scalar(
                select(Inventory).where(Inventory.warehouse_id == warehouse_id, Inventory.sku == line.sku)
            )
            line_avail = line_inv.available_units if line_inv else 0
            if line_avail < line.quantity:
                shortage = True
                break

        # Re-score
        score = 0
        if shortage:
            score += settings.risk_weight_shortage
        if order.associated_disruption_id:
            score += settings.risk_weight_delay
        hours_to_deadline = (
            order.promised_deadline.replace(tzinfo=timezone.utc)
            if order.promised_deadline.tzinfo is None
            else order.promised_deadline
        )
        remaining_hours = (hours_to_deadline - now_utc).total_seconds() / 3600
        if remaining_hours <= 24:
            score += settings.risk_weight_deadline

        score = min(100, max(0, score))
        order.risk_score = score
        if score >= 80:
            order.risk_level = "critical"
        elif score >= 60:
            order.risk_level = "high"
        elif score >= 30:
            order.risk_level = "medium"
        else:
            order.risk_level = "low"

        if score < 50 and order.mitigation_status == "unmitigated":
            order.mitigation_status = "protected"
        order.explanation = f"Authoritative score refreshed after stock balance update at {warehouse_id}."


# ---------------------------------------------------------------------------
# 1. Company Operations
# ---------------------------------------------------------------------------

def list_companies(db: Session) -> list[CompanySchema]:
    companies = db.scalars(select(Company).order_by(Company.name)).all()
    results: list[CompanySchema] = []
    for c in companies:
        wh_stats = db.execute(
            select(
                func.count(Warehouse.id),
                func.sum(Warehouse.total_capacity_sqm),
            ).where(Warehouse.company_id == c.id)
        ).one()
        results.append(
            CompanySchema(
                id=c.id,
                name=c.name,
                code=c.code,
                registrationNumber=c.registration_number,
                headquarters=c.headquarters,
                country=c.country,
                contactEmail=c.contact_email,
                isDemo=c.is_demo,
                status=c.status,
                createdAt=_iso(c.created_at),
                warehouseCount=wh_stats[0] or 0,
                totalCapacitySqm=wh_stats[1] or 0,
            )
        )
    return results


def get_company_detail(db: Session, company_id: str) -> dict[str, Any]:
    company = db.get(Company, company_id)
    if not company:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "COMPANY_NOT_FOUND", "message": f"Company '{company_id}' not found."},
        )
    warehouses = list_warehouses(db, company_id=company.id)
    return {
        "company": CompanySchema(
            id=company.id,
            name=company.name,
            code=company.code,
            registrationNumber=company.registration_number,
            headquarters=company.headquarters,
            country=company.country,
            contactEmail=company.contact_email,
            isDemo=company.is_demo,
            status=company.status,
            createdAt=_iso(company.created_at),
            warehouseCount=len(warehouses),
            totalCapacitySqm=sum(w.totalCapacitySqm for w in warehouses),
        ),
        "warehouses": warehouses,
    }


# ---------------------------------------------------------------------------
# 2. Warehouse Operations
# ---------------------------------------------------------------------------

def list_warehouses(db: Session, company_id: str | None = None) -> list[WarehouseSchema]:
    stmt = select(Warehouse)
    if company_id:
        stmt = stmt.where(Warehouse.company_id == company_id)
    warehouses = db.scalars(stmt.order_by(Warehouse.country, Warehouse.city)).all()

    results: list[WarehouseSchema] = []
    for wh in warehouses:
        comp_name = None
        if wh.company_id:
            c = db.get(Company, wh.company_id)
            if c:
                comp_name = c.name

        inv_stats = db.execute(
            select(
                func.count(Inventory.id),
                func.sum(Inventory.on_hand_units),
                func.count().filter(Inventory.status.in_(["critical", "depleted"])),
            ).where(Inventory.warehouse_id == wh.id)
        ).one()

        inbound_shp_count = db.scalar(
            select(func.count(Shipment.id)).where(
                Shipment.destination_warehouse_id == wh.id,
                Shipment.status.in_(["delayed", "on_schedule", "customs_hold", "rerouted"]),
            )
        ) or 0

        outgoing_ord_count = db.scalar(
            select(func.count(Order.id)).where(Order.primary_warehouse_id == wh.id)
        ) or 0

        results.append(
            WarehouseSchema(
                id=wh.id,
                name=wh.name,
                location=wh.location,
                city=wh.city,
                country=wh.country,
                totalCapacitySqm=wh.total_capacity_sqm,
                availableDockDoors=wh.available_dock_doors,
                status=wh.status,
                companyId=wh.company_id,
                companyName=comp_name,
                isDemo=bool(wh.is_demo),
                managerName=wh.manager_name,
                contactEmail=wh.contact_email,
                maxPalletCapacity=wh.max_pallet_capacity or 10000,
                currentUtilizationPct=float(wh.current_utilization_pct or 0.0),
                activeInventoryCount=inv_stats[0] or 0,
                totalUnitsOnHand=inv_stats[1] or 0,
                shortageCount=inv_stats[2] or 0,
                incomingShipmentsCount=inbound_shp_count,
                outgoingOrdersCount=outgoing_ord_count,
            )
        )
    return results


def get_warehouse_detail(db: Session, warehouse_id: str) -> dict[str, Any]:
    wh = db.get(Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WAREHOUSE_NOT_FOUND", "message": f"Warehouse '{warehouse_id}' not found."},
        )

    # 1. Base summary
    wh_summary = list_warehouses(db)
    summary_item = next((w for w in wh_summary if w.id == warehouse_id), None)

    # 2. Warehouse inventory
    inv_items = db.scalars(
        select(Inventory).where(Inventory.warehouse_id == warehouse_id).order_by(Inventory.sku)
    ).all()
    inventory_data = [to_warehouse_inventory_schema(db, item) for item in inv_items]

    # 3. Incoming shipments
    shp_items = db.scalars(
        select(Shipment)
        .where(
            (Shipment.destination_warehouse_id == warehouse_id)
            | (Shipment.destination.ilike(f"%{wh.city}%"))
        )
        .order_by(Shipment.promised_delivery_date.desc())
    ).all()
    shipments_data = [to_shipment_schema(s) for s in shp_items]

    # 4. Outgoing orders
    orders_data = list_orders_at_risk(db, disruption_id=None, priority=None)
    wh_orders = [o for o in orders_data if o.primaryWarehouseId == warehouse_id]

    # 5. Shortage analysis
    shortages = get_shortage_analysis(db, warehouse_id=warehouse_id)

    # 6. Transfer history (both inbound and outbound)
    transfers = list_transfers(db, warehouse_id=warehouse_id)

    # 7. Disruption history
    dis_impacts = db.scalars(
        select(DisruptionImpact).where(
            DisruptionImpact.entity_type == "warehouse",
            DisruptionImpact.entity_id == warehouse_id,
        )
    ).all()
    dis_ids = {impact.disruption_id for impact in dis_impacts}
    dis_records = db.scalars(
        select(DisruptionRecord).where(DisruptionRecord.id.in_(dis_ids)).order_by(DisruptionRecord.detected_at.desc())
    ).all() if dis_ids else []
    disruptions_data = [to_disruption_schema(db, d) for d in dis_records]

    # 8. Movement history
    movements = get_stock_movements(db, warehouse_id=warehouse_id)

    return {
        "warehouse": summary_item,
        "inventory": inventory_data,
        "shipments": shipments_data,
        "orders": wh_orders,
        "shortages": shortages,
        "transfers": transfers,
        "disruptions": disruptions_data,
        "movements": movements,
    }


def create_warehouse(
    db: Session,
    payload: WarehouseCreatePayload,
    actor_id: str,
    actor_role: str,
) -> WarehouseSchema:
    wh_id = payload.id or f"WH-{payload.city[:3].upper()}-{uuid.uuid4().hex[:4].upper()}"
    existing = db.get(Warehouse, wh_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DUPLICATE_WAREHOUSE", "message": f"Warehouse with ID '{wh_id}' already exists."},
        )

    if payload.companyId:
        company = db.get(Company, payload.companyId)
        if not company:
            if payload.companyId == "COMP-DIQ-01":
                company = Company(
                    id="COMP-DIQ-01",
                    name="DisruptionIQ Logistics Pvt. Ltd.",
                    code="DIQPL",
                    registration_number="U63090TN2026PTC158942",
                    headquarters="Chennai, India",
                    country="India",
                    contact_email="operations@disruptioniq-logistics.demo",
                    is_demo=True,
                    status="active",
                )
                db.add(company)
                db.flush()
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail={"code": "COMPANY_NOT_FOUND", "message": f"Company '{payload.companyId}' not found."},
                )

    wh = Warehouse(
        id=wh_id,
        name=payload.name,
        location=payload.location,
        city=payload.city,
        country=payload.country,
        total_capacity_sqm=payload.totalCapacitySqm,
        available_dock_doors=payload.availableDockDoors,
        status=payload.status,
        company_id=payload.companyId,
        is_demo=payload.isDemo,
        manager_name=payload.managerName,
        contact_email=payload.contactEmail,
        max_pallet_capacity=payload.maxPalletCapacity or 10000,
        current_utilization_pct=Decimal("0.0"),
    )
    db.add(wh)
    db.flush()

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="CREATE_WAREHOUSE",
        entity_type="Warehouse",
        entity_id=wh.id,
        reason="Operational warehouse onboarding",
        after_state={"name": wh.name, "city": wh.city, "country": wh.country, "companyId": wh.company_id},
    )
    db.commit()

    all_whs = list_warehouses(db)
    return next(w for w in all_whs if w.id == wh.id)


def update_warehouse(
    db: Session,
    warehouse_id: str,
    payload: WarehouseUpdatePayload,
    actor_id: str,
    actor_role: str,
) -> WarehouseSchema:
    wh = db.get(Warehouse, warehouse_id)
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WAREHOUSE_NOT_FOUND", "message": f"Warehouse '{warehouse_id}' not found."},
        )

    before_state = {
        "name": wh.name,
        "status": wh.status,
        "location": wh.location,
        "managerName": wh.manager_name,
    }

    if payload.name is not None:
        wh.name = payload.name
    if payload.location is not None:
        wh.location = payload.location
    if payload.city is not None:
        wh.city = payload.city
    if payload.country is not None:
        wh.country = payload.country
    if payload.totalCapacitySqm is not None:
        wh.total_capacity_sqm = payload.totalCapacitySqm
    if payload.availableDockDoors is not None:
        wh.available_dock_doors = payload.availableDockDoors
    if payload.status is not None:
        wh.status = payload.status
    if payload.managerName is not None:
        wh.manager_name = payload.managerName
    if payload.contactEmail is not None:
        wh.contact_email = payload.contactEmail
    if payload.maxPalletCapacity is not None:
        wh.max_pallet_capacity = payload.maxPalletCapacity

    _recalculate_warehouse_utilization(db, wh)

    after_state = {
        "name": wh.name,
        "status": wh.status,
        "location": wh.location,
        "managerName": wh.manager_name,
    }

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="UPDATE_WAREHOUSE",
        entity_type="Warehouse",
        entity_id=wh.id,
        reason="Warehouse record update",
        before_state=before_state,
        after_state=after_state,
    )
    db.commit()

    all_whs = list_warehouses(db)
    return next(w for w in all_whs if w.id == wh.id)


# ---------------------------------------------------------------------------
# 3. Product & SKU Master Operations
# ---------------------------------------------------------------------------

def list_products(db: Session) -> list[ProductSchema]:
    products = db.scalars(select(Product).order_by(Product.sku)).all()
    return [
        ProductSchema(
            sku=p.sku,
            name=p.name,
            description=p.description,
            category=p.category,
            unitCostUSD=float(p.unit_cost_usd),
            weightKg=float(p.weight_kg),
            isDemo=p.is_demo,
            status=p.status,
        )
        for p in products
    ]


def create_product(
    db: Session,
    payload: ProductCreatePayload,
    actor_id: str,
    actor_role: str,
) -> ProductSchema:
    clean_sku = payload.sku.strip().upper()
    existing = db.get(Product, clean_sku)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DUPLICATE_SKU", "message": f"Product SKU '{clean_sku}' already exists."},
        )

    prod = Product(
        sku=clean_sku,
        name=payload.name,
        description=payload.description,
        category=payload.category,
        unit_cost_usd=Decimal(str(payload.unitCostUSD)),
        weight_kg=Decimal(str(payload.weightKg)),
        is_demo=payload.isDemo,
        status="active",
    )
    db.add(prod)
    db.flush()

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="CREATE_PRODUCT",
        entity_type="Product",
        entity_id=clean_sku,
        reason="Catalog SKU addition",
        after_state={"sku": clean_sku, "name": prod.name, "category": prod.category},
    )
    db.commit()
    return ProductSchema(
        sku=prod.sku,
        name=prod.name,
        description=prod.description,
        category=prod.category,
        unitCostUSD=float(prod.unit_cost_usd),
        weightKg=float(prod.weight_kg),
        isDemo=prod.is_demo,
        status=prod.status,
    )


# ---------------------------------------------------------------------------
# 4. Inventory Addition & Direct Receipt Operations
# ---------------------------------------------------------------------------

def create_inventory_record(
    db: Session,
    payload: InventoryCreateRequest,
    actor_id: str,
    actor_role: str,
) -> WarehouseInventory:
    wh = db.get(Warehouse, payload.warehouseId)
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WAREHOUSE_NOT_FOUND", "message": f"Warehouse '{payload.warehouseId}' not found."},
        )

    # Check product master or fallback to existing inventory definition
    product = db.get(Product, payload.sku)
    desc = product.description if product else f"Component {payload.sku}"
    cat = product.category if product else "General Components"
    cost = product.unit_cost_usd if product else Decimal("100.00")

    existing = db.scalar(
        select(Inventory).where(Inventory.warehouse_id == payload.warehouseId, Inventory.sku == payload.sku)
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVENTORY_SLOT_EXISTS", "message": f"Inventory record for SKU '{payload.sku}' already exists at {payload.warehouseId}."},
        )

    # Check destination capacity
    curr_total = db.scalar(
        select(func.sum(Inventory.on_hand_units)).where(Inventory.warehouse_id == payload.warehouseId)
    ) or 0
    max_cap = wh.max_pallet_capacity or 10000
    if curr_total + payload.onHandUnits > max_cap:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "DESTINATION_CAPACITY_EXCEEDED", "message": f"Adding {payload.onHandUnits} units exceeds warehouse capacity ({max_cap} max units)."},
        )

    inv_id = f"INV-{payload.warehouseId}-{payload.sku}"
    status_str = "depleted" if payload.onHandUnits == 0 else ("critical" if payload.onHandUnits < payload.safetyStockThreshold else "healthy")

    item = Inventory(
        id=inv_id,
        warehouse_id=wh.id,
        warehouse_name=wh.name,
        sku=payload.sku,
        sku_description=desc,
        category=cat,
        on_hand_units=payload.onHandUnits,
        available_units=payload.onHandUnits,
        reserved_units=0,
        inbound_units=0,
        safety_stock_threshold=payload.safetyStockThreshold,
        unit_cost_usd=cost,
        status=status_str,
        last_audited_at=_now(),
        is_demo=wh.is_demo,
    )
    db.add(item)
    db.flush()

    if payload.onHandUnits > 0:
        db.add(
            StockMovement(
                id=f"MVT-{uuid.uuid4().hex[:12].upper()}",
                timestamp=_now(),
                movement_type="RECEIPT",
                warehouse_id=wh.id,
                sku=payload.sku,
                quantity=payload.onHandUnits,
                balance_before=0,
                balance_after=payload.onHandUnits,
                reference_type="INITIAL_ALLOCATION",
                reference_id=payload.reference,
                actor_id=actor_id,
                notes=payload.reason,
                is_demo=wh.is_demo,
            )
        )

    _recalculate_warehouse_utilization(db, wh)

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="CREATE_INVENTORY",
        entity_type="Inventory",
        entity_id=item.id,
        reason=payload.reason,
        after_state={"sku": item.sku, "onHandUnits": item.on_hand_units, "warehouseId": item.warehouse_id},
    )
    db.commit()
    return to_warehouse_inventory_schema(db, item)


def record_stock_receipt(
    db: Session,
    payload: StockReceiptRequest,
    actor_id: str,
    actor_role: str,
) -> WarehouseInventory:
    """Record physical dock receipt from purchase order or supplier inbound shipment."""
    wh = db.get(Warehouse, payload.warehouseId)
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "WAREHOUSE_NOT_FOUND", "message": f"Warehouse '{payload.warehouseId}' not found."},
        )

    item = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == payload.warehouseId, Inventory.sku == payload.sku)
        .with_for_update()
    )
    if not item:
        # Auto-create inventory slot if product exists
        product = db.get(Product, payload.sku)
        desc = product.description if product else f"Component {payload.sku}"
        cat = product.category if product else "General Components"
        cost = product.unit_cost_usd if product else Decimal("100.00")
        item = Inventory(
            id=f"INV-{payload.warehouseId}-{payload.sku}",
            warehouse_id=wh.id,
            warehouse_name=wh.name,
            sku=payload.sku,
            sku_description=desc,
            category=cat,
            on_hand_units=0,
            available_units=0,
            reserved_units=0,
            inbound_units=0,
            safety_stock_threshold=50,
            unit_cost_usd=cost,
            status="depleted",
            last_audited_at=_now(),
            is_demo=wh.is_demo,
        )
        db.add(item)
        db.flush()

    # Check capacity limit
    curr_total = db.scalar(
        select(func.sum(Inventory.on_hand_units)).where(Inventory.warehouse_id == payload.warehouseId)
    ) or 0
    max_cap = wh.max_pallet_capacity or 10000
    if curr_total + payload.quantity > max_cap:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "DESTINATION_CAPACITY_EXCEEDED", "message": f"Receipt of {payload.quantity} units breaches warehouse capacity ({max_cap} max units)."},
        )

    balance_before = item.on_hand_units
    item.on_hand_units += payload.quantity
    item.available_units += payload.quantity
    if item.inbound_units >= payload.quantity:
        item.inbound_units -= payload.quantity
    else:
        item.inbound_units = 0

    item.status = _recalculate_inventory_status(item)
    item.last_audited_at = _now()

    # Append to stock movement ledger
    mvt = StockMovement(
        id=f"MVT-{uuid.uuid4().hex[:12].upper()}",
        timestamp=_now(),
        movement_type="RECEIPT",
        warehouse_id=wh.id,
        sku=item.sku,
        quantity=payload.quantity,
        balance_before=balance_before,
        balance_after=item.on_hand_units,
        reference_type="PURCHASE_RECEIPT",
        reference_id=payload.shipmentTrackingNumber or payload.purchaseOrderNumber,
        actor_id=actor_id,
        notes=f"Dock receipt of {payload.quantity} units. {payload.reason}",
        is_demo=wh.is_demo,
    )
    db.add(mvt)

    _recalculate_warehouse_utilization(db, wh)
    _refresh_affected_orders_risk(db, wh.id, item.sku)

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="STOCK_RECEIPT",
        entity_type="Inventory",
        entity_id=item.id,
        reason=payload.reason,
        after_state={"sku": item.sku, "onHandUnits": item.on_hand_units, "availableUnits": item.available_units},
    )

    db.commit()
    return to_warehouse_inventory_schema(db, item)


# ---------------------------------------------------------------------------
# 5. Persistent Stock Transfer Lifecycle (PART D)
# ---------------------------------------------------------------------------

def _to_transfer_schema(db: Session, t: WarehouseTransfer) -> WarehouseTransferSchema:
    src_wh = db.get(Warehouse, t.source_warehouse_id)
    dest_wh = db.get(Warehouse, t.destination_warehouse_id)
    inv = db.scalar(
        select(Inventory).where(Inventory.sku == t.sku).limit(1)
    )
    sku_desc = inv.sku_description if inv else t.sku
    cat = inv.category if inv else "Components"

    return WarehouseTransferSchema(
        id=t.id,
        sourceWarehouseId=t.source_warehouse_id,
        sourceWarehouseName=src_wh.name if src_wh else t.source_warehouse_id,
        destinationWarehouseId=t.destination_warehouse_id,
        destinationWarehouseName=dest_wh.name if dest_wh else t.destination_warehouse_id,
        sku=t.sku,
        skuDescription=sku_desc,
        category=cat,
        quantity=t.quantity,
        status=t.status,
        reason=t.reason,
        requestedBy=t.requested_by,
        requestedAt=_iso(t.requested_at),
        approvedBy=t.approved_by,
        approvedAt=_iso(t.approved_at) if t.approved_at else None,
        dispatchedBy=t.dispatched_by,
        dispatchedAt=_iso(t.dispatched_at) if t.dispatched_at else None,
        receivedBy=t.received_by,
        receivedAt=_iso(t.received_at) if t.received_at else None,
        cancelledBy=t.cancelled_by,
        cancelledAt=_iso(t.cancelled_at) if t.cancelled_at else None,
        cancellationReason=t.cancellation_reason,
        expectedArrival=_iso(t.expected_arrival) if t.expected_arrival else None,
        trackingReference=t.tracking_reference,
        authorizationCode=t.authorization_code,
        notes=t.notes,
        isDemo=bool(t.is_demo),
    )


def list_transfers(
    db: Session,
    warehouse_id: str | None = None,
    status: str | None = None,
) -> list[WarehouseTransferSchema]:
    stmt = select(WarehouseTransfer)
    if warehouse_id:
        stmt = stmt.where(
            (WarehouseTransfer.source_warehouse_id == warehouse_id)
            | (WarehouseTransfer.destination_warehouse_id == warehouse_id)
        )
    if status:
        stmt = stmt.where(WarehouseTransfer.status == status.upper())
    records = db.scalars(stmt.order_by(WarehouseTransfer.requested_at.desc())).all()
    return [_to_transfer_schema(db, t) for t in records]


def get_transfer_detail(db: Session, transfer_id: str) -> WarehouseTransferSchema:
    t = db.get(WarehouseTransfer, transfer_id)
    if not t:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TRANSFER_NOT_FOUND", "message": f"Transfer '{transfer_id}' not found."},
        )
    return _to_transfer_schema(db, t)


def request_transfer(
    db: Session,
    payload: TransferRequestPayload,
    actor_id: str,
    actor_role: str,
) -> WarehouseTransferSchema:
    """
    Initiate a stock transfer request in REQUESTED status.
    Strictly validates:
      1. Source != Destination
      2. Both warehouses exist and belong to the same authorized company (where company assigned)
      3. Quantity is positive (> 0)
      4. Source stock exists and available units are sufficient
      5. Safety-stock constraints are respected
      6. Destination warehouse capacity is not breached
    """
    if payload.sourceWarehouseId == payload.destinationWarehouseId:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "IDENTICAL_WAREHOUSES", "message": "Source and destination warehouses must be different."},
        )

    if payload.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_QUANTITY", "message": "Transfer quantity must be greater than zero."},
        )

    src_wh = db.get(Warehouse, payload.sourceWarehouseId)
    if not src_wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SOURCE_WAREHOUSE_NOT_FOUND", "message": f"Source warehouse '{payload.sourceWarehouseId}' not found."},
        )

    dest_wh = db.get(Warehouse, payload.destinationWarehouseId)
    if not dest_wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEST_WAREHOUSE_NOT_FOUND", "message": f"Destination warehouse '{payload.destinationWarehouseId}' not found."},
        )

    # Validate company ownership consistency if both are assigned to a company
    if src_wh.company_id and dest_wh.company_id and src_wh.company_id != dest_wh.company_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "COMPANY_MISMATCH", "message": "Both warehouses must belong to the authorized company."},
        )

    # Source inventory lock and verification
    src_inv = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == payload.sourceWarehouseId, Inventory.sku == payload.sku)
        .with_for_update()
    )
    if not src_inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SKU_NOT_FOUND", "message": f"SKU '{payload.sku}' is not stocked at source warehouse '{payload.sourceWarehouseId}'."},
        )

    # 1. Insufficient stock check
    if src_inv.available_units < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INSUFFICIENT_STOCK",
                "message": f"Source warehouse has insufficient available units ({src_inv.available_units} available, {payload.quantity} requested).",
            },
        )

    # 2. Safety-stock constraint check
    remaining_available = src_inv.available_units - payload.quantity
    if remaining_available < src_inv.safety_stock_threshold:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "SAFETY_STOCK_BREACH",
                "message": f"Transfer would breach safety stock threshold ({src_inv.safety_stock_threshold} min units required, {remaining_available} would remain).",
            },
        )

    # 3. Destination capacity check
    dest_total_units = db.scalar(
        select(func.sum(Inventory.on_hand_units)).where(Inventory.warehouse_id == payload.destinationWarehouseId)
    ) or 0
    dest_max_cap = dest_wh.max_pallet_capacity or 10000
    if dest_total_units + payload.quantity > dest_max_cap:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "DESTINATION_CAPACITY_EXCEEDED",
                "message": f"Destination warehouse capacity exceeded (capacity: {dest_max_cap}, projected: {dest_total_units + payload.quantity}).",
            },
        )

    transfer_id = f"TRF-{uuid.uuid4().hex[:10].upper()}"
    arrival_dt = None
    if payload.expectedArrival:
        try:
            arrival_dt = datetime.fromisoformat(payload.expectedArrival.replace("Z", "+00:00"))
        except Exception:
            arrival_dt = None

    transfer = WarehouseTransfer(
        id=transfer_id,
        source_warehouse_id=src_wh.id,
        destination_warehouse_id=dest_wh.id,
        sku=payload.sku,
        quantity=payload.quantity,
        status="REQUESTED",
        reason=payload.reason,
        requested_by=actor_id,
        requested_at=_now(),
        expected_arrival=arrival_dt,
        authorization_code=payload.authorizationCode or f"AUTH-{uuid.uuid4().hex[:6].upper()}",
        tracking_reference=payload.trackingReference,
        notes=payload.notes,
        is_demo=src_wh.is_demo or dest_wh.is_demo,
    )
    db.add(transfer)
    db.flush()

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="TRANSFER_REQUESTED",
        entity_type="WarehouseTransfer",
        entity_id=transfer.id,
        reason=payload.reason,
        after_state={
            "transferId": transfer.id,
            "sku": transfer.sku,
            "quantity": transfer.quantity,
            "source": src_wh.id,
            "destination": dest_wh.id,
            "status": "REQUESTED",
        },
    )
    db.commit()
    return _to_transfer_schema(db, transfer)


def approve_transfer(
    db: Session,
    transfer_id: str,
    actor_id: str,
    actor_role: str,
    comments: str | None = None,
) -> WarehouseTransferSchema:
    """
    Approve a REQUESTED stock transfer.
    Transition: REQUESTED -> APPROVED.
    """
    transfer = db.scalar(
        select(WarehouseTransfer).where(WarehouseTransfer.id == transfer_id).with_for_update()
    )
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TRANSFER_NOT_FOUND", "message": f"Transfer '{transfer_id}' not found."},
        )

    if transfer.status == "APPROVED":
        # Idempotency
        return _to_transfer_schema(db, transfer)

    if transfer.status != "REQUESTED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_TRANSFER_STATE", "message": f"Cannot approve transfer in '{transfer.status}' status (must be REQUESTED)."},
        )

    transfer.status = "APPROVED"
    transfer.approved_by = actor_id
    transfer.approved_at = _now()
    if comments:
        transfer.notes = f"{transfer.notes or ''}\n[Approval Notes]: {comments}".strip()

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="TRANSFER_APPROVED",
        entity_type="WarehouseTransfer",
        entity_id=transfer.id,
        reason=comments or "Transfer approved by supply chain governance",
        before_state={"status": "REQUESTED"},
        after_state={"status": "APPROVED", "approvedBy": actor_id},
    )
    db.commit()
    return _to_transfer_schema(db, transfer)


def dispatch_transfer(
    db: Session,
    transfer_id: str,
    actor_id: str,
    actor_role: str,
    tracking_reference: str | None = None,
) -> WarehouseTransferSchema:
    """
    Dispatch stock for transfer.
    Transition: APPROVED -> IN_TRANSIT.
    Actions:
      - Reserve source stock: available -= qty, reserved += qty (on_hand unchanged)
      - Destination marks inbound: inbound += qty (not physically received)
      - Status becomes IN_TRANSIT
      - StockMovement entry recorded
    """
    transfer = db.scalar(
        select(WarehouseTransfer).where(WarehouseTransfer.id == transfer_id).with_for_update()
    )
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TRANSFER_NOT_FOUND", "message": f"Transfer '{transfer_id}' not found."},
        )

    if transfer.status == "IN_TRANSIT":
        # Idempotency
        return _to_transfer_schema(db, transfer)

    if transfer.status != "APPROVED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_TRANSFER_STATE", "message": f"Cannot dispatch transfer in '{transfer.status}' status (must be APPROVED)."},
        )

    src_inv = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == transfer.source_warehouse_id, Inventory.sku == transfer.sku)
        .with_for_update()
    )
    if not src_inv or src_inv.available_units < transfer.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INSUFFICIENT_STOCK", "message": "Source inventory no longer has sufficient available units to dispatch."},
        )

    dest_inv = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == transfer.destination_warehouse_id, Inventory.sku == transfer.sku)
        .with_for_update()
    )
    if not dest_inv:
        # Create destination slot if not exists
        dest_wh = db.get(Warehouse, transfer.destination_warehouse_id)
        product = db.get(Product, transfer.sku)
        dest_inv = Inventory(
            id=f"INV-{transfer.destination_warehouse_id}-{transfer.sku}",
            warehouse_id=transfer.destination_warehouse_id,
            warehouse_name=dest_wh.name if dest_wh else transfer.destination_warehouse_id,
            sku=transfer.sku,
            sku_description=product.description if product else src_inv.sku_description,
            category=product.category if product else src_inv.category,
            on_hand_units=0,
            available_units=0,
            reserved_units=0,
            inbound_units=0,
            safety_stock_threshold=src_inv.safety_stock_threshold,
            unit_cost_usd=src_inv.unit_cost_usd,
            status="depleted",
            last_audited_at=_now(),
            is_demo=transfer.is_demo,
        )
        db.add(dest_inv)
        db.flush()

    # 1. Reserve source stock for transfer
    src_inv.available_units -= transfer.quantity
    src_inv.reserved_units += transfer.quantity
    src_inv.status = _recalculate_inventory_status(src_inv)
    src_inv.last_audited_at = _now()

    # 2. Destination inbound tracking
    dest_inv.inbound_units += transfer.quantity
    dest_inv.last_audited_at = _now()

    # 3. Update transfer record
    transfer.status = "IN_TRANSIT"
    transfer.dispatched_by = actor_id
    transfer.dispatched_at = _now()
    if tracking_reference:
        transfer.tracking_reference = tracking_reference

    # 4. Stock movement ledger
    db.add(
        StockMovement(
            id=f"MVT-{uuid.uuid4().hex[:12].upper()}",
            timestamp=_now(),
            movement_type="DISPATCH",
            warehouse_id=src_inv.warehouse_id,
            sku=transfer.sku,
            quantity=transfer.quantity,
            balance_before=src_inv.on_hand_units,
            balance_after=src_inv.on_hand_units,  # physically unchanged until delivered
            reference_type="TRANSFER",
            reference_id=transfer.id,
            actor_id=actor_id,
            notes=f"Stock reserved and dispatched for transfer {transfer.id} to {transfer.destination_warehouse_id}",
            is_demo=transfer.is_demo,
        )
    )

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="TRANSFER_DISPATCHED",
        entity_type="WarehouseTransfer",
        entity_id=transfer.id,
        reason=f"Transfer {transfer.id} dispatched by warehouse logistics",
        after_state={"status": "IN_TRANSIT", "dispatchedBy": actor_id, "tracking": transfer.tracking_reference},
    )
    db.commit()
    return _to_transfer_schema(db, transfer)


def receive_transfer(
    db: Session,
    transfer_id: str,
    actor_id: str,
    actor_role: str,
    notes: str | None = None,
) -> WarehouseTransferSchema:
    """
    Receive stock at destination warehouse.
    Transition: IN_TRANSIT -> RECEIVED.
    Actions:
      - Source on-hand decreases: on_hand -= qty, reserved -= qty (release reservation)
      - Destination on-hand increases: on_hand += qty, available += qty, inbound -= qty
      - Prevents duplicate receipt
      - Ledger movements written for both source and destination
      - Recalculates shortage & risk analysis
    """
    transfer = db.scalar(
        select(WarehouseTransfer).where(WarehouseTransfer.id == transfer_id).with_for_update()
    )
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TRANSFER_NOT_FOUND", "message": f"Transfer '{transfer_id}' not found."},
        )

    # Duplicate receipt rejection
    if transfer.status == "RECEIVED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "DUPLICATE_RECEIPT", "message": f"Transfer '{transfer_id}' has already been received on {transfer.received_at}."},
        )

    if transfer.status != "IN_TRANSIT":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_TRANSFER_STATE", "message": f"Cannot receive transfer in '{transfer.status}' status (must be IN_TRANSIT)."},
        )

    src_inv = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == transfer.source_warehouse_id, Inventory.sku == transfer.sku)
        .with_for_update()
    )
    dest_inv = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == transfer.destination_warehouse_id, Inventory.sku == transfer.sku)
        .with_for_update()
    )

    if not src_inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SOURCE_INVENTORY_NOT_FOUND", "message": "Source inventory record missing during transfer receipt."},
        )
    if not dest_inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DEST_INVENTORY_NOT_FOUND", "message": "Destination inventory record missing during transfer receipt."},
        )

    # 1. Update Source Warehouse Balance
    src_before = src_inv.on_hand_units
    src_inv.on_hand_units -= transfer.quantity
    src_inv.reserved_units -= transfer.quantity
    if src_inv.reserved_units < 0:
        src_inv.reserved_units = 0
    src_inv.status = _recalculate_inventory_status(src_inv)
    src_inv.last_audited_at = _now()
    src_after = src_inv.on_hand_units

    # 2. Update Destination Warehouse Balance
    dest_before = dest_inv.on_hand_units
    dest_inv.on_hand_units += transfer.quantity
    dest_inv.available_units += transfer.quantity
    if dest_inv.inbound_units >= transfer.quantity:
        dest_inv.inbound_units -= transfer.quantity
    else:
        dest_inv.inbound_units = 0
    dest_inv.status = _recalculate_inventory_status(dest_inv)
    dest_inv.last_audited_at = _now()
    dest_after = dest_inv.on_hand_units

    # 3. Update transfer record
    transfer.status = "RECEIVED"
    transfer.received_by = actor_id
    transfer.received_at = _now()
    if notes:
        transfer.notes = f"{transfer.notes or ''}\n[Receipt Notes]: {notes}".strip()

    # 4. Stock Movement Ledger Entries
    db.add(
        StockMovement(
            id=f"MVT-{uuid.uuid4().hex[:12].upper()}",
            timestamp=_now(),
            movement_type="TRANSFER_OUT",
            warehouse_id=transfer.source_warehouse_id,
            sku=transfer.sku,
            quantity=transfer.quantity,
            balance_before=src_before,
            balance_after=src_after,
            reference_type="TRANSFER",
            reference_id=transfer.id,
            actor_id=actor_id,
            notes=f"Physical stock transfer completed to {transfer.destination_warehouse_id}",
            is_demo=transfer.is_demo,
        )
    )
    db.add(
        StockMovement(
            id=f"MVT-{uuid.uuid4().hex[:12].upper()}",
            timestamp=_now(),
            movement_type="TRANSFER_IN",
            warehouse_id=transfer.destination_warehouse_id,
            sku=transfer.sku,
            quantity=transfer.quantity,
            balance_before=dest_before,
            balance_after=dest_after,
            reference_type="TRANSFER",
            reference_id=transfer.id,
            actor_id=actor_id,
            notes=f"Physical stock received from {transfer.source_warehouse_id}",
            is_demo=transfer.is_demo,
        )
    )

    # 5. Recalculate warehouse capacity & utilization
    src_wh = db.get(Warehouse, transfer.source_warehouse_id)
    dest_wh = db.get(Warehouse, transfer.destination_warehouse_id)
    if src_wh:
        _recalculate_warehouse_utilization(db, src_wh)
    if dest_wh:
        _recalculate_warehouse_utilization(db, dest_wh)

    # 6. Refresh order risks and shortages at destination
    _refresh_affected_orders_risk(db, transfer.destination_warehouse_id, transfer.sku)

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="TRANSFER_RECEIVED",
        entity_type="WarehouseTransfer",
        entity_id=transfer.id,
        reason=notes or f"Transfer {transfer.id} received and balances updated",
        after_state={
            "status": "RECEIVED",
            "receivedBy": actor_id,
            "sourceOnHand": src_after,
            "destinationOnHand": dest_after,
        },
    )
    db.commit()
    return _to_transfer_schema(db, transfer)


def cancel_transfer(
    db: Session,
    transfer_id: str,
    actor_id: str,
    actor_role: str,
    reason: str,
) -> WarehouseTransferSchema:
    """Cancel a transfer and release any reservations."""
    transfer = db.scalar(
        select(WarehouseTransfer).where(WarehouseTransfer.id == transfer_id).with_for_update()
    )
    if not transfer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "TRANSFER_NOT_FOUND", "message": f"Transfer '{transfer_id}' not found."},
        )

    if transfer.status == "RECEIVED":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "ALREADY_RECEIVED", "message": "Cannot cancel a transfer that has already been received."},
        )

    if transfer.status == "CANCELLED":
        return _to_transfer_schema(db, transfer)

    # If IN_TRANSIT, release source reservation and destination inbound
    if transfer.status == "IN_TRANSIT":
        src_inv = db.scalar(
            select(Inventory)
            .where(Inventory.warehouse_id == transfer.source_warehouse_id, Inventory.sku == transfer.sku)
            .with_for_update()
        )
        dest_inv = db.scalar(
            select(Inventory)
            .where(Inventory.warehouse_id == transfer.destination_warehouse_id, Inventory.sku == transfer.sku)
            .with_for_update()
        )
        if src_inv:
            src_inv.reserved_units -= transfer.quantity
            src_inv.available_units += transfer.quantity
            src_inv.status = _recalculate_inventory_status(src_inv)
        if dest_inv:
            dest_inv.inbound_units = max(0, dest_inv.inbound_units - transfer.quantity)

    transfer.status = "CANCELLED"
    transfer.cancelled_by = actor_id
    transfer.cancelled_at = _now()
    transfer.cancellation_reason = reason

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="TRANSFER_CANCELLED",
        entity_type="WarehouseTransfer",
        entity_id=transfer.id,
        reason=reason,
        after_state={"status": "CANCELLED", "cancelledBy": actor_id},
    )
    db.commit()
    return _to_transfer_schema(db, transfer)


# ---------------------------------------------------------------------------
# 6. Shortage Analysis & Movement History
# ---------------------------------------------------------------------------

def get_shortage_analysis(db: Session, warehouse_id: str | None = None) -> list[ShortageAnalysisItem]:
    """Identify inventory items running below safety stock buffer or depleted."""
    stmt = select(Inventory).where(Inventory.available_units < Inventory.safety_stock_threshold)
    if warehouse_id:
        stmt = stmt.where(Inventory.warehouse_id == warehouse_id)
    items = db.scalars(stmt.order_by(Inventory.available_units.asc())).all()

    results: list[ShortageAnalysisItem] = []
    for item in items:
        deficit = max(0, item.safety_stock_threshold - item.available_units)
        affected_count = db.scalar(
            select(func.count(Order.id))
            .join(OrderLine, OrderLine.order_id == Order.id)
            .where(Order.primary_warehouse_id == item.warehouse_id, OrderLine.sku == item.sku)
        ) or 0

        action = "Initiate inter-hub stock transfer"
        if item.available_units == 0:
            action = "URGENT: Expedite air freight replenishment"
        elif item.inbound_units >= deficit:
            action = "Inbound shipment in transit; monitor delivery"

        results.append(
            ShortageAnalysisItem(
                warehouseId=item.warehouse_id,
                warehouseName=item.warehouse_name,
                sku=item.sku,
                skuDescription=item.sku_description,
                onHandUnits=item.on_hand_units,
                availableUnits=item.available_units,
                reservedUnits=item.reserved_units,
                safetyStockThreshold=item.safety_stock_threshold,
                unitsBelowSafety=deficit,
                status=item.status,
                affectedOrdersCount=affected_count,
                pendingInboundUnits=item.inbound_units,
                recommendedAction=action,
            )
        )
    return results


def get_stock_movements(
    db: Session,
    warehouse_id: str | None = None,
    sku: str | None = None,
) -> list[StockMovementSchema]:
    stmt = select(StockMovement)
    if warehouse_id:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    if sku:
        stmt = stmt.where(StockMovement.sku == sku)
    records = db.scalars(stmt.order_by(StockMovement.timestamp.desc()).limit(200)).all()

    results: list[StockMovementSchema] = []
    for m in records:
        wh = db.get(Warehouse, m.warehouse_id)
        prod = db.get(Product, m.sku)
        desc = prod.description if prod else m.sku
        results.append(
            StockMovementSchema(
                id=m.id,
                timestamp=_iso(m.timestamp),
                movementType=m.movement_type,
                warehouseId=m.warehouse_id,
                warehouseName=wh.name if wh else m.warehouse_id,
                sku=m.sku,
                skuDescription=desc,
                quantity=m.quantity,
                balanceBefore=m.balance_before,
                balanceAfter=m.balance_after,
                referenceType=m.reference_type,
                referenceId=m.reference_id,
                actorId=m.actor_id,
                notes=m.notes,
                isDemo=bool(m.is_demo),
            )
        )
    return results
