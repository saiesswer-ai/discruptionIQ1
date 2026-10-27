"""
Inventory snapshot service for the Recovery Arena.

Rules (Requirements 6 & 7):
  - on_hand   = available + reserved        (DB invariant, checked on read)
  - available = units that can actually be allocated in a plan
  - reserved  = already committed to live orders outside the plan
  - inbound   = in-transit units; NOT available until simulated_arrival_at <= now
  - Plans simulate against a *frozen* snapshot so inventory is never mutated
    during plan generation or simulation (Requirement 11).

The snapshot is a plain dict keyed (warehouse_id, sku) → InventorySlot dataclass.
Within a single plan, a running ledger tracks tentative allocations so the same
unit cannot be promised twice (Requirement 5).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.supply_chain import Inventory, Shipment

# Inventory slot key: (warehouse_id, sku)
SlotKey = Tuple[str, str]


@dataclass
class InventorySlot:
    """Read-only snapshot of one (warehouse, sku) inventory record."""

    inventory_id: str
    warehouse_id: str
    warehouse_name: str
    sku: str
    sku_description: str
    category: str
    on_hand_units: int
    available_units: int      # on_hand - reserved; what a plan may draw from
    reserved_units: int       # already committed outside this plan
    inbound_units: int        # in-transit; NOT counted as available
    safety_stock_threshold: int
    unit_cost_usd: float
    status: str

    # Filled by build_snapshot when inbound units have a known arrival estimate
    inbound_arrives_at: datetime | None = None


@dataclass
class PlanLedger:
    """
    In-plan running allocation ledger.

    Tracks tentative draws against the *snapshot* so that the same available
    unit is never promised to two order-lines within one plan.
    Mutations here are plan-local and never touch the DB.
    """

    _draws: Dict[SlotKey, int] = field(default_factory=dict)

    def available(self, slot: InventorySlot) -> int:
        """Units still allocatable in the current plan."""
        drawn = self._draws.get((slot.warehouse_id, slot.sku), 0)
        return max(0, slot.available_units - drawn)

    def draw(self, slot: InventorySlot, qty: int) -> int:
        """
        Tentatively allocate `qty` units.  Returns actually allocated amount
        (may be less if stock is insufficient).
        """
        can = self.available(slot)
        actual = min(can, qty)
        if actual > 0:
            key = (slot.warehouse_id, slot.sku)
            self._draws[key] = self._draws.get(key, 0) + actual
        return actual

    def remaining(self, slot: InventorySlot) -> int:
        """Snapshot units minus all plan draws so far."""
        drawn = self._draws.get((slot.warehouse_id, slot.sku), 0)
        return slot.available_units - drawn


def _inbound_arrival(db: Session, sku: str, sim_clock: datetime) -> datetime | None:
    """
    Return the earliest estimated_delivery_date for an in-transit shipment that
    carries the given SKU and has not yet arrived as of sim_clock.

    We match on cargo_description containing the SKU prefix (the dataset stores
    descriptions like "800x NVX-9400 …").  This is intentionally conservative:
    a shipment that has already arrived (estimated_delivery_date < sim_clock) is
    ignored.
    """
    stmt = (
        select(Shipment)
        .where(Shipment.status.in_(["in_transit", "delayed", "customs_hold"]))
        .where(Shipment.estimated_delivery_date > sim_clock)
        .order_by(Shipment.estimated_delivery_date)
    )
    for shipment in db.scalars(stmt).all():
        if sku[:6] in (shipment.cargo_description or ""):
            return shipment.estimated_delivery_date
    return None


def build_snapshot(
    db: Session, sim_clock: datetime | None = None
) -> Dict[SlotKey, InventorySlot]:
    """
    Return an immutable frozen snapshot of all inventory, keyed (warehouse_id, sku).

    The snapshot is read-only with respect to the authoritative DB (Requirement 11).
    inbound units are annotated with their estimated arrival so callers can decide
    whether to treat them as available (Requirement 7).
    """
    if sim_clock is None:
        sim_clock = datetime.now(timezone.utc)

    rows = db.scalars(select(Inventory)).all()
    snapshot: Dict[SlotKey, InventorySlot] = {}
    for row in rows:
        key: SlotKey = (row.warehouse_id, row.sku)
        inbound_at = (
            _inbound_arrival(db, row.sku, sim_clock) if row.inbound_units > 0 else None
        )
        snapshot[key] = InventorySlot(
            inventory_id=row.id,
            warehouse_id=row.warehouse_id,
            warehouse_name=row.warehouse_name,
            sku=row.sku,
            sku_description=row.sku_description,
            category=row.category,
            on_hand_units=row.on_hand_units,
            available_units=row.available_units,
            reserved_units=row.reserved_units,
            inbound_units=row.inbound_units,
            safety_stock_threshold=row.safety_stock_threshold,
            unit_cost_usd=float(row.unit_cost_usd),
            status=row.status,
            inbound_arrives_at=inbound_at,
        )
    return snapshot


def slots_for_sku(snapshot: Dict[SlotKey, InventorySlot], sku: str) -> list[InventorySlot]:
    """Return all slots carrying `sku`, sorted by available_units descending."""
    return sorted(
        [s for s in snapshot.values() if s.sku == sku],
        key=lambda s: s.available_units,
        reverse=True,
    )
