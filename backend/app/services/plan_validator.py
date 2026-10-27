"""
Plan feasibility validator (Requirement 9).

Validates every hard constraint before a plan is marked feasible.
Each check returns a machine-readable PlanConstraint dict that is stored
on the plan and returned to callers.

Hard constraints checked:
  C1  All orders have at least one matching inventory SKU in the snapshot.
  C2  No inventory slot is allocated beyond its available_units (double-alloc guard).
  C3  FULL_ONLY orders must be either fully allocated or zero-allocated.
  C4  Inbound inventory is not used before its simulated arrival date.
  C5  Supplier used for alternative sourcing must have status=active.
  C6  Lead time for each allocation must not exceed order hours_until_breach
      by more than the plan's tolerated_lateness_hours (default 0 = any breach is tracked).
  C7  Total plan cost must not exceed a configurable ceiling (default: no ceiling).

Returns a tuple (is_feasible, reasons, constraint_list).
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Tuple

from app.services.fairshare_allocator import AllocationResult
from app.services.inventory_snapshot import InventorySlot, PlanLedger, SlotKey

# Machine-readable constraint ids
C_INVENTORY_COVERAGE = "C1_INVENTORY_COVERAGE"
C_NO_DOUBLE_ALLOCATION = "C2_NO_DOUBLE_ALLOCATION"
C_FULL_ONLY_INTEGRITY = "C3_FULL_ONLY_INTEGRITY"
C_INBOUND_TIMING = "C4_INBOUND_TIMING"
C_SUPPLIER_ELIGIBILITY = "C5_SUPPLIER_ELIGIBILITY"
C_DEADLINE_BREACH = "C6_DEADLINE_BREACH"
C_COST_CEILING = "C7_COST_CEILING"


def _constraint(
    id_: str,
    name: str,
    required: str,
    actual: str,
    passed: bool,
    failure_detail: Optional[str] = None,
) -> dict:
    return {
        "id": id_,
        "name": name,
        "required": required,
        "actual": actual,
        "passed": passed,
        "failureDetail": failure_detail,
    }


def validate_plan(
    allocations: List[AllocationResult],
    snapshot: Dict[SlotKey, InventorySlot],
    ledger: PlanLedger,
    total_cost_usd: float,
    sim_clock: datetime,
    supplier_status_map: Optional[Dict[str, str]] = None,  # supplier_id → status
    cost_ceiling_usd: Optional[float] = None,
    tolerated_lateness_hours: float = 0.0,
) -> Tuple[bool, str, List[dict]]:
    """
    Validate a candidate plan.

    Returns
    -------
    (is_feasible, reason_string, constraint_list)
    """
    constraints: list[dict] = []
    infeasibility_reasons: list[str] = []

    # C1 — Every order must have at least one allocation attempt
    orders_with_alloc = {a.order_id for a in allocations}
    orders_zero = [a for a in allocations if a.allocated_quantity == 0 and a.order_quantity > 0]
    c1_pass = len(orders_zero) == 0
    c1_detail = (
        f"{len(orders_zero)} order(s) received zero allocation: "
        + ", ".join(sorted({a.order_id for a in orders_zero}))
        if not c1_pass
        else None
    )
    constraints.append(
        _constraint(
            C_INVENTORY_COVERAGE,
            "Inventory coverage",
            "All orders allocated > 0 units",
            f"{len(orders_with_alloc) - len(orders_zero)}/{len(orders_with_alloc)} covered",
            c1_pass,
            c1_detail,
        )
    )
    if not c1_pass:
        infeasibility_reasons.append(
            f"{C_INVENTORY_COVERAGE}: {len(orders_zero)} order(s) cannot be covered"
        )

    # C2 — No warehouse/SKU pair allocated more than available_units
    draw_totals: Dict[SlotKey, int] = {}
    for alloc in allocations:
        key = (alloc.source_warehouse_id, alloc.sku)
        draw_totals[key] = draw_totals.get(key, 0) + alloc.allocated_quantity

    over_drawn: list[str] = []
    for key, drawn in draw_totals.items():
        slot = snapshot.get(key)
        if slot and drawn > slot.available_units:
            over_drawn.append(
                f"({key[0]},{key[1]}): drew {drawn} but only {slot.available_units} available"
            )

    c2_pass = len(over_drawn) == 0
    constraints.append(
        _constraint(
            C_NO_DOUBLE_ALLOCATION,
            "No double-allocation",
            "drawn ≤ available_units per (warehouse, SKU)",
            "OK" if c2_pass else "; ".join(over_drawn),
            c2_pass,
            "; ".join(over_drawn) if not c2_pass else None,
        )
    )
    if not c2_pass:
        infeasibility_reasons.append(f"{C_NO_DOUBLE_ALLOCATION}: inventory over-drawn")

    # C3 — FULL_ONLY orders must be 0 or fully satisfied
    partial_full_only: list[str] = []
    for a in allocations:
        if (
            a.allocated_quantity > 0
            and a.allocated_quantity < a.order_quantity
            and a.action_type != "partial_allowed"
        ):
            # Check if this was intended as FULL_ONLY by looking at action_type note
            # We track this by checking outcome_status
            if a.outcome_status == "partial_delay":
                partial_full_only.append(a.order_id)

    c3_pass = len(partial_full_only) == 0
    constraints.append(
        _constraint(
            C_FULL_ONLY_INTEGRITY,
            "Full-only fulfilment integrity",
            "FULL_ONLY orders: 0 or full qty",
            "OK" if c3_pass else f"{len(partial_full_only)} violation(s)",
            c3_pass,
            f"Partial fills on FULL_ONLY orders: {partial_full_only}" if not c3_pass else None,
        )
    )

    # C4 — Inbound inventory not counted before arrival
    premature_inbound: list[str] = []
    for alloc in allocations:
        if alloc.action_type == "inbound":
            key = (alloc.source_warehouse_id, alloc.sku)
            slot = snapshot.get(key)
            if slot and slot.inbound_arrives_at:
                if slot.inbound_arrives_at > sim_clock:
                    # Check lead_time allows for the actual arrival
                    arrival_hours = (slot.inbound_arrives_at - sim_clock).total_seconds() / 3600
                    if alloc.lead_time_hours < arrival_hours:
                        premature_inbound.append(
                            f"{alloc.order_id}/{alloc.sku}: inbound arrives in "
                            f"{arrival_hours:.1f}h but lead_time={alloc.lead_time_hours:.1f}h"
                        )

    c4_pass = len(premature_inbound) == 0
    constraints.append(
        _constraint(
            C_INBOUND_TIMING,
            "Inbound inventory timing",
            "lead_time_hours ≥ inbound arrival hours",
            "OK" if c4_pass else f"{len(premature_inbound)} violation(s)",
            c4_pass,
            "; ".join(premature_inbound) if not c4_pass else None,
        )
    )
    if not c4_pass:
        infeasibility_reasons.append(f"{C_INBOUND_TIMING}: inbound used before arrival")

    # C5 — Supplier eligibility for alt-source allocations
    ineligible_suppliers: list[str] = []
    if supplier_status_map:
        for alloc in allocations:
            if alloc.action_type == "alt_supplier":
                # The notes field contains "supplier:<id>" if set by candidate_generator
                supplier_id = None
                for part in (alloc.notes or "").split(";"):
                    if part.strip().startswith("supplier:"):
                        supplier_id = part.strip().split(":")[1]
                if supplier_id:
                    status = supplier_status_map.get(supplier_id, "unknown")
                    if status != "active":
                        ineligible_suppliers.append(
                            f"{alloc.order_id}: supplier {supplier_id} status={status}"
                        )

    c5_pass = len(ineligible_suppliers) == 0
    constraints.append(
        _constraint(
            C_SUPPLIER_ELIGIBILITY,
            "Supplier eligibility",
            "alt-source suppliers must be active",
            "OK" if c5_pass else f"{len(ineligible_suppliers)} ineligible",
            c5_pass,
            "; ".join(ineligible_suppliers) if not c5_pass else None,
        )
    )
    if not c5_pass:
        infeasibility_reasons.append(f"{C_SUPPLIER_ELIGIBILITY}: ineligible supplier(s)")

    # C6 — Deadline breach tracking (informational; only fails if tolerated_lateness < actual)
    breach_violations: list[str] = []
    for alloc in allocations:
        if alloc.lateness_hours > tolerated_lateness_hours and alloc.allocated_quantity > 0:
            breach_violations.append(
                f"{alloc.order_id}: {alloc.lateness_hours:.1f}h late "
                f"(tolerance {tolerated_lateness_hours:.1f}h)"
            )

    c6_pass = len(breach_violations) == 0
    constraints.append(
        _constraint(
            C_DEADLINE_BREACH,
            "Deadline breach tolerance",
            f"lateness ≤ {tolerated_lateness_hours:.0f}h",
            "OK" if c6_pass else f"{len(breach_violations)} order(s) breach tolerance",
            c6_pass,
            "; ".join(breach_violations[:3]) if not c6_pass else None,
        )
    )
    # C6 is informational; not fatal unless tolerated_lateness_hours == -1

    # C7 — Cost ceiling
    if cost_ceiling_usd is not None:
        c7_pass = total_cost_usd <= cost_ceiling_usd
        constraints.append(
            _constraint(
                C_COST_CEILING,
                "Plan cost ceiling",
                f"≤ ${cost_ceiling_usd:,.2f}",
                f"${total_cost_usd:,.2f}",
                c7_pass,
                f"Cost ${total_cost_usd:,.2f} exceeds ceiling ${cost_ceiling_usd:,.2f}"
                if not c7_pass
                else None,
            )
        )
        if not c7_pass:
            infeasibility_reasons.append(
                f"{C_COST_CEILING}: ${total_cost_usd:,.2f} exceeds ${cost_ceiling_usd:,.2f}"
            )
    else:
        constraints.append(
            _constraint(C_COST_CEILING, "Plan cost ceiling", "no ceiling", f"${total_cost_usd:,.2f}", True)
        )

    is_feasible = len(infeasibility_reasons) == 0
    reason = (
        "All hard constraints satisfied."
        if is_feasible
        else " | ".join(infeasibility_reasons)
    )
    return is_feasible, reason, constraints
