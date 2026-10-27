"""
Recovery candidate generator (Requirements 1, 2, 8).

Generates multiple *distinct* candidate recovery plans for a disruption using
real persisted inventory, shipment, supplier, order and lead-time data.

Each strategy produces a uniquely-ID'd plan with different assumptions,
cost/delivery trade-offs and FairShare allocations:

  S1  On-Hand Priority Allocation  — use existing available stock only
  S2  Inter-Hub Stock Transfer      — draw from alternate warehouse on-hand
  S3  Air-Freight Expedite          — existing stock + expedited air freight
  S4  Alternative Supplier          — source from backup supplier (alt-source)
  S5  Split-Order Fulfilment        — fill partial quantities for PARTIAL_ALLOWED orders
  S6  Dual-Source (S3 + S4)         — combined expedite + alt supplier

Plans are read-only with respect to authoritative inventory (Requirement 11).
All arithmetic is deterministic Python — no LLM (Requirement: no LLM).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.supply_chain import Inventory, Order, OrderLine, Shipment, Supplier
from app.services.fairshare_allocator import (
    AllocationCandidate,
    AllocationResult,
    fairshare_allocate,
)
from app.services.inventory_snapshot import (
    InventorySlot,
    PlanLedger,
    SlotKey,
    build_snapshot,
    slots_for_sku,
)
from app.services.plan_validator import validate_plan

# ---------------------------------------------------------------------------
# Cost parameters (deterministic; no LLM)
# ---------------------------------------------------------------------------

AIR_FREIGHT_COST_PER_UNIT = 45.0    # USD per unit for expedited air
ALT_SUPPLIER_COST_PREMIUM = 0.25    # 25% premium over unit cost for alt-source
TRANSFER_COST_PER_UNIT = 8.0        # USD per unit for inter-hub transfer
AIR_LEAD_TIME_HOURS = 36.0          # expedited air freight lead time
ALT_SUPPLIER_LEAD_TIME_HOURS = 216.0  # 9 days × 24h (dataset alt supplier avg)
TRANSFER_LEAD_TIME_HOURS = 48.0     # inter-hub truck transfer


def _plan_id() -> str:
    return f"PLAN-{uuid.uuid4().hex[:12].upper()}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _load_affected_orders(
    db: Session, disruption_id: str
) -> List[tuple[Order, OrderLine]]:
    """Load all (Order, OrderLine) pairs linked to the disruption."""
    stmt = (
        select(Order, OrderLine)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .where(Order.associated_disruption_id == disruption_id)
        .order_by(Order.hours_until_breach.asc(), Order.id)
    )
    return db.execute(stmt).all()


def _to_candidate(order: Order, line: OrderLine) -> AllocationCandidate:
    return AllocationCandidate(
        order_id=order.id,
        customer_name=order.customer_name,
        customer_tier=order.customer_tier,
        priority=order.priority,
        fulfillment_policy=getattr(order, "fulfillment_policy", "FULL_ONLY"),
        sku=line.sku,
        sku_description=line.sku_description,
        order_quantity=line.quantity,
        hours_until_breach=order.hours_until_breach,
        order_value_usd=float(order.order_value_usd),
        primary_warehouse_id=order.primary_warehouse_id,
    )


def _compute_plan_cost(
    allocations: List[AllocationResult],
    action_cost_map: Dict[str, float],
    snapshot: Dict[SlotKey, InventorySlot],
) -> float:
    """Deterministic cost calculation (no LLM)."""
    total = 0.0
    for alloc in allocations:
        if alloc.allocated_quantity == 0:
            continue
        slot = snapshot.get((alloc.source_warehouse_id, alloc.sku))
        unit_cost = slot.unit_cost_usd if slot else 0.0
        extra = action_cost_map.get(alloc.action_type, 0.0)
        total += alloc.allocated_quantity * (unit_cost + extra)
    return round(total, 2)


def _summarise(
    allocations: List[AllocationResult],
    total_orders: int,
) -> dict:
    """Compute plan-level summary metrics."""
    protected = sum(1 for a in allocations if a.outcome_status == "protected_on_time")
    late = sum(1 for a in allocations if a.outcome_status == "late_breached")
    units = sum(a.allocated_quantity for a in allocations)
    avg_late = (
        sum(a.lateness_hours for a in allocations if a.lateness_hours > 0) /
        max(sum(1 for a in allocations if a.lateness_hours > 0), 1)
    )
    pct = round(protected / max(total_orders, 1) * 100, 2)
    penalty_saved = sum(a.penalty_avoidance_usd for a in allocations)
    return {
        "orders_protected": protected,
        "expected_late": late,
        "units_allocated": units,
        "protection_rate_pct": pct,
        "expected_lateness_hours": round(avg_late, 2),
        "penalty_saved": round(penalty_saved, 2),
    }


def _plan_dict(
    plan_id: str,
    disruption_id: str,
    name: str,
    strategy_type: str,
    sim_clock: str,
    assumptions: List[str],
    allocations: List[AllocationResult],
    actions: List[dict],
    constraints: List[dict],
    is_feasible: bool,
    feasibility_reason: str,
    failed_constraint: Optional[str],
    total_cost_usd: float,
    priority_weights: dict,
    infeasibility_risks: List[str],
    carbon_tonnes: float = 0.0,
) -> dict:
    """Build the canonical plan dictionary."""
    orders_count = len(set(a.order_id for a in allocations))
    summary = _summarise(allocations, orders_count)
    alloc_dicts = [
        {
            "orderId": a.order_id,
            "customerName": a.customer_name,
            "customerTier": a.customer_tier,
            "sku": a.sku,
            "orderQuantity": a.order_quantity,
            "allocatedQuantity": a.allocated_quantity,
            "fulfillmentPercent": a.fulfillment_pct,
            "sourceWarehouseId": a.source_warehouse_id,
            "sourceWarehouseName": a.source_warehouse_name,
            "sourceAvailableBefore": a.source_available_before,
            "sourceRemainingAfter": a.source_remaining_after,
            "leadTimeHours": a.lead_time_hours,
            "hoursUntilBreach": a.hours_until_breach,
            "outcomeStatus": a.outcome_status,
            "latenessHours": a.lateness_hours,
            "penaltyAvoidanceUSD": a.penalty_avoidance_usd,
            "actionType": a.action_type,
            "notes": a.notes,
        }
        for a in allocations
    ]
    now_str = _now().isoformat()
    return {
        "id": plan_id,
        "disruptionId": disruption_id,
        "name": name,
        "strategyType": strategy_type,
        "status": "proposed",
        "estimatedCostUSD": total_cost_usd,
        "ordersProtectedCount": summary["orders_protected"],
        "totalOrdersCount": orders_count,
        "expectedLateOrdersCount": summary["expected_late"],
        "protectionRatePercent": summary["protection_rate_pct"],
        "expectedLatenessHours": summary["expected_lateness_hours"],
        "latenessReductionHours": 0.0,  # baseline comparison set by simulator
        "unitsAllocated": summary["units_allocated"],
        "carbonEmissionsTonnes": carbon_tonnes,
        "feasibilityScore": round(summary["protection_rate_pct"], 2),
        "isFeasible": is_feasible,
        "feasibilityReason": feasibility_reason,
        "failedConstraint": failed_constraint,
        "infeasibilityRisks": infeasibility_risks,
        "assumptions": assumptions,
        "constraints": constraints,
        "orderAllocations": alloc_dicts,
        "actions": actions,
        "simulationDetails": None,
        "approvalId": None,
        "approvalStatus": None,
        "executionNotes": None,
        "scenarioClock": sim_clock,
        "priorityWeights": priority_weights,
        "penaltySavedUSD": summary["penalty_saved"],
        "createdAt": now_str,
        "updatedAt": now_str,
    }


# ---------------------------------------------------------------------------
# Individual strategy builders
# ---------------------------------------------------------------------------

def _strategy_on_hand(
    disruption_id: str,
    candidates: List[AllocationCandidate],
    snapshot: Dict[SlotKey, InventorySlot],
    sim_clock_str: str,
    priority_weights: dict,
) -> dict:
    """S1: On-Hand Priority Allocation — strict available stock, no extras."""
    ledger = PlanLedger()
    all_allocs: List[AllocationResult] = []

    # Group candidates by SKU, allocate per-SKU with FairShare
    sku_groups: Dict[str, List[AllocationCandidate]] = {}
    for c in candidates:
        sku_groups.setdefault(c.sku, []).append(c)

    for sku, group in sku_groups.items():
        slots = slots_for_sku(snapshot, sku)
        if not slots:
            # No inventory for this SKU at all — allocate 0
            for c in group:
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity, allocated_quantity=0,
                    fulfillment_pct=0.0, source_warehouse_id="",
                    source_warehouse_name="N/A", source_available_before=0,
                    source_remaining_after=0, lead_time_hours=0.0,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status="late_breached", lateness_hours=float(c.hours_until_breach),
                    penalty_avoidance_usd=0.0, action_type="on_hand", notes="No inventory",
                ))
            continue
        results = fairshare_allocate(
            candidates=group, slots=slots, ledger=ledger,
            lead_time_hours=0.0, action_type="on_hand",
            priority_weights=priority_weights,
            split_order_permitted=True,
        )
        all_allocs.extend(results)

    cost = _compute_plan_cost(all_allocs, {}, snapshot)
    is_feas, reason, constraints = validate_plan(
        all_allocs, snapshot, ledger, cost, datetime.fromisoformat(sim_clock_str)
    )
    plan_id = _plan_id()
    return _plan_dict(
        plan_id=plan_id, disruption_id=disruption_id,
        name="On-Hand Priority Allocation",
        strategy_type="on_hand_priority",
        sim_clock=sim_clock_str,
        assumptions=[
            "Uses existing on-hand available stock only.",
            "No expediting, transfers, or alternative sourcing.",
            "FULL_ONLY orders receive full quantity or nothing.",
            "FairShare weights: " + json.dumps(priority_weights),
        ],
        allocations=all_allocs,
        actions=[],
        constraints=constraints,
        is_feasible=is_feas,
        feasibility_reason=reason,
        failed_constraint=next((c["id"] for c in constraints if not c["passed"]), None),
        total_cost_usd=cost,
        priority_weights=priority_weights,
        infeasibility_risks=[c["failureDetail"] for c in constraints if not c["passed"] and c["failureDetail"]],
    )


def _strategy_inter_hub_transfer(
    disruption_id: str,
    candidates: List[AllocationCandidate],
    snapshot: Dict[SlotKey, InventorySlot],
    sim_clock_str: str,
    priority_weights: dict,
) -> dict:
    """S2: Inter-Hub Stock Transfer — draw from all warehouses, not just primary."""
    ledger = PlanLedger()
    all_allocs: List[AllocationResult] = []

    sku_groups: Dict[str, List[AllocationCandidate]] = {}
    for c in candidates:
        sku_groups.setdefault(c.sku, []).append(c)

    actions: List[dict] = []
    action_idx = 0

    for sku, group in sku_groups.items():
        # All slots across all warehouses for this SKU
        slots = slots_for_sku(snapshot, sku)
        if not slots:
            for c in group:
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity, allocated_quantity=0,
                    fulfillment_pct=0.0, source_warehouse_id="",
                    source_warehouse_name="N/A", source_available_before=0,
                    source_remaining_after=0, lead_time_hours=TRANSFER_LEAD_TIME_HOURS,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status="late_breached", lateness_hours=float(c.hours_until_breach),
                    penalty_avoidance_usd=0.0, action_type="transfer", notes="No inventory anywhere",
                ))
            continue

        results = fairshare_allocate(
            candidates=group, slots=slots, ledger=ledger,
            lead_time_hours=TRANSFER_LEAD_TIME_HOURS, action_type="transfer",
            priority_weights=priority_weights,
            split_order_permitted=True,
        )
        all_allocs.extend(results)

        # Record transfer actions
        for result in results:
            if result.allocated_quantity > 0 and result.source_warehouse_id:
                action_idx += 1
                # Find primary warehouse for the order
                target_wh = next(
                    (c.primary_warehouse_id for c in group if c.order_id == result.order_id), "WH-MAIN"
                )
                if result.source_warehouse_id != target_wh:
                    actions.append({
                        "id": f"ACT-{action_idx:03d}",
                        "actionType": "interhub_transfer",
                        "description": f"Transfer {result.allocated_quantity}× {sku} to {target_wh}",
                        "originHub": result.source_warehouse_id,
                        "destHub": target_wh,
                        "quantityUnits": result.allocated_quantity,
                        "carrierOrVendor": "Ground Freight",
                        "estimatedHours": TRANSFER_LEAD_TIME_HOURS,
                        "costUSD": round(result.allocated_quantity * TRANSFER_COST_PER_UNIT, 2),
                    })

    cost = _compute_plan_cost(all_allocs, {"transfer": TRANSFER_COST_PER_UNIT}, snapshot)
    is_feas, reason, constraints = validate_plan(
        all_allocs, snapshot, ledger, cost, datetime.fromisoformat(sim_clock_str)
    )
    plan_id = _plan_id()
    return _plan_dict(
        plan_id=plan_id, disruption_id=disruption_id,
        name="Inter-Hub Stock Transfer",
        strategy_type="interhub_transfer",
        sim_clock=sim_clock_str,
        assumptions=[
            "Draws inventory from any warehouse, not just the primary.",
            f"Transfer lead time assumed {TRANSFER_LEAD_TIME_HOURS}h (ground freight).",
            f"Transfer cost ${TRANSFER_COST_PER_UNIT}/unit.",
            "FairShare weights: " + json.dumps(priority_weights),
        ],
        allocations=all_allocs,
        actions=actions,
        constraints=constraints,
        is_feasible=is_feas,
        feasibility_reason=reason,
        failed_constraint=next((c["id"] for c in constraints if not c["passed"]), None),
        total_cost_usd=cost,
        priority_weights=priority_weights,
        infeasibility_risks=[c["failureDetail"] for c in constraints if not c["passed"] and c["failureDetail"]],
    )


def _strategy_air_expedite(
    disruption_id: str,
    candidates: List[AllocationCandidate],
    snapshot: Dict[SlotKey, InventorySlot],
    sim_clock_str: str,
    priority_weights: dict,
) -> dict:
    """S3: Air-Freight Expedite — fast delivery with premium cost."""
    ledger = PlanLedger()
    all_allocs: List[AllocationResult] = []

    sku_groups: Dict[str, List[AllocationCandidate]] = {}
    for c in candidates:
        sku_groups.setdefault(c.sku, []).append(c)

    actions: List[dict] = []
    action_idx = 0

    for sku, group in sku_groups.items():
        slots = slots_for_sku(snapshot, sku)
        if not slots:
            for c in group:
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity, allocated_quantity=0,
                    fulfillment_pct=0.0, source_warehouse_id="",
                    source_warehouse_name="N/A", source_available_before=0,
                    source_remaining_after=0, lead_time_hours=AIR_LEAD_TIME_HOURS,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status="late_breached", lateness_hours=float(c.hours_until_breach),
                    penalty_avoidance_usd=0.0, action_type="expedite", notes="No inventory",
                ))
            continue

        results = fairshare_allocate(
            candidates=group, slots=slots, ledger=ledger,
            lead_time_hours=AIR_LEAD_TIME_HOURS, action_type="expedite",
            priority_weights=priority_weights,
            expedite_cost_per_unit=AIR_FREIGHT_COST_PER_UNIT,
            split_order_permitted=True,
        )
        all_allocs.extend(results)

        total_units = sum(r.allocated_quantity for r in results)
        if total_units > 0:
            action_idx += 1
            actions.append({
                "id": f"ACT-{action_idx:03d}",
                "actionType": "air_expedite",
                "description": f"Air-expedite {total_units}× {sku}",
                "originHub": slots[0].warehouse_id,
                "destHub": "DEST",
                "quantityUnits": total_units,
                "carrierOrVendor": "Air Freight Express",
                "estimatedHours": AIR_LEAD_TIME_HOURS,
                "costUSD": round(total_units * AIR_FREIGHT_COST_PER_UNIT, 2),
            })

    cost = _compute_plan_cost(all_allocs, {"expedite": AIR_FREIGHT_COST_PER_UNIT}, snapshot)
    carbon = round(cost / 1000 * 0.82, 4)  # rough air freight CO2 proxy
    is_feas, reason, constraints = validate_plan(
        all_allocs, snapshot, ledger, cost, datetime.fromisoformat(sim_clock_str)
    )
    plan_id = _plan_id()
    return _plan_dict(
        plan_id=plan_id, disruption_id=disruption_id,
        name="Air Freight Expedite",
        strategy_type="air_expedite",
        sim_clock=sim_clock_str,
        assumptions=[
            f"All allocations expedited via air freight ({AIR_LEAD_TIME_HOURS}h lead time).",
            f"Air freight premium: ${AIR_FREIGHT_COST_PER_UNIT}/unit on top of unit cost.",
            "Carbon footprint estimated at 0.82 kg CO₂ per USD of freight cost.",
            "FairShare weights: " + json.dumps(priority_weights),
        ],
        allocations=all_allocs,
        actions=actions,
        constraints=constraints,
        is_feasible=is_feas,
        feasibility_reason=reason,
        failed_constraint=next((c["id"] for c in constraints if not c["passed"]), None),
        total_cost_usd=cost,
        priority_weights=priority_weights,
        infeasibility_risks=[c["failureDetail"] for c in constraints if not c["passed"] and c["failureDetail"]],
        carbon_tonnes=carbon,
    )


def _strategy_alt_supplier(
    disruption_id: str,
    candidates: List[AllocationCandidate],
    snapshot: Dict[SlotKey, InventorySlot],
    db: Session,
    sim_clock_str: str,
    priority_weights: dict,
) -> dict:
    """S4: Alternative Supplier — source from backup supplier for missing inventory."""
    # Find active alternative suppliers
    alt_suppliers = db.scalars(
        select(Supplier).where(Supplier.status == "active").order_by(
            Supplier.reliability_score.desc(), Supplier.average_lead_time_days.asc()
        )
    ).all()

    supplier_status_map = {s.id: s.status for s in alt_suppliers}
    best_supplier = alt_suppliers[0] if alt_suppliers else None

    ledger = PlanLedger()
    all_allocs: List[AllocationResult] = []
    actions: List[dict] = []
    action_idx = 0

    sku_groups: Dict[str, List[AllocationCandidate]] = {}
    for c in candidates:
        sku_groups.setdefault(c.sku, []).append(c)

    for sku, group in sku_groups.items():
        slots = slots_for_sku(snapshot, sku)
        lead_hours = (
            float(best_supplier.average_lead_time_days) * 24
            if best_supplier
            else ALT_SUPPLIER_LEAD_TIME_HOURS
        )

        if not slots and not best_supplier:
            for c in group:
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity, allocated_quantity=0,
                    fulfillment_pct=0.0, source_warehouse_id="",
                    source_warehouse_name="N/A", source_available_before=0,
                    source_remaining_after=0, lead_time_hours=lead_hours,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status="late_breached", lateness_hours=float(c.hours_until_breach),
                    penalty_avoidance_usd=0.0, action_type="alt_supplier",
                    notes="No alternative supplier available",
                ))
            continue

        # Build synthetic "virtual" slots representing alt-supplier stock
        # Alt supplier is treated as having unlimited stock (they can manufacture)
        virtual_slots = slots if slots else []
        if best_supplier and not virtual_slots:
            # No on-hand inventory for this SKU; create a virtual allocation slot
            for c in group:
                supplier_note = f"supplier:{best_supplier.id}"
                cost_premium = ALT_SUPPLIER_COST_PREMIUM
                # Use a representative slot
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity,
                    allocated_quantity=c.order_quantity,  # alt supplier can fulfil
                    fulfillment_pct=100.0,
                    source_warehouse_id=f"SUP-{best_supplier.id}",
                    source_warehouse_name=best_supplier.name,
                    source_available_before=9999,
                    source_remaining_after=9999 - c.order_quantity,
                    lead_time_hours=lead_hours,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status=(
                        "protected_on_time" if lead_hours <= c.hours_until_breach else "late_breached"
                    ),
                    lateness_hours=max(0.0, lead_hours - c.hours_until_breach),
                    penalty_avoidance_usd=0.0,
                    action_type="alt_supplier",
                    notes=supplier_note,
                ))
        else:
            results = fairshare_allocate(
                candidates=group, slots=virtual_slots, ledger=ledger,
                lead_time_hours=lead_hours, action_type="alt_supplier",
                priority_weights=priority_weights,
                expedite_cost_per_unit=0.0,
                split_order_permitted=True,
            )
            # Tag with supplier note
            for r in results:
                if best_supplier:
                    r.notes = (r.notes or "") + f"; supplier:{best_supplier.id}"
            all_allocs.extend(results)

        if best_supplier:
            total_units = sum(
                c.order_quantity for c in group
            )
            action_idx += 1
            actions.append({
                "id": f"ACT-{action_idx:03d}",
                "actionType": "alternate_supplier",
                "description": f"Source {total_units}× {sku} from {best_supplier.name}",
                "originHub": best_supplier.country,
                "destHub": "DEST",
                "quantityUnits": total_units,
                "carrierOrVendor": best_supplier.name,
                "estimatedHours": lead_hours,
                "costUSD": round(
                    total_units * (ALT_SUPPLIER_COST_PREMIUM * 50),  # placeholder unit cost
                    2,
                ),
            })

    cost = _compute_plan_cost(all_allocs, {"alt_supplier": ALT_SUPPLIER_COST_PREMIUM * 50}, snapshot)
    is_feas, reason, constraints = validate_plan(
        all_allocs, snapshot, ledger, cost,
        datetime.fromisoformat(sim_clock_str),
        supplier_status_map=supplier_status_map,
    )
    plan_id = _plan_id()
    return _plan_dict(
        plan_id=plan_id, disruption_id=disruption_id,
        name="Alternative Supplier Sourcing",
        strategy_type="alt_supplier",
        sim_clock=sim_clock_str,
        assumptions=[
            f"Alternative sourcing from {best_supplier.name if best_supplier else 'N/A'}.",
            f"Lead time: {best_supplier.average_lead_time_days if best_supplier else 'N/A'} days.",
            f"25% cost premium over standard unit cost for alt-source.",
            "FairShare weights: " + json.dumps(priority_weights),
        ],
        allocations=all_allocs,
        actions=actions,
        constraints=constraints,
        is_feasible=is_feas,
        feasibility_reason=reason,
        failed_constraint=next((c["id"] for c in constraints if not c["passed"]), None),
        total_cost_usd=cost,
        priority_weights=priority_weights,
        infeasibility_risks=[c["failureDetail"] for c in constraints if not c["passed"] and c["failureDetail"]],
    )


def _strategy_split_order(
    disruption_id: str,
    candidates: List[AllocationCandidate],
    snapshot: Dict[SlotKey, InventorySlot],
    sim_clock_str: str,
    priority_weights: dict,
) -> dict:
    """S5: Split-Order — partial fills for PARTIAL_ALLOWED orders."""
    ledger = PlanLedger()
    all_allocs: List[AllocationResult] = []

    sku_groups: Dict[str, List[AllocationCandidate]] = {}
    for c in candidates:
        sku_groups.setdefault(c.sku, []).append(c)

    actions: List[dict] = []
    action_idx = 0

    for sku, group in sku_groups.items():
        slots = slots_for_sku(snapshot, sku)
        if not slots:
            for c in group:
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity, allocated_quantity=0,
                    fulfillment_pct=0.0, source_warehouse_id="",
                    source_warehouse_name="N/A", source_available_before=0,
                    source_remaining_after=0, lead_time_hours=0.0,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status="late_breached", lateness_hours=float(c.hours_until_breach),
                    penalty_avoidance_usd=0.0, action_type="split_shipment", notes="No inventory",
                ))
            continue

        # Split: PARTIAL_ALLOWED orders get as much as available; FULL_ONLY get full or 0
        partial_group = [c for c in group if c.fulfillment_policy == "PARTIAL_ALLOWED"]
        full_group = [c for c in group if c.fulfillment_policy != "PARTIAL_ALLOWED"]

        # Allocate full-only first (higher priority)
        if full_group:
            full_results = fairshare_allocate(
                candidates=full_group, slots=slots, ledger=ledger,
                lead_time_hours=0.0, action_type="on_hand",
                priority_weights=priority_weights,
                split_order_permitted=False,
            )
            all_allocs.extend(full_results)

        # Then partial-allowed with whatever remains
        if partial_group:
            partial_results = fairshare_allocate(
                candidates=partial_group, slots=slots, ledger=ledger,
                lead_time_hours=0.0, action_type="split_shipment",
                priority_weights=priority_weights,
                split_order_permitted=True,
            )
            all_allocs.extend(partial_results)

            for r in partial_results:
                if r.allocated_quantity > 0 and r.allocated_quantity < r.order_quantity:
                    action_idx += 1
                    actions.append({
                        "id": f"ACT-{action_idx:03d}",
                        "actionType": "split_shipment",
                        "description": (
                            f"Split-ship {r.allocated_quantity}/{r.order_quantity}× {sku} "
                            f"to {r.order_id}"
                        ),
                        "originHub": r.source_warehouse_id,
                        "destHub": "DEST",
                        "quantityUnits": r.allocated_quantity,
                        "carrierOrVendor": "Standard Freight",
                        "estimatedHours": 24.0,
                        "costUSD": 0.0,
                    })

    cost = _compute_plan_cost(all_allocs, {}, snapshot)
    is_feas, reason, constraints = validate_plan(
        all_allocs, snapshot, ledger, cost, datetime.fromisoformat(sim_clock_str)
    )
    plan_id = _plan_id()
    return _plan_dict(
        plan_id=plan_id, disruption_id=disruption_id,
        name="Split-Order Partial Fulfilment",
        strategy_type="split_order",
        sim_clock=sim_clock_str,
        assumptions=[
            "PARTIAL_ALLOWED orders receive available quantity immediately (split shipment).",
            "FULL_ONLY orders are protected first and receive full quantity or zero.",
            "Remaining inventory distributed by FairShare to PARTIAL_ALLOWED orders.",
            "FairShare weights: " + json.dumps(priority_weights),
        ],
        allocations=all_allocs,
        actions=actions,
        constraints=constraints,
        is_feasible=is_feas,
        feasibility_reason=reason,
        failed_constraint=next((c["id"] for c in constraints if not c["passed"]), None),
        total_cost_usd=cost,
        priority_weights=priority_weights,
        infeasibility_risks=[c["failureDetail"] for c in constraints if not c["passed"] and c["failureDetail"]],
    )


def _strategy_dual_source(
    disruption_id: str,
    candidates: List[AllocationCandidate],
    snapshot: Dict[SlotKey, InventorySlot],
    db: Session,
    sim_clock_str: str,
    priority_weights: dict,
) -> dict:
    """S6: Dual-Source — P1 orders get air-expedite; P2/P3 get alt-supplier."""
    alt_suppliers = db.scalars(
        select(Supplier).where(Supplier.status == "active").order_by(
            Supplier.reliability_score.desc()
        )
    ).all()
    best_supplier = alt_suppliers[0] if alt_suppliers else None
    supplier_status_map = {s.id: s.status for s in alt_suppliers}

    p1_candidates = [c for c in candidates if c.priority == "P1"]
    other_candidates = [c for c in candidates if c.priority != "P1"]

    ledger = PlanLedger()
    all_allocs: List[AllocationResult] = []
    actions: List[dict] = []
    action_idx = 0

    # P1: air expedite from on-hand
    for sku in {c.sku for c in p1_candidates}:
        group = [c for c in p1_candidates if c.sku == sku]
        slots = slots_for_sku(snapshot, sku)
        if not slots:
            for c in group:
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity, allocated_quantity=0,
                    fulfillment_pct=0.0, source_warehouse_id="",
                    source_warehouse_name="N/A", source_available_before=0,
                    source_remaining_after=0, lead_time_hours=AIR_LEAD_TIME_HOURS,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status="late_breached", lateness_hours=float(c.hours_until_breach),
                    penalty_avoidance_usd=0.0, action_type="expedite", notes="No inventory",
                ))
            continue
        results = fairshare_allocate(
            candidates=group, slots=slots, ledger=ledger,
            lead_time_hours=AIR_LEAD_TIME_HOURS, action_type="expedite",
            priority_weights=priority_weights,
            expedite_cost_per_unit=AIR_FREIGHT_COST_PER_UNIT,
        )
        all_allocs.extend(results)
        total_units = sum(r.allocated_quantity for r in results)
        if total_units > 0:
            action_idx += 1
            actions.append({
                "id": f"ACT-{action_idx:03d}",
                "actionType": "air_expedite",
                "description": f"Air-expedite P1 orders: {total_units}× {sku}",
                "originHub": slots[0].warehouse_id,
                "destHub": "DEST",
                "quantityUnits": total_units,
                "carrierOrVendor": "Air Freight Express",
                "estimatedHours": AIR_LEAD_TIME_HOURS,
                "costUSD": round(total_units * AIR_FREIGHT_COST_PER_UNIT, 2),
            })

    # P2/P3: alt supplier
    lead_hours = (
        float(best_supplier.average_lead_time_days) * 24
        if best_supplier
        else ALT_SUPPLIER_LEAD_TIME_HOURS
    )
    for sku in {c.sku for c in other_candidates}:
        group = [c for c in other_candidates if c.sku == sku]
        slots = slots_for_sku(snapshot, sku)
        if best_supplier and not slots:
            for c in group:
                all_allocs.append(AllocationResult(
                    order_id=c.order_id, customer_name=c.customer_name,
                    customer_tier=c.customer_tier, priority=c.priority,
                    sku=c.sku, sku_description=c.sku_description,
                    order_quantity=c.order_quantity,
                    allocated_quantity=c.order_quantity,
                    fulfillment_pct=100.0,
                    source_warehouse_id=f"SUP-{best_supplier.id}",
                    source_warehouse_name=best_supplier.name,
                    source_available_before=9999,
                    source_remaining_after=9999 - c.order_quantity,
                    lead_time_hours=lead_hours,
                    hours_until_breach=c.hours_until_breach,
                    outcome_status=(
                        "protected_on_time" if lead_hours <= c.hours_until_breach else "late_breached"
                    ),
                    lateness_hours=max(0.0, lead_hours - c.hours_until_breach),
                    penalty_avoidance_usd=0.0,
                    action_type="alt_supplier",
                    notes=f"supplier:{best_supplier.id}",
                ))
        elif slots:
            results = fairshare_allocate(
                candidates=group, slots=slots, ledger=ledger,
                lead_time_hours=lead_hours, action_type="alt_supplier",
                priority_weights=priority_weights,
            )
            for r in results:
                if best_supplier:
                    r.notes = (r.notes or "") + f"; supplier:{best_supplier.id}"
            all_allocs.extend(results)

        if best_supplier:
            total_units = sum(c.order_quantity for c in group)
            action_idx += 1
            actions.append({
                "id": f"ACT-{action_idx:03d}",
                "actionType": "alternate_supplier",
                "description": f"Alt-source P2/P3: {total_units}× {sku} from {best_supplier.name}",
                "originHub": best_supplier.country,
                "destHub": "DEST",
                "quantityUnits": total_units,
                "carrierOrVendor": best_supplier.name,
                "estimatedHours": lead_hours,
                "costUSD": round(total_units * ALT_SUPPLIER_COST_PREMIUM * 50, 2),
            })

    cost = _compute_plan_cost(
        all_allocs,
        {"expedite": AIR_FREIGHT_COST_PER_UNIT, "alt_supplier": ALT_SUPPLIER_COST_PREMIUM * 50},
        snapshot,
    )
    carbon = round(cost / 1000 * 0.6, 4)
    is_feas, reason, constraints = validate_plan(
        all_allocs, snapshot, ledger, cost,
        datetime.fromisoformat(sim_clock_str),
        supplier_status_map=supplier_status_map,
    )
    plan_id = _plan_id()
    return _plan_dict(
        plan_id=plan_id, disruption_id=disruption_id,
        name="Dual-Source Reallocation",
        strategy_type="dual_source",
        sim_clock=sim_clock_str,
        assumptions=[
            "P1 orders: air-freight expedite from on-hand stock.",
            f"P2/P3 orders: alternative sourcing from {best_supplier.name if best_supplier else 'N/A'}.",
            f"Air lead time: {AIR_LEAD_TIME_HOURS}h; alt-supplier lead time: {lead_hours}h.",
            "FairShare weights: " + json.dumps(priority_weights),
        ],
        allocations=all_allocs,
        actions=actions,
        constraints=constraints,
        is_feasible=is_feas,
        feasibility_reason=reason,
        failed_constraint=next((c["id"] for c in constraints if not c["passed"]), None),
        total_cost_usd=cost,
        priority_weights=priority_weights,
        infeasibility_risks=[c["failureDetail"] for c in constraints if not c["passed"] and c["failureDetail"]],
        carbon_tonnes=carbon,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def generate_candidates(
    db: Session,
    disruption_id: str,
    priority_weights: Optional[Dict[str, float]] = None,
    sim_clock: Optional[datetime] = None,
) -> List[dict]:
    """
    Generate all candidate recovery plans for a disruption.

    Returns a list of plan dicts (not yet persisted).  The caller (plan_simulator
    or the API route) is responsible for persisting them.

    Requirement 11: Read-only w.r.t. authoritative inventory.
    """
    if sim_clock is None:
        from app.core.config import get_settings
        settings = get_settings()
        # simulation_clock is already a datetime object from pydantic Settings
        sc = getattr(settings, "simulation_clock", None)
        if isinstance(sc, datetime):
            sim_clock = sc
        else:
            # Fallback: parse from string (e.g. env override)
            raw = str(sc) if sc else "2026-10-26T18:00:00+00:00"
            sim_clock = datetime.fromisoformat(raw.replace("Z", "+00:00"))

    sim_clock_str = sim_clock.isoformat()
    pw = priority_weights or {
        "P1": 10.0, "P2": 5.0, "P3": 1.0,
    }

    order_lines = _load_affected_orders(db, disruption_id)
    if not order_lines:
        return []

    candidates = [_to_candidate(o, l) for o, l in order_lines]
    snapshot = build_snapshot(db, sim_clock)

    plans = [
        _strategy_on_hand(disruption_id, candidates, snapshot, sim_clock_str, pw),
        _strategy_inter_hub_transfer(disruption_id, candidates, snapshot, sim_clock_str, pw),
        _strategy_air_expedite(disruption_id, candidates, snapshot, sim_clock_str, pw),
        _strategy_alt_supplier(disruption_id, candidates, snapshot, db, sim_clock_str, pw),
        _strategy_split_order(disruption_id, candidates, snapshot, sim_clock_str, pw),
        _strategy_dual_source(disruption_id, candidates, snapshot, db, sim_clock_str, pw),
    ]
    return plans
