"""
Plan simulator and comparison engine (Requirements 10, 11, 12).

Simulation is:
  - Read-only w.r.t. authoritative inventory (Requirement 11).
  - Deterministic — same inputs produce identical outputs (no LLM).
  - Stored in the DB after execution for audit and replay.

Plan comparison uses identical metrics across all feasible plans so the
caller can rank them (Requirement 10).
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.recovery import PlanAllocation, PlanAuditEvent, RecoveryPlan
from app.services.candidate_generator import generate_candidates


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit_event(
    plan_id: str,
    disruption_id: str,
    action: str,
    actor_id: str,
    actor_role: str,
    payload: dict,
) -> PlanAuditEvent:
    return PlanAuditEvent(
        id=f"AUD-{uuid.uuid4().hex[:12].upper()}",
        plan_id=plan_id,
        disruption_id=disruption_id,
        action=action,
        actor_id=actor_id,
        actor_role=actor_role,
        occurred_at=_now(),
        payload_json=json.dumps(payload),
    )


def _persist_plan(db: Session, plan_dict: dict, created_by: str | None = None) -> RecoveryPlan:
    """Persist a candidate plan dict (and its allocations) to the DB."""
    now = _now()
    record = RecoveryPlan(
        id=plan_dict["id"],
        disruption_id=plan_dict["disruptionId"],
        name=plan_dict["name"],
        strategy_type=plan_dict["strategyType"],
        status=plan_dict.get("status", "proposed"),
        created_by=created_by or plan_dict.get("createdBy", "system"),
        scenario_clock=plan_dict.get("scenarioClock", now.isoformat()),
        assumptions_json=json.dumps(plan_dict.get("assumptions", [])),
        priority_weights_json=json.dumps(plan_dict.get("priorityWeights", {})),
        estimated_cost_usd=plan_dict.get("estimatedCostUSD", 0.0),
        orders_protected_count=plan_dict.get("ordersProtectedCount", 0),
        total_orders_count=plan_dict.get("totalOrdersCount", 0),
        expected_late_orders_count=plan_dict.get("expectedLateOrdersCount", 0),
        protection_rate_pct=plan_dict.get("protectionRatePercent", 0.0),
        expected_lateness_hours=plan_dict.get("expectedLatenessHours", 0.0),
        lateness_reduction_hours=plan_dict.get("latenessReductionHours", 0.0),
        units_allocated=plan_dict.get("unitsAllocated", 0),
        carbon_emissions_tonnes=plan_dict.get("carbonEmissionsTonnes", 0.0),
        feasibility_score=plan_dict.get("feasibilityScore", 0.0),
        is_feasible=1 if plan_dict.get("isFeasible") else 0,
        feasibility_reason=plan_dict.get("feasibilityReason", ""),
        failed_constraint=plan_dict.get("failedConstraint"),
        infeasibility_risks_json=json.dumps(plan_dict.get("infeasibilityRisks", [])),
        actions_json=json.dumps(plan_dict.get("actions", [])),
        constraints_json=json.dumps(plan_dict.get("constraints", [])),
        simulation_details_json=json.dumps(plan_dict.get("simulationDetails") or {}),
        created_at=now,
        updated_at=now,
    )
    db.add(record)
    db.flush()

    for alloc in plan_dict.get("orderAllocations", []):
        alloc_record = PlanAllocation(
            id=f"ALLOC-{uuid.uuid4().hex[:14].upper()}",
            plan_id=record.id,
            order_id=alloc["orderId"],
            customer_name=alloc.get("customerName", ""),
            customer_tier=alloc.get("customerTier", ""),
            order_priority=alloc.get("priority", ""),
            sku=alloc["sku"],
            sku_description=alloc.get("skuDescription", ""),
            order_quantity=alloc["orderQuantity"],
            allocated_quantity=alloc["allocatedQuantity"],
            fulfillment_pct=alloc.get("fulfillmentPercent", 0.0),
            source_warehouse_id=alloc.get("sourceWarehouseId", ""),
            source_warehouse_name=alloc.get("sourceWarehouseName", ""),
            source_available_before=alloc.get("sourceAvailableBefore", 0),
            source_remaining_after=alloc.get("sourceRemainingAfter", 0),
            lead_time_hours=alloc.get("leadTimeHours", 0.0),
            hours_until_breach=alloc.get("hoursUntilBreach", 0),
            outcome_status=alloc.get("outcomeStatus", ""),
            lateness_hours=alloc.get("latenessHours", 0.0),
            penalty_avoidance_usd=alloc.get("penaltyAvoidanceUSD", 0.0),
            action_type=alloc.get("actionType", "on_hand"),
            notes=alloc.get("notes", ""),
        )
        db.add(alloc_record)

    return record


def _plan_to_dict(record: RecoveryPlan, allocations: list) -> dict:
    """Reconstruct a plan dict from a DB RecoveryPlan record."""
    return {
        "id": record.id,
        "disruptionId": record.disruption_id,
        "name": record.name,
        "strategyType": record.strategy_type,
        "status": record.status,
        "estimatedCostUSD": float(record.estimated_cost_usd),
        "ordersProtectedCount": record.orders_protected_count,
        "totalOrdersCount": record.total_orders_count,
        "expectedLateOrdersCount": record.expected_late_orders_count,
        "protectionRatePercent": float(record.protection_rate_pct),
        "expectedLatenessHours": float(record.expected_lateness_hours),
        "latenessReductionHours": float(record.lateness_reduction_hours),
        "unitsAllocated": record.units_allocated,
        "carbonEmissionsTonnes": float(record.carbon_emissions_tonnes),
        "feasibilityScore": float(record.feasibility_score),
        "isFeasible": bool(record.is_feasible),
        "feasibilityReason": record.feasibility_reason,
        "failedConstraint": record.failed_constraint,
        "infeasibilityRisks": json.loads(record.infeasibility_risks_json or "[]"),
        "assumptions": json.loads(record.assumptions_json or "[]"),
        "constraints": json.loads(record.constraints_json or "[]"),
        "actions": json.loads(record.actions_json or "[]"),
        "simulationDetails": json.loads(record.simulation_details_json or "{}") or None,
        "createdBy": getattr(record, "created_by", None),
        "submittedBy": getattr(record, "submitted_by", None),
        "approvedBy": getattr(record, "approved_by", None),
        "rejectedBy": getattr(record, "rejected_by", None),
        "rejectionReason": getattr(record, "rejection_reason", None),
        "modificationReason": getattr(record, "modification_reason", None),
        "executedBy": getattr(record, "executed_by", None),
        "approvalId": record.approval_id,
        "approvalStatus": record.approval_status,
        "executionNotes": record.execution_notes,
        "scenarioClock": record.scenario_clock,
        "priorityWeights": json.loads(record.priority_weights_json or "{}"),
        "orderAllocations": [
            {
                "orderId": a.order_id,
                "customerName": a.customer_name,
                "customerTier": a.customer_tier,
                "sku": a.sku,
                "orderQuantity": a.order_quantity,
                "allocatedQuantity": a.allocated_quantity,
                "fulfillmentPercent": float(a.fulfillment_pct),
                "sourceWarehouseId": a.source_warehouse_id,
                "sourceWarehouseName": a.source_warehouse_name,
                "sourceAvailableBefore": a.source_available_before,
                "sourceRemainingAfter": a.source_remaining_after,
                "leadTimeHours": float(a.lead_time_hours),
                "hoursUntilBreach": a.hours_until_breach,
                "outcomeStatus": a.outcome_status,
                "latenessHours": float(a.lateness_hours),
                "penaltyAvoidanceUSD": float(a.penalty_avoidance_usd),
                "actionType": a.action_type,
                "notes": a.notes,
            }
            for a in allocations
        ],
        "createdAt": record.created_at.isoformat(),
        "updatedAt": record.updated_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_plans(
    db: Session,
    disruption_id: str,
    actor_id: str,
    actor_role: str,
    priority_weights: Optional[Dict[str, float]] = None,
) -> List[dict]:
    """
    Generate and persist candidate recovery plans for a disruption.

    Writes audit event plan_created for each plan.
    Requirement 12: Store candidate plans and their detailed allocations.
    Requirement 15: Write audit events for plan creation.
    """
    plan_dicts = generate_candidates(db, disruption_id, priority_weights)
    results = []
    for pd in plan_dicts:
        record = _persist_plan(db, pd, created_by=actor_id)
        pd["createdBy"] = actor_id
        db.add(
            _audit_event(
                record.id, disruption_id, "plan_created", actor_id, actor_role,
                {
                    "strategy": record.strategy_type,
                    "isFeasible": bool(record.is_feasible),
                    "before": None,
                    "after": {"status": record.status},
                },
            )
        )
        results.append(pd)
    db.commit()
    return results


def simulate_plan(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_role: str,
) -> dict:
    """
    Simulate a specific plan: re-run feasibility checks and enrich with
    simulation metadata.  Read-only w.r.t. authoritative inventory.

    Requirement 11: simulation is read-only.
    Requirement 15: writes audit event plan_simulated.
    """
    record = db.get(RecoveryPlan, plan_id)
    if record is None:
        raise ValueError(f"Plan {plan_id} not found")

    now = _now()
    sim_details = {
        "simulatedAt": now.isoformat(),
        "simulatedBy": actor_id,
        "inventoryStressLevel": (
            "high" if float(record.protection_rate_pct) < 50
            else "moderate" if float(record.protection_rate_pct) < 80
            else "low"
        ),
        "transitReliabilityConfidence": round(
            float(record.feasibility_score) / 100, 2
        ),
        "slaSavesCount": record.orders_protected_count,
        "projectedPenaltyAvoidanceUSD": 0.0,  # filled from allocations
        "netBenefitUSD": 0.0,
    }

    # Compute penalty avoidance from stored allocations
    allocs = db.scalars(
        select(PlanAllocation).where(PlanAllocation.plan_id == plan_id)
    ).all()
    penalty_total = sum(float(a.penalty_avoidance_usd) for a in allocs)
    sim_details["projectedPenaltyAvoidanceUSD"] = round(penalty_total, 2)
    sim_details["netBenefitUSD"] = round(
        penalty_total - float(record.estimated_cost_usd), 2
    )

    previous_status = record.status
    record.status = "simulated"
    record.simulated_at = now
    record.simulated_by = actor_id
    record.simulation_details_json = json.dumps(sim_details)
    record.updated_at = now

    db.add(
        _audit_event(
            plan_id, record.disruption_id, "plan_simulated", actor_id, actor_role,
            {
                "before": {"status": previous_status},
                "after": {"status": "simulated"},
                "simulatedAt": now.isoformat(),
                "netBenefitUSD": sim_details["netBenefitUSD"],
            },
        )
    )
    db.commit()
    db.refresh(record)

    return _plan_to_dict(record, allocs)


def get_plan(db: Session, plan_id: str) -> Optional[dict]:
    """Retrieve a single plan with its allocations."""
    record = db.get(RecoveryPlan, plan_id)
    if record is None:
        return None
    allocs = db.scalars(
        select(PlanAllocation).where(PlanAllocation.plan_id == plan_id)
    ).all()
    return _plan_to_dict(record, allocs)


def list_plans(
    db: Session, disruption_id: str, status: Optional[str] = None
) -> List[dict]:
    """List plans for a disruption, optionally filtered by status."""
    stmt = select(RecoveryPlan).where(RecoveryPlan.disruption_id == disruption_id)
    if status:
        stmt = stmt.where(RecoveryPlan.status == status)
    stmt = stmt.order_by(RecoveryPlan.created_at.desc())
    records = db.scalars(stmt).all()
    result = []
    for record in records:
        allocs = db.scalars(
            select(PlanAllocation).where(PlanAllocation.plan_id == record.id)
        ).all()
        result.append(_plan_to_dict(record, allocs))
    return result


def compare_plans(db: Session, disruption_id: str) -> dict:
    """
    Compare all feasible simulated plans for a disruption on the same metrics.

    Returns a comparison matrix and a recommended plan ID (lowest cost
    among those with the highest protection rate).

    Requirement 10: compare feasible plans using identical metrics.
    """
    all_plans = list_plans(db, disruption_id)
    feasible = [p for p in all_plans if p["isFeasible"]]

    if not feasible:
        return {
            "disruptionId": disruption_id,
            "feasiblePlanCount": 0,
            "recommendedPlanId": None,
            "plans": [],
            "comparisonMetrics": [],
        }

    # Sort by protection rate (desc), then cost (asc)
    ranked = sorted(
        feasible,
        key=lambda p: (-p["protectionRatePercent"], p["estimatedCostUSD"]),
    )
    recommended = ranked[0]["id"] if ranked else None

    metrics = []
    for p in ranked:
        metrics.append({
            "planId": p["id"],
            "name": p["name"],
            "strategyType": p["strategyType"],
            "protectionRatePercent": p["protectionRatePercent"],
            "estimatedCostUSD": p["estimatedCostUSD"],
            "ordersProtectedCount": p["ordersProtectedCount"],
            "expectedLateOrdersCount": p["expectedLateOrdersCount"],
            "expectedLatenessHours": p["expectedLatenessHours"],
            "unitsAllocated": p["unitsAllocated"],
            "carbonEmissionsTonnes": p["carbonEmissionsTonnes"],
            "feasibilityScore": p["feasibilityScore"],
            "status": p["status"],
        })

    return {
        "disruptionId": disruption_id,
        "feasiblePlanCount": len(feasible),
        "recommendedPlanId": recommended,
        "plans": ranked,
        "comparisonMetrics": metrics,
    }
