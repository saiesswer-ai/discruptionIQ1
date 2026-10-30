"""Core persistence models aligned with the synthetic CSV dataset and enterprise extensions."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Company(Base):
    """Synthetic company profile entity."""
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column("company_id", String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    registration_number: Mapped[str] = mapped_column(String(64))
    headquarters: Mapped[str] = mapped_column(String(128))
    country: Mapped[str] = mapped_column(String(64))
    contact_email: Mapped[str] = mapped_column(String(128))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(32), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Product(Base):
    """Product master record for tracked SKUs."""
    __tablename__ = "products"

    sku: Mapped[str] = mapped_column("sku", String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(String(256))
    category: Mapped[str] = mapped_column(String(64), index=True)
    unit_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("1.0"))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(32), default="active")


class Warehouse(Base):
    __tablename__ = "warehouses"
    id: Mapped[str] = mapped_column("warehouse_id", String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    location: Mapped[str] = mapped_column(String(128))
    city: Mapped[str] = mapped_column(String(64))
    country: Mapped[str] = mapped_column(String(64))
    total_capacity_sqm: Mapped[int] = mapped_column(Integer)
    available_dock_doors: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32))
    # Extensions for multi-facility enterprise management
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.company_id"), nullable=True, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    manager_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    max_pallet_capacity: Mapped[int | None] = mapped_column(Integer, nullable=True, default=10000)
    current_utilization_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True, default=Decimal("0.0"))


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[str] = mapped_column("supplier_id", String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    country: Mapped[str] = mapped_column(String(64))
    category: Mapped[str] = mapped_column(String(64))
    tier: Mapped[str] = mapped_column(String(16))
    reliability_score: Mapped[int] = mapped_column(Integer)
    on_time_delivery_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    average_lead_time_days: Mapped[int] = mapped_column(Integer)
    delay_incidents_last_90d: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32))
    contact_email: Mapped[str] = mapped_column(String(128))
    company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.company_id"), nullable=True, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Inventory(Base):
    __tablename__ = "inventory"
    id: Mapped[str] = mapped_column("inventory_id", String(48), primary_key=True)
    warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"), index=True)
    warehouse_name: Mapped[str] = mapped_column(String(128))
    sku: Mapped[str] = mapped_column(String(32), index=True)
    sku_description: Mapped[str] = mapped_column(String(128))
    category: Mapped[str] = mapped_column(String(64))
    on_hand_units: Mapped[int] = mapped_column(Integer, default=0)
    available_units: Mapped[int] = mapped_column(Integer)
    reserved_units: Mapped[int] = mapped_column(Integer)
    inbound_units: Mapped[int] = mapped_column(Integer)
    safety_stock_threshold: Mapped[int] = mapped_column(Integer)
    unit_cost_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    status: Mapped[str] = mapped_column(String(32))
    last_audited_at: Mapped[datetime] = mapped_column(DateTime)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[str] = mapped_column("shipment_id", String(32), primary_key=True)
    tracking_number: Mapped[str] = mapped_column(String(64), unique=True)
    carrier_name: Mapped[str] = mapped_column(String(64))
    transport_mode: Mapped[str] = mapped_column(String(16))
    origin: Mapped[str] = mapped_column(String(64))
    destination: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), index=True)
    delay_hours: Mapped[int] = mapped_column(Integer)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.supplier_id"), index=True)
    supplier_name: Mapped[str] = mapped_column(String(128))
    cargo_description: Mapped[str] = mapped_column(String(128))
    promised_delivery_date: Mapped[datetime] = mapped_column(DateTime)
    estimated_delivery_date: Mapped[datetime] = mapped_column(DateTime)
    affected_orders_count: Mapped[int] = mapped_column(Integer)
    # Carrier events are only applied when they are newer than this timestamp.
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    destination_warehouse_id: Mapped[str | None] = mapped_column(ForeignKey("warehouses.warehouse_id"), nullable=True, index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column("order_id", String(32), primary_key=True)
    customer_name: Mapped[str] = mapped_column(String(128))
    customer_tier: Mapped[str] = mapped_column(String(32))
    priority: Mapped[str] = mapped_column(String(4), index=True)
    promised_deadline: Mapped[datetime] = mapped_column(DateTime)
    hours_until_breach: Mapped[int] = mapped_column(Integer)
    order_value_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    risk_score: Mapped[int] = mapped_column(Integer)
    risk_level: Mapped[str] = mapped_column(String(16))
    mitigation_status: Mapped[str] = mapped_column(String(32))
    associated_disruption_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    primary_warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"))
    fulfillment_policy: Mapped[str] = mapped_column(String(32), default="FULL_ONLY")
    explanation: Mapped[str] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class OrderLine(Base):
    __tablename__ = "order_lines"
    id: Mapped[str] = mapped_column("order_line_id", String(48), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.order_id"), index=True)
    sku: Mapped[str] = mapped_column(String(32))
    sku_description: Mapped[str] = mapped_column(String(128))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    line_total_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class WarehouseTransfer(Base):
    """
    Persistent inter-warehouse stock transfer record.
    Full lifecycle: REQUESTED -> APPROVED -> IN_TRANSIT -> RECEIVED (or CANCELLED)
    """
    __tablename__ = "warehouse_transfers"

    id: Mapped[str] = mapped_column("transfer_id", String(32), primary_key=True)
    source_warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"), index=True)
    destination_warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"), index=True)
    sku: Mapped[str] = mapped_column(String(32), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), index=True, default="REQUESTED")
    reason: Mapped[str] = mapped_column(Text)
    requested_by: Mapped[str] = mapped_column(String(128))
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    approved_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    dispatched_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    received_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_arrival: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tracking_reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    authorization_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)


class StockMovement(Base):
    """
    Append-only inventory movement ledger for auditing and balance reconciliation.
    """
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column("movement_id", String(32), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, default=datetime.utcnow)
    movement_type: Mapped[str] = mapped_column(String(32), index=True)  # RECEIPT, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT_UP, ADJUSTMENT_DOWN, DISPATCH
    warehouse_id: Mapped[str] = mapped_column(ForeignKey("warehouses.warehouse_id"), index=True)
    sku: Mapped[str] = mapped_column(String(32), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    balance_before: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    reference_type: Mapped[str] = mapped_column(String(32))  # TRANSFER, SHIPMENT, CYCLE_COUNT, MANUAL_ADJUSTMENT
    reference_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_id: Mapped[str] = mapped_column(String(128))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
