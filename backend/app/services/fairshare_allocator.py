"""
FairShare allocation engine (Requirement 4).

Algorithm
---------
For each SKU shortage, distribute available inventory across competing orders
using a deterministic priority-weighted FairShare formula:

    share_i = (weight_i / Σ weights) × total_available

where weight_i is computed from configurable priority weights:

    weight_i = P_weight(priority) × T_weight(customer_tier) × U_weight(hours_until_breach)

Tie-breaking (fully documented, deterministic):
  1. Higher computed weight wins.
  2. Tie on weight → earlier promised_deadline (fewer hours_until_breach) wins.
  3. Tie on deadline → lower order_id (lexicographic) wins.

Rules:
  - FULL_ONLY orders: allocated_qty must equal order_qty or 0 (no partial fills).
  - PARTIAL_ALLOWED orders: allocated_qty may be any amount 0..order_qty.
  - Inventory is never double-allocated within a plan (enforced via PlanLedger).
  - Inbound inventory is NOT counted as available before its simulated arrival
    (see InventorySlot.inbound_arrives_at).

All arithmetic uses plain Python ints/floats – no LLM involvement (Requirement: no LLM for stock allocation).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.services.inventory_snapshot import InventorySlot, PlanLedger, SlotKey


# ---------------------------------------------------------------------------
# Default priority weights (all overridable per plan)
# ---------------------------------------------------------------------------

DEFAULT_PRIORITY_WEIGHTS: Dict[str, float] = {
    "P1": 10.0,
    "P2": 5.0,
    "P3": 1.0,
}

DEFAULT_TIER_WEIGHTS: Dict[str, float] = {
    "Enterprise": 3.0,
    "Strategic": 2.0,
    "Standard": 1.0,
}

# Urgency multiplier: orders breaching within 24 h get a bonus
URGENCY_THRESHOLD_HOURS = 24
URGENCY_MULTIPLIER = 2.0


@dataclass
class AllocationCandidate:
    """One order-line that needs a given SKU."""

    order_id: str
    customer_name: str
    customer_tier: str
    priority: str            # P1 | P2 | P3
    fulfillment_policy: str  # FULL_ONLY | PARTIAL_ALLOWED
    sku: str
    sku_description: str
    order_quantity: int
    hours_until_breach: int
    order_value_usd: float
    primary_warehouse_id: str


@dataclass
class AllocationResult:
    """Outcome of FairShare for one order-line."""

    order_id: str
    customer_name: str
    customer_tier: str
    priority: str
    sku: str
    sku_description: str
    order_quantity: int
    allocated_quantity: int
    fulfillment_pct: float
    source_warehouse_id: str
    source_warehouse_name: str
    source_available_before: int
    source_remaining_after: int
    lead_time_hours: float
    hours_until_breach: int
    outcome_status: str        # protected_on_time | partial_delay | late_breached
    lateness_hours: float
    penalty_avoidance_usd: float
    action_type: str           # on_hand | expedite | alt_supplier | transfer | inbound
    notes: str = ""


def _compute_weight(
    candidate: AllocationCandidate,
    priority_weights: Dict[str, float],
    tier_weights: Dict[str, float],
) -> float:
    """Compute deterministic priority weight for tie-breaking documentation."""
    pw = priority_weights.get(candidate.priority, 1.0)
    tw = tier_weights.get(candidate.customer_tier, 1.0)
    urgency = (
        URGENCY_MULTIPLIER if candidate.hours_until_breach <= URGENCY_THRESHOLD_HOURS else 1.0
    )
    return pw * tw * urgency


def _sort_key(candidate: AllocationCandidate, weight: float):
    """
    Deterministic sort key.

    Tie-breaking order (documented, Requirement 4):
      1. Higher weight first (negate for ascending sort)
      2. Fewer hours_until_breach first (urgent first)
      3. Lexicographically smaller order_id first
    """
    return (-weight, candidate.hours_until_breach, candidate.order_id)


def fairshare_allocate(
    candidates: List[AllocationCandidate],
    slots: List[InventorySlot],
    ledger: PlanLedger,
    lead_time_hours: float = 0.0,
    action_type: str = "on_hand",
    priority_weights: Optional[Dict[str, float]] = None,
    tier_weights: Optional[Dict[str, float]] = None,
    expedite_cost_per_unit: float = 0.0,
    split_order_permitted: bool = True,
) -> List[AllocationResult]:
    """
    Allocate units across `candidates` using FairShare.

    Parameters
    ----------
    candidates       : orders competing for inventory
    slots            : inventory slots available for this SKU (may span warehouses)
    ledger           : in-plan ledger (mutated; prevents double-allocation)
    lead_time_hours  : transit time to add on top of allocation (for expedite / alt-supplier)
    action_type      : label stored on each AllocationResult
    priority_weights : override DEFAULT_PRIORITY_WEIGHTS
    tier_weights     : override DEFAULT_TIER_WEIGHTS
    expedite_cost_per_unit : extra cost per unit (for expedite/alt-source plans)
    split_order_permitted  : when False, FULL_ONLY orders that can't be fully met get 0
    """
    pw = priority_weights or DEFAULT_PRIORITY_WEIGHTS
    tw = tier_weights or DEFAULT_TIER_WEIGHTS

    # Total available across all slots (Ledger enforces no double-draw)
    total_available = sum(ledger.available(s) for s in slots)

    # Compute weights and sort deterministically
    weighted: List[tuple[float, AllocationCandidate]] = []
    for c in candidates:
        w = _compute_weight(c, pw, tw)
        weighted.append((w, c))

    weighted.sort(key=lambda t: _sort_key(t[1], t[0]))

    total_weight = sum(w for w, _ in weighted)

    # --- FairShare proportional share (continuous) ---
    shares: Dict[str, float] = {}
    if total_weight > 0:
        for w, c in weighted:
            shares[c.order_id] = (w / total_weight) * total_available
    else:
        # All weights zero: equal share
        for _, c in weighted:
            shares[c.order_id] = total_available / max(len(weighted), 1)

    # --- Round down to integers, keep remainder for greedy top-up ---
    int_shares: Dict[str, int] = {oid: math.floor(s) for oid, s in shares.items()}
    remainder = total_available - sum(int_shares.values())

    # Top-up by remainder in the same deterministic sort order
    for _, c in weighted:
        if remainder <= 0:
            break
        extra = min(remainder, c.order_quantity - int_shares[c.order_id])
        if extra > 0:
            int_shares[c.order_id] += extra
            remainder -= extra

    # --- Apply FULL_ONLY policy and draw from ledger ---
    results: List[AllocationResult] = []
    remaining_pool = total_available  # counter (slots enforced via ledger)

    for w, c in weighted:
        desired = min(c.order_quantity, int_shares.get(c.order_id, 0))

        if c.fulfillment_policy == "FULL_ONLY" and not split_order_permitted:
            # Only allocate if we can satisfy the full order quantity
            full_avail = sum(ledger.available(s) for s in slots)
            if full_avail < c.order_quantity:
                desired = 0

        if c.fulfillment_policy == "FULL_ONLY" and desired < c.order_quantity:
            # Check if a full allocation is possible from remaining ledger
            full_avail = sum(ledger.available(s) for s in slots)
            if full_avail >= c.order_quantity:
                desired = c.order_quantity
            else:
                desired = 0  # Can't satisfy FULL_ONLY; allocate nothing

        actual = 0
        chosen_slot: Optional[InventorySlot] = None
        source_before = 0

        # Draw greedily from slots in descending availability order
        for slot in sorted(slots, key=lambda s: ledger.available(s), reverse=True):
            if actual >= desired:
                break
            need = desired - actual
            drawn = ledger.draw(slot, need)
            if drawn > 0:
                if chosen_slot is None:
                    chosen_slot = slot
                    source_before = slot.available_units
                actual += drawn

        if chosen_slot is None:
            # Couldn't draw anything: pick first slot for metadata
            chosen_slot = slots[0] if slots else None

        slot_name = chosen_slot.warehouse_name if chosen_slot else "unknown"
        slot_wh_id = chosen_slot.warehouse_id if chosen_slot else ""
        source_before_val = source_before
        source_after_val = (
            ledger.remaining(chosen_slot) if chosen_slot else 0
        )

        pct = round((actual / c.order_quantity * 100), 2) if c.order_quantity > 0 else 0.0

        # Determine outcome
        if actual == 0:
            outcome = "late_breached"
            lateness = float(c.hours_until_breach)
        elif lead_time_hours > c.hours_until_breach:
            outcome = "late_breached"
            lateness = max(0.0, lead_time_hours - c.hours_until_breach)
        elif actual < c.order_quantity and c.fulfillment_policy == "FULL_ONLY":
            outcome = "late_breached"
            lateness = 0.0
        elif actual < c.order_quantity:
            outcome = "partial_delay"
            lateness = 0.0
        else:
            outcome = "protected_on_time"
            lateness = 0.0

        # Simple penalty avoidance: 2% of order_value per breached hour, capped
        if outcome == "protected_on_time":
            penalty_avoided = c.order_value_usd * 0.02 * min(c.hours_until_breach / 24, 5)
        elif outcome == "partial_delay":
            penalty_avoided = c.order_value_usd * pct / 100 * 0.01
        else:
            penalty_avoided = 0.0

        cost_note = (
            f"Expedite cost: ${expedite_cost_per_unit * actual:,.2f}"
            if expedite_cost_per_unit > 0 and actual > 0
            else ""
        )

        results.append(
            AllocationResult(
                order_id=c.order_id,
                customer_name=c.customer_name,
                customer_tier=c.customer_tier,
                priority=c.priority,
                sku=c.sku,
                sku_description=c.sku_description,
                order_quantity=c.order_quantity,
                allocated_quantity=actual,
                fulfillment_pct=pct,
                source_warehouse_id=slot_wh_id,
                source_warehouse_name=slot_name,
                source_available_before=source_before_val,
                source_remaining_after=source_after_val,
                lead_time_hours=lead_time_hours,
                hours_until_breach=c.hours_until_breach,
                outcome_status=outcome,
                lateness_hours=lateness,
                penalty_avoidance_usd=round(penalty_avoided, 2),
                action_type=action_type,
                notes=cost_note,
            )
        )

    return results
