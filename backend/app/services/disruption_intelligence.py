"""Deterministic disruption ingestion, detection, impact analysis, and scoring."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from math import ceil
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.models import CarrierWebhookEvent, DisruptionImpact, DisruptionRecord, Inventory, Order, OrderLine, Shipment, Supplier, Warehouse
from app.schemas.webhook import CarrierWebhook


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _iso(value: datetime) -> str:
    return _utc(value).isoformat().replace("+00:00", "Z")


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _canonical_event(event: CarrierWebhook) -> tuple[str, str]:
    """Return a stable serialized body and hash for idempotency comparisons."""
    payload = _json(event.model_dump(mode="json", by_alias=True))
    return payload, hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _payload(record: DisruptionRecord) -> dict[str, Any]:
    return json.loads(record.payload_json or "{}")


def _disruption_id(source_key: str) -> str:
    return "DIS-" + hashlib.sha256(source_key.encode()).hexdigest()[:12].upper()


def _severity(delay_hours: int, shortage: bool = False) -> str:
    if shortage or delay_hours >= 48:
        return "critical"
    if delay_hours >= 24:
        return "high"
    return "medium"


def _upsert_disruption(db: Session, *, disruption_type: str, source_key: str, title: str, detected_at: datetime, delay_hours: int, summary: str, evidence: list[dict[str, Any]]) -> DisruptionRecord:
    record = db.scalar(select(DisruptionRecord).where(DisruptionRecord.source_key == source_key))
    payload = {"type": disruption_type, "summary": summary, "evidence": evidence, "delayHours": delay_hours}
    if record is None:
        record = DisruptionRecord(id=_disruption_id(source_key), title=title, severity=_severity(delay_hours, disruption_type == "inventory_shortage"), status="active", detected_at=detected_at, source_key=source_key, payload_json=_json(payload))
        db.add(record)
        db.flush()
    else:
        record.title, record.severity, record.status, record.detected_at, record.payload_json = title, _severity(delay_hours, disruption_type == "inventory_shortage"), "active", detected_at, _json(payload)
    return record


def _replace_impacts(db: Session, disruption: DisruptionRecord, impacts: list[tuple[str, str, dict[str, Any]]]) -> None:
    db.query(DisruptionImpact).filter(DisruptionImpact.disruption_id == disruption.id).delete(synchronize_session=False)
    seen: set[tuple[str, str]] = set()
    for entity_type, entity_id, evidence in impacts:
        key = (entity_type, entity_id)
        if key in seen:
            continue
        seen.add(key)
        db.add(DisruptionImpact(disruption_id=disruption.id, entity_type=entity_type, entity_id=entity_id, evidence_json=_json(evidence)))


def _shipment_skus(db: Session, shipment: Shipment) -> list[str]:
    known = db.scalars(select(OrderLine.sku).distinct()).all()
    return sorted({sku for sku in known if re.search(rf"(?<![A-Z0-9-]){re.escape(sku)}(?![A-Z0-9-])", shipment.cargo_description)})


def _destination_warehouses(db: Session, shipment: Shipment) -> list[Warehouse]:
    destination = shipment.destination.lower()
    return [warehouse for warehouse in db.scalars(select(Warehouse)).all() if warehouse.city.lower() in destination or warehouse.location.lower() in destination]


def _risk_level(score: int) -> str:
    return "critical" if score >= 80 else "high" if score >= 55 else "medium" if score >= 25 else "low"


def _impact_and_score(db: Session, disruption: DisruptionRecord, shipment: Shipment, skus: list[str], settings: Settings) -> list[tuple[str, str, dict[str, Any]]]:
    warehouses = _destination_warehouses(db, shipment)
    warehouse_ids = {warehouse.id for warehouse in warehouses}
    now = _utc(settings.simulation_clock)
    impacts: list[tuple[str, str, dict[str, Any]]] = [("shipment", shipment.id, {"kind": "shipment_delay", "facts": {"estimatedDeliveryDate": _iso(shipment.estimated_delivery_date), "promisedDeliveryDate": _iso(shipment.promised_delivery_date), "delayHours": shipment.delay_hours}})]
    for sku in skus:
        impacts.append(("sku", sku, {"kind": "cargo_sku", "facts": {"shipmentId": shipment.id}}))
    for warehouse in warehouses:
        impacts.append(("warehouse", warehouse.id, {"kind": "destination_warehouse", "facts": {"shipmentId": shipment.id}}))

    statement = select(Order, OrderLine).join(OrderLine, OrderLine.order_id == Order.id).where(OrderLine.sku.in_(skus))
    if warehouse_ids:
        statement = statement.where(Order.primary_warehouse_id.in_(warehouse_ids))
    affected: dict[str, list[OrderLine]] = {}
    orders: dict[str, Order] = {}
    for order, line in db.execute(statement).all():
        orders[order.id] = order
        affected.setdefault(order.id, []).append(line)

    for order_id, lines in affected.items():
        order = orders[order_id]
        factors: list[dict[str, Any]] = []
        score = 0
        if _utc(shipment.estimated_delivery_date) > _utc(order.promised_deadline):
            score += settings.risk_weight_delay
            factors.append({"kind": "delivery_after_deadline", "facts": {"estimatedDeliveryDate": _iso(shipment.estimated_delivery_date), "promisedDeadline": _iso(order.promised_deadline), "weight": settings.risk_weight_delay}})
        shortages = []
        for line in lines:
            inventory = db.scalar(select(Inventory).where(Inventory.warehouse_id == order.primary_warehouse_id, Inventory.sku == line.sku))
            available = inventory.available_units if inventory else 0
            if available < line.quantity:
                shortages.append({"sku": line.sku, "required": line.quantity, "available": available})
                impacts.append(("inventory", inventory.id if inventory else f"{order.primary_warehouse_id}:{line.sku}", {"kind": "available_quantity_shortage", "facts": shortages[-1] | {"warehouseId": order.primary_warehouse_id}}))
        if shortages:
            score += settings.risk_weight_shortage
            factors.append({"kind": "inventory_shortage", "facts": {"shortages": shortages, "weight": settings.risk_weight_shortage}})
        hours_to_deadline = ( _utc(order.promised_deadline) - now).total_seconds() / 3600
        if hours_to_deadline <= 24:
            score += settings.risk_weight_deadline
            factors.append({"kind": "deadline_proximity", "facts": {"hoursUntilDeadline": round(hours_to_deadline, 2), "weight": settings.risk_weight_deadline}})
        score = min(100, score)
        if score:
            order.risk_score, order.risk_level, order.associated_disruption_id = score, _risk_level(score), disruption.id
            order.explanation = "Deterministic score: " + "; ".join(factor["kind"] for factor in factors)
            impacts.append(("order", order.id, {"kind": "deterministic_risk_score", "facts": {"score": score, "factors": factors}}))
            for line in lines:
                impacts.append(("order_line", line.id, {"kind": "affected_order_line", "facts": {"sku": line.sku, "quantity": line.quantity, "orderId": order.id}}))
    shipment.affected_orders_count = len(affected)
    return impacts


def _detect_for_shipment(db: Session, shipment: Shipment, detected_at: datetime, settings: Settings) -> list[str]:
    skus = _shipment_skus(db, shipment)
    delayed = _utc(shipment.estimated_delivery_date) > _utc(shipment.promised_delivery_date) or shipment.status in {"delayed", "customs_hold"}
    if not delayed:
        return []
    delay_hours = max(shipment.delay_hours, ceil((_utc(shipment.estimated_delivery_date) - _utc(shipment.promised_delivery_date)).total_seconds() / 3600))
    evidence = [{"kind": "delivery_comparison", "facts": {"shipmentId": shipment.id, "estimatedDeliveryDate": _iso(shipment.estimated_delivery_date), "promisedDeliveryDate": _iso(shipment.promised_delivery_date), "simulationClock": _iso(settings.simulation_clock)}}]
    carrier = _upsert_disruption(db, disruption_type="carrier_delay", source_key=f"carrier_delay:{shipment.id}", title=f"Carrier delay for {shipment.tracking_number}", detected_at=detected_at, delay_hours=delay_hours, summary="Carrier ETA is later than the promise date.", evidence=evidence)
    impacts = _impact_and_score(db, carrier, shipment, skus, settings)
    _replace_impacts(db, carrier, impacts)
    ids = [carrier.id]
    if db.get(Supplier, shipment.supplier_id):
        supplier = _upsert_disruption(db, disruption_type="supplier_delay", source_key=f"supplier_delay:{shipment.supplier_id}", title=f"Supplier delay: {shipment.supplier_name}", detected_at=detected_at, delay_hours=delay_hours, summary="A confirmed supplier shipment is delayed.", evidence=evidence + [{"kind": "confirmed_supplier", "facts": {"supplierId": shipment.supplier_id, "shipmentId": shipment.id}}])
        _replace_impacts(db, supplier, [("supplier", shipment.supplier_id, {"kind": "confirmed_supplier", "facts": {"shipmentId": shipment.id}})] + impacts)
        ids.append(supplier.id)
    # Create a separate shortage issue only when actual available stock is below a matching line quantity.
    shortage_entities: set[str] = set()
    for entity_type, entity_id, item_evidence in impacts:
        if entity_type == "inventory" and item_evidence["kind"] == "available_quantity_shortage":
            if entity_id in shortage_entities:
                continue
            shortage_entities.add(entity_id)
            shortage = _upsert_disruption(db, disruption_type="inventory_shortage", source_key=f"inventory_shortage:{entity_id}", title="Available inventory shortage", detected_at=detected_at, delay_hours=0, summary="Actual available quantity cannot cover an affected order line.", evidence=[item_evidence])
            _replace_impacts(db, shortage, [impact for impact in impacts if impact[0] in {"inventory", "order", "order_line", "sku", "warehouse"}])
            ids.append(shortage.id)
    return ids


def ingest_carrier_event(db: Session, event: CarrierWebhook, settings: Settings | None = None) -> dict[str, Any]:
    """Apply one carrier event exactly once in one database transaction."""
    settings = settings or get_settings()
    payload_json, payload_hash = _canonical_event(event)
    try:
        with db.begin():
            existing = db.get(CarrierWebhookEvent, event.event_id)
            if existing:
                existing_hash = existing.payload_hash or hashlib.sha256(existing.payload_json.encode("utf-8")).hexdigest()
                if existing_hash != payload_hash:
                    raise HTTPException(status_code=409, detail="eventId was already received with a conflicting payload")
                return {"status": "duplicate", "eventId": event.event_id, "disruptionIds": []}
            shipment = db.scalar(select(Shipment).where(Shipment.tracking_number == event.tracking_number))
            if shipment is None:
                raise HTTPException(status_code=404, detail="Shipment for tracking number was not found")
            occurred_at = _utc(event.occurred_at)
            if shipment.last_event_at and occurred_at <= _utc(shipment.last_event_at):
                db.add(CarrierWebhookEvent(event_id=event.event_id, shipment_id=shipment.id, event_type=event.event_type, occurred_at=occurred_at, received_at=datetime.now(timezone.utc), payload_json=payload_json, payload_hash=payload_hash))
                return {"status": "stale", "eventId": event.event_id, "disruptionIds": []}
            shipment.status = event.status
            shipment.estimated_delivery_date = _utc(event.estimated_delivery_date)
            shipment.delay_hours = max(0, ceil((_utc(event.estimated_delivery_date) - _utc(shipment.promised_delivery_date)).total_seconds() / 3600))
            shipment.last_event_at = occurred_at
            db.add(CarrierWebhookEvent(event_id=event.event_id, shipment_id=shipment.id, event_type=event.event_type, occurred_at=occurred_at, received_at=datetime.now(timezone.utc), payload_json=payload_json, payload_hash=payload_hash))
            disruption_ids = _detect_for_shipment(db, shipment, occurred_at, settings)
            return {"status": "processed", "eventId": event.event_id, "disruptionIds": disruption_ids}
    except IntegrityError:
        db.rollback()
        existing = db.get(CarrierWebhookEvent, event.event_id)
        if existing and (existing.payload_hash or hashlib.sha256(existing.payload_json.encode("utf-8")).hexdigest()) != payload_hash:
            raise HTTPException(status_code=409, detail="eventId was already received with a conflicting payload")
        if existing:
            return {"status": "duplicate", "eventId": event.event_id, "disruptionIds": []}
        raise


def disruption_detail(db: Session, disruption_id: str) -> dict[str, Any]:
    record = db.get(DisruptionRecord, disruption_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Disruption was not found")
    payload = _payload(record)
    impacts = db.scalars(select(DisruptionImpact).where(DisruptionImpact.disruption_id == record.id)).all()
    result_impacts = [{"entityType": item.entity_type, "entityId": item.entity_id, "evidence": json.loads(item.evidence_json)} for item in impacts]
    orders = []
    for item in impacts:
        if item.entity_type == "order":
            order = db.get(Order, item.entity_id)
            if order:
                evidence = json.loads(item.evidence_json)
                orders.append({"id": order.id, "riskScore": order.risk_score, "riskLevel": order.risk_level, "evidence": [{"kind": evidence["kind"], "facts": evidence["facts"]}]})
    return {"id": record.id, "title": record.title, "type": payload.get("type", "unknown"), "severity": record.severity, "status": record.status, "detectedAt": _iso(record.detected_at), "summary": payload.get("summary", ""), "evidence": payload.get("evidence", []), "affectedOrders": orders, "impacts": result_impacts}
