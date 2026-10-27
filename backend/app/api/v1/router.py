"""Version 1 API routes with backend-enforced RBAC and audit trail logging."""
from __future__ import annotations

import json
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.ai import ai_router
from app.api.v1.auth import auth_router
from app.api.v1.recovery_arena import recovery_router
from app.core.config import get_settings
from app.core.database import get_db
from app.core.permissions import Permission, role_has_permission
from app.models.auth import User
from app.models.governance import ApprovalRecord, AuditRecord, DisruptionImpact, DisruptionRecord
from app.models.recovery import PlanAuditEvent, RecoveryPlan
from app.schemas.approval import ApprovalRequest
from app.schemas.audit import AuditLogDiff, AuditLogEntry
from app.schemas.common import DashboardSummary
from app.schemas.disruption import Disruption
from app.schemas.intelligence import DisruptionDetail
from app.schemas.inventory import WarehouseInventory
from app.schemas.order import OrderAtRisk
from app.schemas.shipment import Shipment
from app.schemas.supplier import Supplier
from app.schemas.webhook import CarrierWebhook
from app.services.disruption_intelligence import disruption_detail, ingest_carrier_event
from app.services.read_models import dashboard_summary, list_inventory, list_orders_at_risk, list_shipments, list_suppliers

api_router = APIRouter()
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

# Mount Sub-routers
api_router.include_router(auth_router)
api_router.include_router(recovery_router)
api_router.include_router(ai_router)


def _check_perm(user: User, perm: Permission) -> None:
    if not role_has_permission(user.role, perm):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": f"Role '{user.role}' lacks permission '{perm.value}'"},
        )


