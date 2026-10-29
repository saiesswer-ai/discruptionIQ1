"""Read-only query functions for the initial dataset-backed API."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ApprovalRecord, DisruptionRecord, Inventory, Order, OrderLine, RecoveryPlan, Shipment, Supplier, Warehouse
from app.schemas.common import DashboardSummary
from app.schemas.inventory import WarehouseInventory
from app.schemas.order import OrderAtRisk
from app.schemas.shipment import Shipment as ShipmentSchema
from app.schemas.supplier import Supplier as SupplierSchema


def _iso(value: object) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def list_orders_at_risk(db: Session, disruption_id: str | None, priority: str | None) -> list[OrderAtRisk]:
    statement = select(Order, OrderLine).outerjoin(OrderLine, OrderLine.order_id == Order.id)
    if disruption_id:
        statement = statement.where(Order.associated_disruption_id == disruption_id)
    if priority:
        statement = statement.where(Order.priority == priority)
    rows = db.execute(statement.order_by(Order.hours_until_breach.asc(), Order.id)).all()
    return [
        OrderAtRisk(
            id=order.id, customerName=order.customer_name, customerTier=order.customer_tier,
            sku=line.sku if line else "", skuDescription=line.sku_description if line else "",
            quantityUnits=line.quantity if line else 0, orderValueUSD=float(order.order_value_usd),
            promisedDeadline=_iso(order.promised_deadline), hoursUntilBreach=order.hours_until_breach,
            priority=order.priority, riskScore=order.risk_score, riskLevel=order.risk_level,
            primaryWarehouseId=order.primary_warehouse_id,
            associatedDisruptionId=order.associated_disruption_id or "",
            fulfillmentPolicy=getattr(order, "fulfillment_policy", "FULL_ONLY"),
            explanation=order.explanation,
            mitigationStatus=order.mitigation_status,
        )
        for order, line in rows
    ]


def list_inventory(db: Session, warehouse_id: str | None, sku: str | None) -> list[WarehouseInventory]:
    statement = select(Inventory, Warehouse).join(Warehouse, Warehouse.id == Inventory.warehouse_id)
    if warehouse_id:
        statement = statement.where(Inventory.warehouse_id == warehouse_id)
    if sku:
        statement = statement.where(Inventory.sku == sku)
    return [
        WarehouseInventory(
            id=item.id, warehouseId=item.warehouse_id, warehouseName=item.warehouse_name,
            warehouseLocation=warehouse.location, sku=item.sku, skuDescription=item.sku_description,
            category=item.category, onHandUnits=getattr(item, "on_hand_units", item.available_units + item.reserved_units),
            availableUnits=item.available_units, reservedUnits=item.reserved_units,
            inboundUnits=item.inbound_units, safetyStockThreshold=item.safety_stock_threshold,
            status=item.status, unitCostUSD=float(item.unit_cost_usd), lastAuditedAt=_iso(item.last_audited_at),
        )
        for item, warehouse in db.execute(statement.order_by(Inventory.warehouse_id, Inventory.sku)).all()
    ]


def list_shipments(db: Session, status: str | None) -> list[ShipmentSchema]:
    statement = select(Shipment)
    if status:
        statement = statement.where(Shipment.status == status)
    return [
        ShipmentSchema(
            id=item.id, trackingNumber=item.tracking_number, carrierName=item.carrier_name,
            transportMode=item.transport_mode, origin=item.origin, destination=item.destination,
            status=item.status, currentLocation=None, promisedDeliveryDate=_iso(item.promised_delivery_date),
            estimatedDeliveryDate=_iso(item.estimated_delivery_date), delayHours=item.delay_hours,
            supplierId=item.supplier_id, supplierName=item.supplier_name,
            cargoDescription=item.cargo_description, affectedOrderIds=None,
            affectedOrdersCount=item.affected_orders_count,
        )
        for item in db.scalars(statement.order_by(Shipment.estimated_delivery_date, Shipment.id)).all()
    ]


def list_suppliers(db: Session) -> list[SupplierSchema]:
    return [
        SupplierSchema(
            id=item.id, name=item.name, country=item.country, category=item.category, tier=item.tier,
            reliabilityScore=item.reliability_score, onTimeDeliveryRate=float(item.on_time_delivery_rate),
            averageLeadTimeDays=item.average_lead_time_days,
            delayIncidentsLast90d=item.delay_incidents_last_90d, status=item.status,
            contactEmail=item.contact_email,
        )
        for item in db.scalars(select(Supplier).order_by(Supplier.name)).all()
    ]


def dashboard_summary(db: Session) -> DashboardSummary:
    """Return only transparent counts that are directly queryable from stored records."""
    def count(statement: object) -> int:
        return int(db.scalar(statement) or 0)

    pending_plans = count(select(func.count()).select_from(RecoveryPlan).where(RecoveryPlan.status == "submitted"))
    pending_approvals_rec = count(select(func.count()).select_from(ApprovalRecord).where(ApprovalRecord.status == "pending"))

    return DashboardSummary(
        activeDisruptions=count(select(func.count()).select_from(DisruptionRecord).where(DisruptionRecord.status == "active")),
        ordersAtRisk=count(select(func.count()).select_from(Order).where(Order.risk_level.in_(("critical", "high")))),
        delayedShipments=count(select(func.count()).select_from(Shipment).where(Shipment.status.in_(("delayed", "customs_hold")))),
        constrainedInventoryItems=count(select(func.count()).select_from(Inventory).where(Inventory.status.in_(("constrained", "critical")))),
        pendingApprovals=pending_plans + pending_approvals_rec,
    )
