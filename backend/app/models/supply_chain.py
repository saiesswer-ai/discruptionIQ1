"""Core persistence models aligned with the synthetic CSV dataset."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Warehouse(Base):
    __tablename__ = "warehouses"
    id: Mapped[str] = mapped_column("warehouse_id", String(16), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    location: Mapped[str] = mapped_column(String(128))
    city: Mapped[str] = mapped_column(String(64))
    country: Mapped[str] = mapped_column(String(64))
    total_capacity_sqm: Mapped[int] = mapped_column(Integer)
    available_dock_doors: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32))


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[str] = mapped_column("supplier_id", String(16), primary_key=True)
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


class Inventory(Base):
    __tablename__ = "inventory"
    id: Mapped[str] = mapped_column("inventory_id", String(16), primary_key=True)
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


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[str] = mapped_column("shipment_id", String(16), primary_key=True)
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


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column("order_id", String(16), primary_key=True)
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


class OrderLine(Base):
    __tablename__ = "order_lines"
    id: Mapped[str] = mapped_column("order_line_id", String(32), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.order_id"), index=True)
    sku: Mapped[str] = mapped_column(String(32))
    sku_description: Mapped[str] = mapped_column(String(128))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price_usd: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    line_total_usd: Mapped[Decimal] = mapped_column(Numeric(12, 2))
