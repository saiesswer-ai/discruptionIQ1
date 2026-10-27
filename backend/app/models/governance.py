"""Models reserved for the forthcoming disruption and governance datasets."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DisruptionRecord(Base):
    __tablename__ = "disruptions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(256))
    severity: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    source_key: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)


class CarrierWebhookEvent(Base):
    """A durable carrier delivery receipt. event_id makes replay safe."""

    __tablename__ = "carrier_webhook_events"
    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.shipment_id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime)
    payload_json: Mapped[str] = mapped_column(Text)
    payload_hash: Mapped[str] = mapped_column(String(64), index=True)


class DisruptionImpact(Base):
    """Explainable, queryable links from a disruption to affected entities."""

    __tablename__ = "disruption_impacts"
    __table_args__ = (UniqueConstraint("disruption_id", "entity_type", "entity_id", name="uq_disruption_impact"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    disruption_id: Mapped[str] = mapped_column(ForeignKey("disruptions.id"), index=True)
    entity_type: Mapped[str] = mapped_column(String(32), index=True)
    entity_id: Mapped[str] = mapped_column(String(64), index=True)
    evidence_json: Mapped[str] = mapped_column(Text, default="{}")


class ApprovalRecord(Base):
    __tablename__ = "approvals"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")


class AuditRecord(Base):
    __tablename__ = "audit_records"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True)
    action: Mapped[str] = mapped_column(String(128))
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(64))
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