@api_router.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Healthcheck endpoint confirming backend operational status."""
    return {
        "status": "healthy",
        "service": "DisruptionIQ FastAPI Backend",
        "version": get_settings().version,
        "environment": get_settings().environment,
    }


@api_router.get("/dashboard/summary", response_model=DashboardSummary, tags=["Dashboard"])
def get_dashboard_summary(db: DbSession, current_user: CurrentUser) -> DashboardSummary:
    _check_perm(current_user, Permission.DASHBOARD_READ)
    return dashboard_summary(db)


@api_router.get("/disruptions", response_model=list[Disruption], tags=["Disruptions"])
def get_disruptions(
    db: DbSession,
    current_user: CurrentUser,
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
) -> list[Disruption]:
    _check_perm(current_user, Permission.DISRUPTIONS_READ)
    statement = select(DisruptionRecord)
    if status:
        statement = statement.where(DisruptionRecord.status == status)
    if severity:
        statement = statement.where(DisruptionRecord.severity == severity)
    records = db.scalars(statement.order_by(DisruptionRecord.detected_at.desc())).all()
    result: list[Disruption] = []
    for record in records:
        payload = json.loads(record.payload_json or "{}")
        impacts = db.scalars(select(DisruptionImpact).where(DisruptionImpact.disruption_id == record.id)).all()
        affected_skus = [impact.entity_id for impact in impacts if impact.entity_type == "sku"]
        shipments = [impact.entity_id for impact in impacts if impact.entity_type == "shipment"]
        warehouses = [impact.entity_id for impact in impacts if impact.entity_type == "warehouse"]
        orders = [impact.entity_id for impact in impacts if impact.entity_type == "order"]
        result.append(Disruption(
            id=record.id, title=record.title, type=payload.get("type", "unknown"), typeLabel=payload.get("type", "unknown").replace("_", " ").title(),
            severity=record.severity, status=record.status, detectedAt=record.detected_at.isoformat(), location="", carrierOrSupplier="",
            delayHours=payload.get("delayHours", 0), affectedOrderCount=len(set(orders)), affectedSKUs=sorted(set(affected_skus)),
            estimatedFinancialImpactUSD=0, summary=payload.get("summary", ""), rootCause="Deterministic carrier and inventory evidence",
            eventPayload=payload, timeline=[], linkedShipmentIds=sorted(set(shipments)), linkedWarehouseIds=sorted(set(warehouses)),
        ))
    return result


@api_router.get("/disruptions/{disruption_id}", response_model=DisruptionDetail, tags=["Disruptions"])
def get_disruption_detail(disruption_id: str, db: DbSession, current_user: CurrentUser) -> dict:
    """Return affected entities, orders, and the evidence behind every decision."""
    _check_perm(current_user, Permission.DISRUPTIONS_READ)
    return disruption_detail(db, disruption_id)


@api_router.post("/webhooks/carrier", status_code=202, tags=["Webhooks"])
def carrier_webhook(event: CarrierWebhook, db: DbSession) -> dict:
    """Ingest a schema-validated carrier update exactly once using eventId idempotency."""
    return ingest_carrier_event(db, event)


@api_router.get("/orders/at-risk", response_model=list[OrderAtRisk], tags=["Orders"])
def get_orders_at_risk(
    db: DbSession,
    current_user: CurrentUser,
    disruption_id: str | None = Query(default=None),
    priority: str | None = Query(default=None, pattern="^P[1-3]$"),
) -> list[OrderAtRisk]:
    _check_perm(current_user, Permission.ORDERS_READ)
    return list_orders_at_risk(db, disruption_id, priority)


@api_router.get("/inventory", response_model=list[WarehouseInventory], tags=["Inventory"])
def get_inventory(
    db: DbSession,
    current_user: CurrentUser,
    warehouse_id: str | None = None,
    sku: str | None = None,
) -> list[WarehouseInventory]:
    _check_perm(current_user, Permission.INVENTORY_READ)
    return list_inventory(db, warehouse_id, sku)


@api_router.get("/shipments", response_model=list[Shipment], tags=["Shipments"])
def get_shipments(
    db: DbSession,
    current_user: CurrentUser,
    status: str | None = None,
) -> list[Shipment]:
    _check_perm(current_user, Permission.SHIPMENTS_READ)
    return list_shipments(db, status)


@api_router.get("/suppliers", response_model=list[Supplier], tags=["Suppliers"])
def get_suppliers(db: DbSession, current_user: CurrentUser) -> list[Supplier]:
    _check_perm(current_user, Permission.SUPPLIERS_READ)
    return list_suppliers(db)


@api_router.get("/approvals", response_model=list[ApprovalRequest], tags=["Approvals"])
def get_approvals(
    db: DbSession,
    current_user: CurrentUser,
    status: str | None = None,
) -> list[ApprovalRequest]:
    _check_perm(current_user, Permission.APPROVALS_READ)
    plans = db.scalars(select(RecoveryPlan)).all()
    results: list[ApprovalRequest] = []
    for plan in plans:
        if plan.status in ("submitted", "approved", "rejected", "modification_requested"):
            approval_status = "pending" if plan.status == "submitted" else plan.status
            if status and approval_status != status:
                continue
            disruption = db.get(DisruptionRecord, plan.disruption_id)
            title = disruption.title if disruption else f"Disruption {plan.disruption_id}"
            results.append(ApprovalRequest(
                id=plan.approval_id or f"REQ-{plan.id}",
                planId=plan.id,
                planName=plan.name,
                disruptionId=plan.disruption_id,
                disruptionTitle=title,
                requesterName=plan.submitted_by or plan.created_by or "analyst",
                requesterRole="analyst",
                requestedAt=plan.created_at.isoformat(),
                estimatedCostUSD=float(plan.estimated_cost_usd or 0.0),
                affectedOrdersCount=plan.orders_protected_count or 0,
                projectedSavingsUSD=round(float(plan.estimated_cost_usd or 0.0) * 1.5, 2),
                status=approval_status,
                reviewedBy=plan.approved_by or plan.rejected_by,
                reviewedRole="director" if (plan.approved_by or plan.rejected_by) else None,
                reviewedAt=plan.updated_at.isoformat() if plan.status in ("approved", "rejected") else None,
                justificationNotes="Recovery action required for priority orders",
                reviewerComments=plan.rejection_reason or plan.modification_reason,
                requiredApprovalLevel="Manager",
            ))
    return results


@api_router.get("/audit", response_model=list[AuditLogEntry], tags=["Audit"])
def get_audit_log(db: DbSession, current_user: CurrentUser) -> list[AuditLogEntry]:
    """Return immutable audit trail combining governance records and plan events."""
    _check_perm(current_user, Permission.AUDIT_READ)
    entries: list[AuditLogEntry] = []

    # 1. Plan Audit Events
    plan_events = db.scalars(
        select(PlanAuditEvent).order_by(PlanAuditEvent.occurred_at.desc()).limit(100)
    ).all()
    for pe in plan_events:
        payload = json.loads(pe.payload_json or "{}")
        before_state = payload.get("before")
        after_state = payload.get("after")
        diff = AuditLogDiff(before=before_state, after=after_state) if (before_state or after_state) else None
        reason = payload.get("reason") or payload.get("justification") or payload.get("reviewerComments") or pe.action
        entries.append(AuditLogEntry(
            id=pe.id,
            timestamp=pe.occurred_at.isoformat(),
            actorName=pe.actor_id,
            actorRole=pe.actor_role,
            action=pe.action,
            entityType="RecoveryPlan",
            entityId=pe.plan_id,
            reason=reason,
            changesSummary=f"{pe.action} applied to plan {pe.plan_id}",
            diffPayload=diff,
        ))

    # 2. General Governance Audit Records
    audit_records = db.scalars(
        select(AuditRecord).order_by(AuditRecord.timestamp.desc()).limit(100)
    ).all()
    for ar in audit_records:
        payload = json.loads(ar.payload_json or "{}")
        before_state = payload.get("before")
        after_state = payload.get("after")
        diff = AuditLogDiff(before=before_state, after=after_state) if (before_state or after_state) else None
        entries.append(AuditLogEntry(
            id=ar.id,
            timestamp=ar.timestamp.isoformat(),
            actorName=payload.get("username", "system"),
            actorRole=payload.get("role", "system"),
            action=ar.action,
            entityType=ar.entity_type,
            entityId=ar.entity_id,
            reason=payload.get("reason", ar.action),
            changesSummary=f"{ar.action} on {ar.entity_type} {ar.entity_id}",
            diffPayload=diff,
        ))

    # Sort all entries chronologically descending
    entries.sort(key=lambda x: x.timestamp, reverse=True)
    return entries
