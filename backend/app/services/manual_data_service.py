"""Manual Operational Data Service for DisruptionIQ.

Handles authorized CRUD mutations for Disruptions, Inventory, Shipments,
Suppliers, and Orders with strict transactional integrity, authoritative risk
re-scoring, duplicate submission handling, and immutable audit logging.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from math import ceil
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models.governance import AuditRecord, DisruptionImpact, DisruptionRecord
from app.models.supply_chain import (
    Inventory,
    Order,
    OrderLine,
    Shipment,
    Supplier,
    Warehouse,
)
from app.schemas.disruption import Disruption, DisruptionCreate, DisruptionUpdate
from app.schemas.inventory import (
    InventoryAdjustmentRequest,
    StockMovementRequest,
    WarehouseInventory,
)
from app.schemas.order import OrderAtRisk, OrderCreate, OrderUpdate
from app.schemas.shipment import Shipment as ShipmentSchema, ShipmentCreate, ShipmentUpdate
from app.schemas.supplier import Supplier as SupplierSchema, SupplierIssueCreate
from app.services.disruption_intelligence import _detect_for_shipment, _impact_and_score, _risk_level, _shipment_skus


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(val: Any) -> str:
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


def _parse_iso(val: str) -> datetime:
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_TIMESTAMP", "message": f"Invalid ISO 8601 timestamp: {val}"},
        ) from e


def record_audit(
    db: Session,
    *,
    actor_id: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    reason: str,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
) -> AuditRecord:
    """Record an audit trail event in the governance audit system."""
    payload: dict[str, Any] = {
        "username": actor_id,
        "role": actor_role,
        "reason": reason,
    }
    if before_state is not None:
        payload["before"] = before_state
    if after_state is not None:
        payload["after"] = after_state

    entry = AuditRecord(
        id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
        timestamp=_now(),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload_json=json.dumps(payload, default=str),
    )
    db.add(entry)
    return entry


def to_disruption_schema(db: Session, record: DisruptionRecord) -> Disruption:
    """Transform DisruptionRecord model into Disruption Pydantic schema."""
    payload = json.loads(record.payload_json or "{}")
    impacts = db.scalars(
        select(DisruptionImpact).where(DisruptionImpact.disruption_id == record.id)
    ).all()
    affected_skus = [impact.entity_id for impact in impacts if impact.entity_type == "sku"]
    shipments = [impact.entity_id for impact in impacts if impact.entity_type == "shipment"]
    warehouses = [impact.entity_id for impact in impacts if impact.entity_type == "warehouse"]
    orders = [impact.entity_id for impact in impacts if impact.entity_type == "order"]
    affected_order_count = len(set(orders)) or int(payload.get("affectedOrderCount", 0))

    return Disruption(
        id=record.id,
        title=record.title,
        type=payload.get("type", "carrier_delay"),
        typeLabel=payload.get("typeLabel")
        or payload.get("type", "carrier_delay").replace("_", " ").title(),
        severity=record.severity,
        status=record.status,
        detectedAt=_iso(record.detected_at),
        location=payload.get("location", ""),
        carrierOrSupplier=payload.get("carrierOrSupplier", ""),
        delayHours=payload.get("delayHours", 0),
        affectedOrderCount=affected_order_count,
        affectedSKUs=sorted(set(affected_skus)) if affected_skus else payload.get("affectedSKUs", []),
        estimatedFinancialImpactUSD=float(payload.get("estimatedFinancialImpactUSD", 0.0)),
        summary=payload.get("summary", ""),
        rootCause=payload.get("rootCause", "Deterministic operational evidence"),
        eventPayload=payload.get("eventPayload", payload),
        timeline=payload.get("timeline", []),
        linkedShipmentIds=sorted(set(shipments)) if shipments else payload.get("linkedShipmentIds", []),
        linkedWarehouseIds=sorted(set(warehouses)) if warehouses else payload.get("linkedWarehouseIds", []),
    )


def to_warehouse_inventory_schema(db: Session, item: Inventory) -> WarehouseInventory:
    warehouse = db.get(Warehouse, item.warehouse_id)
    wh_loc = warehouse.location if warehouse else ""
    return WarehouseInventory(
        id=item.id,
        warehouseId=item.warehouse_id,
        warehouseName=item.warehouse_name,
        warehouseLocation=wh_loc,
        sku=item.sku,
        skuDescription=item.sku_description,
        category=item.category,
        onHandUnits=getattr(item, "on_hand_units", item.available_units + item.reserved_units),
        availableUnits=item.available_units,
        reservedUnits=item.reserved_units,
        inboundUnits=item.inbound_units,
        safetyStockThreshold=item.safety_stock_threshold,
        status=item.status,
        unitCostUSD=float(item.unit_cost_usd),
        lastAuditedAt=_iso(item.last_audited_at),
    )


def to_shipment_schema(item: Shipment) -> ShipmentSchema:
    return ShipmentSchema(
        id=item.id,
        trackingNumber=item.tracking_number,
        carrierName=item.carrier_name,
        transportMode=item.transport_mode,
        origin=item.origin,
        destination=item.destination,
        status=item.status,
        currentLocation=None,
        promisedDeliveryDate=_iso(item.promised_delivery_date),
        estimatedDeliveryDate=_iso(item.estimated_delivery_date),
        delayHours=item.delay_hours,
        supplierId=item.supplier_id,
        supplierName=item.supplier_name,
        cargoDescription=item.cargo_description,
        affectedOrderIds=None,
        affectedOrdersCount=item.affected_orders_count,
    )


def to_supplier_schema(item: Supplier) -> SupplierSchema:
    return SupplierSchema(
        id=item.id,
        name=item.name,
        country=item.country,
        category=item.category,
        tier=item.tier,
        reliabilityScore=item.reliability_score,
        onTimeDeliveryRate=float(item.on_time_delivery_rate),
        averageLeadTimeDays=item.average_lead_time_days,
        delayIncidentsLast90d=item.delay_incidents_last_90d,
        status=item.status,
        contactEmail=item.contact_email,
    )


# ---------------------------------------------------------------------------
# 1. Disruptions Manual Operations
# ---------------------------------------------------------------------------

def create_manual_disruption(
    db: Session,
    payload: DisruptionCreate,
    actor_id: str,
    actor_role: str,
    settings: Settings,
) -> Disruption:
    """Create and persist a new manual disruption with validated relationships."""
    # Check idempotency
    if payload.idempotencyKey:
        source_key = f"manual:{payload.idempotencyKey}"
        existing = db.scalar(select(DisruptionRecord).where(DisruptionRecord.source_key == source_key))
        if existing:
            return to_disruption_schema(db, existing)
    else:
        source_key = f"manual:{uuid.uuid4().hex[:12]}"

    # Validate referenced entities
    shipment: Shipment | None = None
    if payload.affectedShipmentId:
        shipment = db.get(Shipment, payload.affectedShipmentId)
        if not shipment:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_REFERENCE", "message": f"Referenced shipment '{payload.affectedShipmentId}' not found."},
            )

    supplier: Supplier | None = None
    if payload.affectedSupplierId:
        supplier = db.get(Supplier, payload.affectedSupplierId)
        if not supplier:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_REFERENCE", "message": f"Referenced supplier '{payload.affectedSupplierId}' not found."},
            )

    warehouse: Warehouse | None = None
    if payload.affectedWarehouseId:
        warehouse = db.get(Warehouse, payload.affectedWarehouseId)
        if not warehouse:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_REFERENCE", "message": f"Referenced warehouse '{payload.affectedWarehouseId}' not found."},
            )

    valid_orders: list[Order] = []
    seen_order_ids: set[str] = set()
    if payload.affectedOrderIds:
        for ord_id in payload.affectedOrderIds:
            if ord_id in seen_order_ids:
                continue
            ord_obj = db.get(Order, ord_id)
            if not ord_obj:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"code": "INVALID_REFERENCE", "message": f"Referenced order '{ord_id}' not found."},
                )
            valid_orders.append(ord_obj)
            seen_order_ids.add(ord_id)

    # A manual SKU mapping is operational evidence, not free text.  Ensure it
    # points to a real inventory SKU before it can drive order resolution.
    selected_skus = sorted(set(payload.affectedSKUs or []))
    if selected_skus:
        known_skus = set(db.scalars(select(Inventory.sku).where(Inventory.sku.in_(selected_skus))).all())
        missing_skus = sorted(set(selected_skus) - known_skus)
        if missing_skus:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_REFERENCE", "message": f"Unknown affected SKU(s): {', '.join(missing_skus)}."},
            )

    detected_at = _parse_iso(payload.detectedAt) if payload.detectedAt else _now()
    disruption_id = f"DIS-MANUAL-{uuid.uuid4().hex[:8].upper()}"

    # Compile timeline
    timeline_events = [
        {
            "id": f"evt-{uuid.uuid4().hex[:6]}",
            "timestamp": _iso(detected_at),
            "title": f"Manual Disruption Reported: {payload.title}",
            "description": payload.summary,
            "source": payload.source or f"User: {actor_id} ({actor_role})",
        }
    ]

    record_payload = {
        "type": payload.type,
        "typeLabel": payload.type.replace("_", " ").title(),
        "summary": payload.summary,
        "rootCause": payload.rootCause or "Manual operational report",
        "location": payload.location,
        "carrierOrSupplier": payload.carrierOrSupplier or (shipment.carrier_name if shipment else supplier.name if supplier else ""),
        "delayHours": payload.delayHours,
        "estimatedFinancialImpactUSD": payload.estimatedFinancialImpactUSD or 0.0,
        "affectedOrderCount": len(valid_orders),
        "affectedSKUs": selected_skus,
        "timeline": timeline_events,
        "evidence": payload.evidence or [{"kind": "manual_report", "facts": {"reporter": actor_id, "reason": payload.reason}}],
    }

    record = DisruptionRecord(
        id=disruption_id,
        title=payload.title,
        severity=payload.severity.lower(),
        status=payload.status.lower(),
        detected_at=detected_at,
        source_key=source_key,
        payload_json=json.dumps(record_payload, default=str),
    )
    db.add(record)
    db.flush()

    # Build impact links before writing them so inferred and explicitly selected
    # relationships share one deduplicated, transactional persistence path.
    impacts: dict[tuple[str, str], dict[str, Any]] = {}

    def add_impact(entity_type: str, entity_id: str, evidence: dict[str, Any]) -> None:
        impacts.setdefault((entity_type, entity_id), evidence)

    if shipment:
        add_impact("shipment", shipment.id, {"kind": "affected_shipment", "facts": {"trackingNumber": shipment.tracking_number, "carrier": shipment.carrier_name}})
    if supplier:
        add_impact("supplier", supplier.id, {"kind": "affected_supplier", "facts": {"name": supplier.name, "category": supplier.category}})
    if warehouse:
        add_impact("warehouse", warehouse.id, {"kind": "affected_warehouse", "facts": {"name": warehouse.name, "city": warehouse.city}})
    for sku in selected_skus:
        add_impact("sku", sku, {"kind": "affected_sku", "facts": {"sku": sku}})

    # Link Orders and compute risk
    for ord_obj in valid_orders:
        ord_obj.associated_disruption_id = disruption_id
        # Authoritative score if not already scored
        if ord_obj.risk_score < 50:
            ord_obj.risk_score = 75
            ord_obj.risk_level = _risk_level(75)
            ord_obj.explanation = f"Linked to manual disruption {disruption_id}: {payload.title}"
        add_impact("order", ord_obj.id, {"kind": "directly_affected_order", "facts": {"priority": ord_obj.priority, "riskScore": ord_obj.risk_score}})

    # For a real shipment, use the same deterministic impact resolver as carrier
    # events.  It joins manifest SKUs, destination warehouse, deadline and actual
    # availability; a title or description alone never creates an order link.
    if not valid_orders and shipment:
        shipment_skus = selected_skus or _shipment_skus(db, shipment)
        for entity_type, entity_id, evidence in _impact_and_score(db, record, shipment, shipment_skus, settings):
            add_impact(entity_type, entity_id, evidence)
    # An explicitly selected SKU + warehouse is sufficient operational context
    # for a manual inventory disruption.  A SKU alone is deliberately not
    # enough: it could match orders across unrelated facilities.
    elif not valid_orders and selected_skus and warehouse:
        statement = select(Order).join(OrderLine, OrderLine.order_id == Order.id).where(OrderLine.sku.in_(selected_skus)).distinct()
        statement = statement.where(Order.primary_warehouse_id == warehouse.id)
        for cand in db.scalars(statement).all():
            cand.associated_disruption_id = disruption_id
            add_impact("order", cand.id, {"kind": "selected_sku_mapping", "facts": {"skus": selected_skus, "warehouseId": warehouse.id if warehouse else None}})

    for (entity_type, entity_id), evidence in impacts.items():
        db.add(DisruptionImpact(
            disruption_id=disruption_id,
            entity_type=entity_type,
            entity_id=entity_id,
            evidence_json=json.dumps(evidence),
        ))

    record_payload["affectedOrderCount"] = sum(1 for entity_type, _ in impacts if entity_type == "order")
    record.payload_json = json.dumps(record_payload, default=str)

    # Record Audit
    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="CREATE_DISRUPTION",
        entity_type="Disruption",
        entity_id=disruption_id,
        reason=payload.reason or "Manual disruption registration",
        after_state={"id": disruption_id, "title": payload.title, "severity": payload.severity, "type": payload.type},
    )

    db.commit()
    return to_disruption_schema(db, record)


def update_disruption(
    db: Session,
    disruption_id: str,
    payload: DisruptionUpdate,
    actor_id: str,
    actor_role: str,
) -> Disruption:
    """Update disruption status, severity, or timeline evidence."""
    record = db.get(DisruptionRecord, disruption_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Disruption '{disruption_id}' not found."},
        )

    data = json.loads(record.payload_json or "{}")
    before_state = {
        "status": record.status,
        "severity": record.severity,
        "title": record.title,
        "delayHours": data.get("delayHours"),
    }

    if payload.status:
        record.status = payload.status.lower()
        data["status"] = record.status
    if payload.severity:
        record.severity = payload.severity.lower()
        data["severity"] = record.severity
    if payload.title:
        record.title = payload.title
        data["title"] = payload.title
    if payload.summary:
        data["summary"] = payload.summary
    if payload.delayHours is not None:
        data["delayHours"] = payload.delayHours
    if payload.estimatedFinancialImpactUSD is not None:
        data["estimatedFinancialImpactUSD"] = payload.estimatedFinancialImpactUSD

    timeline = data.setdefault("timeline", [])
    if payload.newTimelineEvent:
        timeline.append(payload.newTimelineEvent)
    else:
        timeline.append({
            "id": f"evt-{uuid.uuid4().hex[:6]}",
            "timestamp": _iso(_now()),
            "title": f"Disruption updated by {actor_id}",
            "description": payload.reason,
            "source": f"User: {actor_id} ({actor_role})",
        })

    if payload.newEvidence:
        data.setdefault("evidence", []).append(payload.newEvidence)

    record.payload_json = json.dumps(data, default=str)

    after_state = {
        "status": record.status,
        "severity": record.severity,
        "title": record.title,
        "delayHours": data.get("delayHours"),
    }

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="UPDATE_DISRUPTION",
        entity_type="Disruption",
        entity_id=disruption_id,
        reason=payload.reason,
        before_state=before_state,
        after_state=after_state,
    )

    db.commit()
    return to_disruption_schema(db, record)


# ---------------------------------------------------------------------------
# 2. Inventory & Warehouses Operations
# ---------------------------------------------------------------------------

def adjust_inventory(
    db: Session,
    payload: InventoryAdjustmentRequest,
    actor_id: str,
    actor_role: str,
) -> WarehouseInventory:
    """Perform a transactional inventory adjustment with negative stock protection."""
    item = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == payload.warehouseId, Inventory.sku == payload.sku)
        .with_for_update()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Inventory record for SKU '{payload.sku}' at warehouse '{payload.warehouseId}' was not found."},
        )

    current_on_hand = getattr(item, "on_hand_units", item.available_units + item.reserved_units)
    before_state = {
        "onHandUnits": current_on_hand,
        "availableUnits": item.available_units,
        "reservedUnits": item.reserved_units,
        "status": item.status,
    }

    if payload.quantityDelta is not None:
        new_on_hand = current_on_hand + payload.quantityDelta
    elif payload.newOnHandUnits is not None:
        new_on_hand = payload.newOnHandUnits
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_ADJUSTMENT", "message": "Must provide either quantityDelta or newOnHandUnits."},
        )

    if new_on_hand < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "NEGATIVE_STOCK_FORBIDDEN", "message": f"Adjustment would result in negative on-hand stock ({new_on_hand})."},
        )

    new_available = new_on_hand - item.reserved_units
    if new_available < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "RESERVATION_BREACH",
                "message": f"Adjustment leaves {new_available} available units, breaching existing reservations ({item.reserved_units} units reserved).",
            },
        )

    # Re-calculate derived status according to safety stock threshold
    if new_available == 0:
        new_status = "depleted"
    elif new_available < item.safety_stock_threshold:
        new_status = "critical"
    elif new_available < int(item.safety_stock_threshold * 1.5):
        new_status = "constrained"
    else:
        new_status = "healthy"

    item.on_hand_units = new_on_hand
    item.available_units = new_available
    item.status = new_status
    item.last_audited_at = _now()

    after_state = {
        "onHandUnits": new_on_hand,
        "availableUnits": new_available,
        "reservedUnits": item.reserved_units,
        "status": new_status,
    }

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="INVENTORY_ADJUST",
        entity_type="Inventory",
        entity_id=item.id,
        reason=payload.reason,
        before_state=before_state,
        after_state=after_state,
    )

    db.commit()
    return to_warehouse_inventory_schema(db, item)


def transfer_stock(
    db: Session,
    payload: StockMovementRequest,
    actor_id: str,
    actor_role: str,
) -> dict[str, WarehouseInventory]:
    """Transfer physical inventory from one warehouse to another transactionally."""
    if payload.fromWarehouseId == payload.toWarehouseId:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "IDENTICAL_WAREHOUSES", "message": "Source and destination warehouses must be different."},
        )
    if payload.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_QUANTITY", "message": "Transfer quantity must be greater than zero."},
        )

    source = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == payload.fromWarehouseId, Inventory.sku == payload.sku)
        .with_for_update()
    )
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Source inventory for SKU '{payload.sku}' at '{payload.fromWarehouseId}' not found."},
        )

    if source.available_units < payload.quantity:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INSUFFICIENT_STOCK",
                "message": f"Insufficient available units at {payload.fromWarehouseId} (available: {source.available_units}, requested: {payload.quantity}).",
            },
        )

    dest = db.scalar(
        select(Inventory)
        .where(Inventory.warehouse_id == payload.toWarehouseId, Inventory.sku == payload.sku)
        .with_for_update()
    )
    if not dest:
        # Create target inventory slot
        dest_wh = db.get(Warehouse, payload.toWarehouseId)
        if not dest_wh:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "RESOURCE_NOT_FOUND", "message": f"Destination warehouse '{payload.toWarehouseId}' not found."},
            )
        dest = Inventory(
            id=f"INV-{payload.toWarehouseId}-{payload.sku}",
            warehouse_id=dest_wh.id,
            warehouse_name=dest_wh.name,
            sku=payload.sku,
            sku_description=source.sku_description,
            category=source.category,
            on_hand_units=0,
            available_units=0,
            reserved_units=0,
            inbound_units=0,
            safety_stock_threshold=source.safety_stock_threshold,
            unit_cost_usd=source.unit_cost_usd,
            status="depleted",
            last_audited_at=_now(),
        )
        db.add(dest)
        db.flush()

    # Deduct from source
    src_on_hand = getattr(source, "on_hand_units", source.available_units + source.reserved_units)
    source.on_hand_units = src_on_hand - payload.quantity
    source.available_units = source.available_units - payload.quantity
    if source.available_units == 0:
        source.status = "depleted"
    elif source.available_units < source.safety_stock_threshold:
        source.status = "critical"
    elif source.available_units < int(source.safety_stock_threshold * 1.5):
        source.status = "constrained"
    else:
        source.status = "healthy"

    # Add to destination
    dest_on_hand = getattr(dest, "on_hand_units", dest.available_units + dest.reserved_units)
    dest.on_hand_units = dest_on_hand + payload.quantity
    dest.available_units = dest.available_units + payload.quantity
    if dest.available_units == 0:
        dest.status = "depleted"
    elif dest.available_units < dest.safety_stock_threshold:
        dest.status = "critical"
    elif dest.available_units < int(dest.safety_stock_threshold * 1.5):
        dest.status = "constrained"
    else:
        dest.status = "healthy"

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="STOCK_TRANSFER_OUT",
        entity_type="Inventory",
        entity_id=source.id,
        reason=f"Transferred {payload.quantity} units to {payload.toWarehouseId}. {payload.reason}",
    )
    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="STOCK_TRANSFER_IN",
        entity_type="Inventory",
        entity_id=dest.id,
        reason=f"Received {payload.quantity} units from {payload.fromWarehouseId}. {payload.reason}",
    )

    db.commit()
    return {
        "source": to_warehouse_inventory_schema(db, source),
        "destination": to_warehouse_inventory_schema(db, dest),
    }


# ---------------------------------------------------------------------------
# 3. Shipments & Suppliers Operations
# ---------------------------------------------------------------------------

def create_shipment(
    db: Session,
    payload: ShipmentCreate,
    actor_id: str,
    actor_role: str,
    settings: Settings,
) -> ShipmentSchema:
    """Register a new inbound shipment and trigger disruption detection if delayed."""
    existing = db.scalar(select(Shipment).where(Shipment.tracking_number == payload.trackingNumber))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "DUPLICATE_TRACKING_NUMBER", "message": f"Tracking number '{payload.trackingNumber}' already exists."},
        )

    supplier = db.get(Supplier, payload.supplierId)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Supplier '{payload.supplierId}' not found."},
        )

    promised_date = _parse_iso(payload.promisedDeliveryDate)
    estimated_date = _parse_iso(payload.estimatedDeliveryDate)
    delay_hours = max(0, ceil((estimated_date - promised_date).total_seconds() / 3600))
    shipment_status = "delayed" if delay_hours > 0 else "on_schedule"

    shipment_id = f"SHP-MANUAL-{uuid.uuid4().hex[:6].upper()}"
    shipment = Shipment(
        id=shipment_id,
        tracking_number=payload.trackingNumber,
        carrier_name=payload.carrierName,
        transport_mode=payload.transportMode,
        origin=payload.origin,
        destination=payload.destination,
        status=shipment_status,
        delay_hours=delay_hours,
        supplier_id=supplier.id,
        supplier_name=supplier.name,
        cargo_description=payload.cargoDescription,
        promised_delivery_date=promised_date,
        estimated_delivery_date=estimated_date,
        affected_orders_count=0,
        last_event_at=_now(),
    )
    db.add(shipment)
    db.flush()

    if delay_hours > 0 or shipment_status in ("delayed", "customs_hold"):
        _detect_for_shipment(db, shipment, _now(), settings)

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="CREATE_SHIPMENT",
        entity_type="Shipment",
        entity_id=shipment.id,
        reason=payload.reason or "Manual shipment registration",
        after_state={"trackingNumber": payload.trackingNumber, "carrier": payload.carrierName, "status": shipment_status, "delayHours": delay_hours},
    )

    db.commit()
    return to_shipment_schema(shipment)


def update_shipment(
    db: Session,
    shipment_id: str,
    payload: ShipmentUpdate,
    actor_id: str,
    actor_role: str,
    settings: Settings,
) -> ShipmentSchema:
    """Update shipment status or ETA and link into the disruption workflow if delayed."""
    shipment = db.get(Shipment, shipment_id)
    if not shipment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Shipment '{shipment_id}' was not found."},
        )

    before_state = {
        "status": shipment.status,
        "estimatedDeliveryDate": _iso(shipment.estimated_delivery_date),
        "delayHours": shipment.delay_hours,
    }

    if payload.estimatedDeliveryDate:
        new_estimated = _parse_iso(payload.estimatedDeliveryDate)
        shipment.estimated_delivery_date = new_estimated
        shipment.delay_hours = max(0, ceil((new_estimated - shipment.promised_delivery_date.replace(tzinfo=timezone.utc if shipment.promised_delivery_date.tzinfo is None else shipment.promised_delivery_date.tzinfo)).total_seconds() / 3600))

    if payload.status:
        shipment.status = payload.status
    if payload.delayHours is not None:
        shipment.delay_hours = payload.delayHours

    shipment.last_event_at = _now()

    if shipment.delay_hours > 0 or shipment.status in ("delayed", "customs_hold"):
        _detect_for_shipment(db, shipment, _now(), settings)

    after_state = {
        "status": shipment.status,
        "estimatedDeliveryDate": _iso(shipment.estimated_delivery_date),
        "delayHours": shipment.delay_hours,
    }

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="UPDATE_SHIPMENT",
        entity_type="Shipment",
        entity_id=shipment.id,
        reason=payload.reason,
        before_state=before_state,
        after_state=after_state,
    )

    db.commit()
    return to_shipment_schema(shipment)


def record_supplier_issue(
    db: Session,
    payload: SupplierIssueCreate,
    actor_id: str,
    actor_role: str,
    settings: Settings,
) -> SupplierSchema:
    """Record an operational issue against a supplier and trigger disruption if critical."""
    supplier = db.get(Supplier, payload.supplierId)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Supplier '{payload.supplierId}' not found."},
        )

    before_state = {
        "delayIncidents": supplier.delay_incidents_last_90d,
        "status": supplier.status,
    }

    supplier.delay_incidents_last_90d += 1
    if payload.severity in ("critical", "high"):
        supplier.status = "conditional" if supplier.status == "preferred" else supplier.status

    # If critical/high or delay days > 0, generate/update disruption
    if payload.severity in ("critical", "high") or payload.estimatedDelayDays > 0:
        from app.services.disruption_intelligence import _upsert_disruption, _replace_impacts
        delay_h = payload.estimatedDelayDays * 24
        source_key = f"supplier_issue:{supplier.id}:{uuid.uuid4().hex[:6]}"
        dis_record = _upsert_disruption(
            db,
            disruption_type="supplier_delay",
            source_key=source_key,
            title=f"Supplier Alert: {supplier.name} - {payload.title}",
            detected_at=_now(),
            delay_hours=delay_h,
            summary=payload.description,
            evidence=[{"kind": "supplier_issue", "facts": {"supplierId": supplier.id, "issueType": payload.issueType, "severity": payload.severity}}],
        )
        _replace_impacts(
            db,
            dis_record,
            [("supplier", supplier.id, {"kind": "supplier_issue", "facts": {"title": payload.title, "severity": payload.severity}})],
        )

    after_state = {
        "delayIncidents": supplier.delay_incidents_last_90d,
        "status": supplier.status,
    }

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="SUPPLIER_ISSUE_REPORTED",
        entity_type="Supplier",
        entity_id=supplier.id,
        reason=payload.reason,
        before_state=before_state,
        after_state=after_state,
    )

    db.commit()
    return to_supplier_schema(supplier)


# ---------------------------------------------------------------------------
# 4. Orders & Orders at Risk Operations
# ---------------------------------------------------------------------------

def calculate_order_risk(
    db: Session,
    order: Order,
    lines: list[OrderLine],
    settings: Settings,
) -> tuple[int, str, str]:
    """Deterministically compute order risk score, level, and explanation based on live data."""
    now = settings.simulation_clock.replace(tzinfo=timezone.utc if settings.simulation_clock.tzinfo is None else settings.simulation_clock.tzinfo)
    order_deadline = order.promised_deadline.replace(tzinfo=timezone.utc if order.promised_deadline.tzinfo is None else order.promised_deadline.tzinfo)
    hours_to_deadline = (order_deadline - now).total_seconds() / 3600

    score = 0
    factors: list[str] = []

    # 1. Proximity to deadline
    if hours_to_deadline <= 24:
        score += settings.risk_weight_deadline
        factors.append(f"deadline proximity ({round(hours_to_deadline, 1)}h remaining)")

    # 2. Check stock shortages at primary warehouse
    has_shortage = False
    for line in lines:
        inv = db.scalar(
            select(Inventory).where(Inventory.warehouse_id == order.primary_warehouse_id, Inventory.sku == line.sku)
        )
        available = inv.available_units if inv else 0
        if available < line.quantity:
            has_shortage = True
            factors.append(f"stock shortage for {line.sku} (need {line.quantity}, avail {available})")
    if has_shortage:
        score += settings.risk_weight_shortage

    # 3. Check if any delayed inbound shipment affects these SKUs
    skus = [l.sku for l in lines]
    delayed_shipment = db.scalar(
        select(Shipment)
        .where(
            Shipment.status.in_(["delayed", "customs_hold"]),
            Shipment.estimated_delivery_date > order.promised_deadline,
        )
        .limit(1)
    )
    if delayed_shipment:
        # Check if cargo mentions any of the SKUs
        for sku in skus:
            if sku in delayed_shipment.cargo_description:
                score += settings.risk_weight_delay
                factors.append(f"inbound delay on {delayed_shipment.tracking_number}")
                break

    score = min(100, score)
    level = _risk_level(score)
    explanation = "Authoritative risk score: " + ("; ".join(factors) if factors else "Nominal buffer")
    return score, level, explanation


def create_order(
    db: Session,
    payload: OrderCreate,
    actor_id: str,
    actor_role: str,
    settings: Settings,
) -> OrderAtRisk:
    """Create a customer order with validated lines and authoritative risk scoring."""
    warehouse = db.get(Warehouse, payload.primaryWarehouseId)
    if not warehouse:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Primary warehouse '{payload.primaryWarehouseId}' not found."},
        )

    if not payload.orderLines:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "EMPTY_ORDER", "message": "Order must contain at least one order line."},
        )

    deadline = _parse_iso(payload.promisedDeadline)
    now = settings.simulation_clock.replace(tzinfo=timezone.utc if settings.simulation_clock.tzinfo is None else settings.simulation_clock.tzinfo)
    hours_until_breach = max(0, ceil((deadline - now).total_seconds() / 3600))

    order_id = f"ORD-MANUAL-{uuid.uuid4().hex[:6].upper()}"
    total_val = 0.0

    lines: list[OrderLine] = []
    for idx, l in enumerate(payload.orderLines):
        inv = db.scalar(select(Inventory).where(Inventory.sku == l.sku).limit(1))
        sku_desc = l.skuDescription or (inv.sku_description if inv else f"SKU {l.sku}")
        line_total = l.quantity * l.unitPriceUSD
        total_val += line_total
        line = OrderLine(
            id=f"{order_id}-L{idx + 1}",
            order_id=order_id,
            sku=l.sku,
            sku_description=sku_desc,
            quantity=l.quantity,
            unit_price_usd=l.unitPriceUSD,
            line_total_usd=line_total,
        )
        lines.append(line)

    order = Order(
        id=order_id,
        customer_name=payload.customerName,
        customer_tier=payload.customerTier,
        priority=payload.priority,
        promised_deadline=deadline,
        hours_until_breach=hours_until_breach,
        order_value_usd=round(total_val, 2),
        risk_score=0,
        risk_level="low",
        mitigation_status="unmitigated",
        associated_disruption_id=None,
        primary_warehouse_id=warehouse.id,
        fulfillment_policy=payload.fulfillmentPolicy,
        explanation="",
    )

    score, level, explanation = calculate_order_risk(db, order, lines, settings)
    order.risk_score = score
    order.risk_level = level
    order.explanation = explanation

    db.add(order)
    for line in lines:
        db.add(line)

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="CREATE_ORDER",
        entity_type="Order",
        entity_id=order.id,
        reason=payload.reason or "Manual order registration",
        after_state={"customer": order.customer_name, "priority": order.priority, "riskScore": score, "totalValue": total_val},
    )

    db.commit()

    first_line = lines[0]
    return OrderAtRisk(
        id=order.id,
        customerName=order.customer_name,
        customerTier=order.customer_tier,
        sku=first_line.sku,
        skuDescription=first_line.sku_description,
        quantityUnits=first_line.quantity,
        orderValueUSD=float(order.order_value_usd),
        promisedDeadline=_iso(order.promised_deadline),
        hoursUntilBreach=order.hours_until_breach,
        priority=order.priority,
        riskScore=order.risk_score,
        riskLevel=order.risk_level,
        primaryWarehouseId=order.primary_warehouse_id,
        associatedDisruptionId=order.associated_disruption_id or "",
        fulfillmentPolicy=order.fulfillment_policy,
        explanation=order.explanation,
        mitigationStatus=order.mitigation_status,
    )


def update_order(
    db: Session,
    order_id: str,
    payload: OrderUpdate,
    actor_id: str,
    actor_role: str,
    settings: Settings,
) -> OrderAtRisk:
    """Update order priority, deadline, or fulfillment policy and recalculate risk score."""
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "RESOURCE_NOT_FOUND", "message": f"Order '{order_id}' was not found."},
        )

    before_state = {
        "priority": order.priority,
        "deadline": _iso(order.promised_deadline),
        "riskScore": order.risk_score,
        "riskLevel": order.risk_level,
    }

    if payload.priority:
        order.priority = payload.priority
    if payload.customerTier:
        order.customer_tier = payload.customerTier
    if payload.fulfillmentPolicy:
        order.fulfillment_policy = payload.fulfillmentPolicy
    if payload.mitigationStatus:
        order.mitigation_status = payload.mitigationStatus
    if payload.primaryWarehouseId:
        wh = db.get(Warehouse, payload.primaryWarehouseId)
        if not wh:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "RESOURCE_NOT_FOUND", "message": f"Warehouse '{payload.primaryWarehouseId}' not found."},
            )
        order.primary_warehouse_id = wh.id
    if payload.promisedDeadline:
        order.promised_deadline = _parse_iso(payload.promisedDeadline)
        now = settings.simulation_clock.replace(tzinfo=timezone.utc if settings.simulation_clock.tzinfo is None else settings.simulation_clock.tzinfo)
        order.hours_until_breach = max(0, ceil((order.promised_deadline.replace(tzinfo=timezone.utc if order.promised_deadline.tzinfo is None else order.promised_deadline.tzinfo) - now).total_seconds() / 3600))

    lines = db.scalars(select(OrderLine).where(OrderLine.order_id == order.id)).all()
    score, level, explanation = calculate_order_risk(db, order, list(lines), settings)
    order.risk_score = score
    order.risk_level = level
    order.explanation = explanation

    after_state = {
        "priority": order.priority,
        "deadline": _iso(order.promised_deadline),
        "riskScore": order.risk_score,
        "riskLevel": order.risk_level,
    }

    record_audit(
        db,
        actor_id=actor_id,
        actor_role=actor_role,
        action="UPDATE_ORDER",
        entity_type="Order",
        entity_id=order.id,
        reason=payload.reason,
        before_state=before_state,
        after_state=after_state,
    )

    db.commit()

    first_line = lines[0] if lines else None
    return OrderAtRisk(
        id=order.id,
        customerName=order.customer_name,
        customerTier=order.customer_tier,
        sku=first_line.sku if first_line else "",
        skuDescription=first_line.sku_description if first_line else "",
        quantityUnits=first_line.quantity if first_line else 0,
        orderValueUSD=float(order.order_value_usd),
        promisedDeadline=_iso(order.promised_deadline),
        hoursUntilBreach=order.hours_until_breach,
        priority=order.priority,
        riskScore=order.risk_score,
        riskLevel=order.risk_level,
        primaryWarehouseId=order.primary_warehouse_id,
        associatedDisruptionId=order.associated_disruption_id or "",
        fulfillmentPolicy=order.fulfillment_policy,
        explanation=order.explanation,
        mitigationStatus=order.mitigation_status,
    )
