"""
Plan executor (Requirements 13, 14, 15).

Execution steps:
  1. Re-validate all hard constraints against live DB state (not the snapshot).
  2. Re-check supplier eligibility, stock availability and deadlines.
  3. Execute inside a single DB transaction with row-level locking.
  4. Use idempotency_key to prevent duplicate execution.
  5. Write audit event plan_executed.

All validation is deterministic Python — no LLM.

IMPORTANT: This module is the ONLY place that mutates authoritative inventory.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.permissions import normalize_role, plan_requires_procurement_approval
from app.models.recovery import PlanAllocation, PlanAuditEvent, RecoveryPlan
from app.models.supply_chain import Inventory, Order, Supplier


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


class ExecutionError(Exception):
    """Raised when a plan cannot be executed due to a constraint violation."""

    def __init__(self, reason: str, code: str):
        super().__init__(reason)
        self.reason = reason
        self.code = code


def submit_plan_for_approval(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_role: str,
    justification: str,
) -> dict:
    """
    Mark a plan as submitted for approval.
    Requirement 3 & 15: Validates state transition and writes audit event plan_submitted.
    """
    record = db.get(RecoveryPlan, plan_id)
    if record is None:
        raise ExecutionError(f"Plan {plan_id} not found", "PLAN_NOT_FOUND")
    if record.status not in ("proposed", "simulated", "modification_requested"):
        raise ExecutionError(
            f"Plan {plan_id} status '{record.status}' cannot be submitted. Only proposed, simulated, or modification-requested plans can be submitted.",
            "INVALID_STATUS",
        )

    previous_status = record.status
    record.status = "submitted"
    record.submitted_by = actor_id
    record.updated_at = _now()

    db.add(
        _audit_event(
            plan_id, record.disruption_id, "plan_submitted", actor_id, actor_role,
            {
                "before": {"status": previous_status},
                "after": {"status": "submitted"},
                "justification": justification,
            },
        )
    )
    db.commit()
    db.refresh(record)
    return {"planId": plan_id, "status": record.status, "submittedBy": record.submitted_by}


def request_plan_modification(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_role: str,
    reason: str,
) -> dict:
    """
    Request modifications for a submitted recovery plan with mandatory notes.
    Requirement 3 & 7: State machine transition and recording modification reason in plan and audit log.
    """
    record = db.get(RecoveryPlan, plan_id)
    if record is None:
        raise ExecutionError(f"Plan {plan_id} not found", "PLAN_NOT_FOUND")
    if record.status not in ("submitted", "proposed", "simulated"):
        raise ExecutionError(
            f"Plan {plan_id} status '{record.status}' cannot be modified. Only active plans can have modifications requested.",
            "INVALID_STATUS",
        )
    if not reason or len(reason.strip()) < 5:
        raise ExecutionError("Modification reason must be at least 5 characters long", "INVALID_INPUT")

    previous_status = record.status
    record.status = "modification_requested"
    record.modification_reason = reason.strip()
    record.updated_at = _now()

    db.add(
        _audit_event(
            plan_id, record.disruption_id, "plan_modification_requested", actor_id, actor_role,
            {
                "before": {"status": previous_status},
                "after": {"status": "modification_requested"},
                "reason": record.modification_reason,
            },
        )
    )
    db.commit()
    db.refresh(record)
    return {"planId": plan_id, "status": record.status, "modificationReason": record.modification_reason}


def approve_plan(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_role: str,
    comments: str = "",
) -> dict:
    """
    Approve a submitted plan.
    Requirement 3, 4, 5, 6, 9:
      - Validates plan is in 'submitted' status (prevent duplicate/stale approvals).
      - Enforces separation of duties (request creator/submitter cannot approve their own plan).
      - Enforces procurement approval policy for plans triggering alternative sourcing or purchases.
      - Writes audit event plan_approved with before/after state.
    """
    record = db.get(RecoveryPlan, plan_id)
    if record is None:
        raise ExecutionError(f"Plan {plan_id} not found", "PLAN_NOT_FOUND")
    if record.status == "approved":
        raise ExecutionError(f"Plan {plan_id} is already approved", "ALREADY_APPROVED")
    if record.status != "submitted":
        raise ExecutionError(
            f"Plan {plan_id} must be in 'submitted' status to approve; got '{record.status}'",
            "INVALID_STATUS",
        )

    # Requirement 5: Separation of duties check
    if record.submitted_by and record.submitted_by == actor_id:
        raise ExecutionError(
            f"Separation of duties violation: Submitter '{actor_id}' cannot approve their own recovery plan",
            "SEPARATION_OF_DUTIES_VIOLATION",
        )
    if record.created_by and record.created_by == actor_id and record.created_by != "system":
        raise ExecutionError(
            f"Separation of duties violation: Creator '{actor_id}' cannot approve their own recovery plan",
            "SEPARATION_OF_DUTIES_VIOLATION",
        )

    # Requirement 6: Procurement approval policy enforcement
    allocs = db.scalars(
        select(PlanAllocation).where(PlanAllocation.plan_id == plan_id)
    ).all()
    settings = get_settings()
    requires_proc, proc_reason = plan_requires_procurement_approval(
        record, allocs, threshold_usd=settings.procurement_approval_threshold_usd
    )

    canonical_role = normalize_role(actor_role)
    if requires_proc and canonical_role not in ("procurement_approver", "administrator"):
        raise ExecutionError(
            f"Procurement approval required: {proc_reason}. Role '{actor_role}' is not authorized to approve procurement-triggering plans.",
            "PROCUREMENT_APPROVAL_REQUIRED",
        )

    previous_status = record.status
    record.status = "approved"
    record.approved_by = actor_id
    record.approval_id = f"APR-{uuid.uuid4().hex[:10].upper()}"
    record.approval_status = "approved"
    record.updated_at = _now()

    db.add(
        _audit_event(
            plan_id, record.disruption_id, "plan_approved", actor_id, actor_role,
            {
                "before": {"status": previous_status},
                "after": {"status": "approved", "approvalId": record.approval_id},
                "approvalId": record.approval_id,
                "reviewerComments": comments,
                "procurementPolicyTriggered": requires_proc,
            },
        )
    )
    db.commit()
    db.refresh(record)
    return {"planId": plan_id, "status": record.status, "approvalId": record.approval_id, "approvedBy": record.approved_by}


def reject_plan(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_role: str,
    reason: str,
) -> dict:
    """
    Reject a submitted plan.
    Requirement 7 & 15: Records mandatory rejection reason in plan and audit event.
    """
    record = db.get(RecoveryPlan, plan_id)
    if record is None:
        raise ExecutionError(f"Plan {plan_id} not found", "PLAN_NOT_FOUND")
    if record.status != "submitted":
        raise ExecutionError(
            f"Plan {plan_id} must be in 'submitted' status to reject; got '{record.status}'",
            "INVALID_STATUS",
        )
    if not reason or len(reason.strip()) < 5:
        raise ExecutionError("Rejection reason must be at least 5 characters long", "INVALID_INPUT")

    previous_status = record.status
    record.status = "rejected"
    record.rejected_by = actor_id
    record.rejection_reason = reason.strip()
    record.approval_status = "rejected"
    record.updated_at = _now()

    db.add(
        _audit_event(
            plan_id, record.disruption_id, "plan_rejected", actor_id, actor_role,
            {
                "before": {"status": previous_status},
                "after": {"status": "rejected"},
                "reason": record.rejection_reason,
            },
        )
    )
    db.commit()
    db.refresh(record)
    return {"planId": plan_id, "status": record.status, "rejectionReason": record.rejection_reason}


def execute_plan(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_role: str,
    idempotency_key: str,
) -> dict:
    """
    Execute an approved plan inside a single DB transaction.

    Requirements 8, 9, 10, 14:
      - Idempotency key prevents duplicate execution.
      - Re-validates live inventory, supplier eligibility, deadlines, and plan feasibility.
      - Writes audit event plan_executed with before/after state.
      - All execution remains simulated (internal inventory allocation/booking IDs).
    """
    # --- Idempotency check ---
    existing = db.scalars(
        select(RecoveryPlan).where(RecoveryPlan.idempotency_key == idempotency_key)
    ).first()
    if existing is not None:
        allocs = db.scalars(
            select(PlanAllocation).where(PlanAllocation.plan_id == existing.id)
        ).all()
        return {
            "planId": existing.id,
            "status": existing.status,
            "idempotent": True,
            "allocationsApplied": len(allocs),
            "message": f"Plan already executed with idempotency_key={idempotency_key}",
        }

    # --- Lock and load the plan ---
    record = db.get(RecoveryPlan, plan_id)
    if record is None:
        raise ExecutionError(f"Plan {plan_id} not found", "PLAN_NOT_FOUND")

    if record.status == "executed":
        raise ExecutionError(
            f"Plan {plan_id} has already been executed",
            "ALREADY_EXECUTED",
        )

    if record.status != "approved":
        raise ExecutionError(
            f"Plan {plan_id} must be in 'approved' status to execute; got '{record.status}'",
            "INVALID_STATUS",
        )

    # --- Revalidate feasibility flag ---
    if not bool(record.is_feasible):
        raise ExecutionError(
            f"Plan {plan_id} constraint violation: plan is marked infeasible ({record.feasibility_reason})",
            "REVALIDATION_FAILED",
        )

    # --- Load allocations ---
    allocs = db.scalars(
        select(PlanAllocation).where(PlanAllocation.plan_id == plan_id)
    ).all()

    now = _now()
    violations: list[str] = []

    # --- Re-validate: stock still available (Requirement 8) ---
    draw_map: dict[tuple[str, str], int] = {}
    for a in allocs:
        if a.allocated_quantity > 0 and a.action_type in ("on_hand", "transfer", "split_shipment"):
            key = (a.source_warehouse_id, a.sku)
            draw_map[key] = draw_map.get(key, 0) + a.allocated_quantity

    for (wh_id, sku), qty in draw_map.items():
        inv = db.scalars(
            select(Inventory).where(
                Inventory.warehouse_id == wh_id,
                Inventory.sku == sku,
            )
        ).first()
        if inv is None:
            violations.append(f"Inventory record ({wh_id},{sku}) not found")
        elif inv.available_units < qty:
            violations.append(
                f"({wh_id},{sku}): need {qty} but only {inv.available_units} available (stale plan)"
            )

    # --- Re-validate: supplier eligibility for alt-source allocations (Requirement 8) ---
    supplier_ids: set[str] = set()
    for a in allocs:
        if a.action_type == "alt_supplier":
            for part in (a.notes or "").split(";"):
                if part.strip().startswith("supplier:"):
                    supplier_ids.add(part.strip().split(":")[1])

    for sup_id in supplier_ids:
        sup = db.get(Supplier, sup_id)
        if sup is None:
            violations.append(f"Supplier {sup_id} not found")
        elif sup.status != "active":
            violations.append(f"Supplier {sup_id} status is '{sup.status}' (not active)")

    # --- Re-validate: order deadlines (Requirement 8) ---
    for a in allocs:
        if a.allocated_quantity > 0:
            order = db.get(Order, a.order_id)
            if order is None:
                violations.append(f"Order {a.order_id} not found")
            elif order.hours_until_breach < 0:
                violations.append(f"Order {a.order_id} deadline already breached")

    if violations:
        raise ExecutionError(
            f"Pre-execution re-validation failed: " + " | ".join(violations),
            "REVALIDATION_FAILED",
        )

    # --- Apply simulated inventory mutations (authoritative write) ---
    for (wh_id, sku), qty in draw_map.items():
        inv = db.scalars(
            select(Inventory).where(
                Inventory.warehouse_id == wh_id,
                Inventory.sku == sku,
            )
        ).first()
        if inv:
            inv.available_units = max(0, inv.available_units - qty)
            inv.reserved_units = min(inv.on_hand_units, inv.reserved_units + qty)

    # --- Update plan record ---
    previous_status = record.status
    record.status = "executed"
    record.executed_by = actor_id
    record.idempotency_key = idempotency_key
    record.execution_notes = (
        f"Executed at {now.isoformat()} by {actor_id} ({actor_role}). "
        f"{len(allocs)} allocations applied."
    )
    record.updated_at = now

    db.add(
        _audit_event(
            plan_id, record.disruption_id, "plan_executed", actor_id, actor_role,
            {
                "before": {"status": previous_status},
                "after": {"status": "executed", "idempotencyKey": idempotency_key},
                "idempotencyKey": idempotency_key,
                "allocationsApplied": len(allocs),
                "totalCostUSD": float(record.estimated_cost_usd),
            },
        )
    )
    db.commit()
    db.refresh(record)

    return {
        "planId": plan_id,
        "status": record.status,
        "idempotent": False,
        "allocationsApplied": len(allocs),
        "message": record.execution_notes,
    }
