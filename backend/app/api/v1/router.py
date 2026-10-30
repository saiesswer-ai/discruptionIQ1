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
from app.api.v1.warehouses import warehouses_router
from app.core.config import get_settings
from app.core.database import get_db
from app.core.permissions import Permission, role_has_permission
from app.models.auth import User
from app.models.governance import ApprovalRecord, AuditRecord, DisruptionImpact, DisruptionRecord
from app.models.recovery import PlanAuditEvent, RecoveryPlan
from app.schemas.approval import ApprovalRequest
from app.schemas.audit import AuditLogDiff, AuditLogEntry
from app.schemas.common import DashboardSummary
from app.schemas.disruption import Disruption, DisruptionCreate, DisruptionUpdate
from app.schemas.intelligence import DisruptionDetail
from app.schemas.inventory import (
    InventoryAdjustmentRequest,
    StockMovementRequest,
    WarehouseInventory,
)
from app.schemas.order import (
    BulkOrderCreateRequest,
    BulkOrderCreateResponse,
    OrderAtRisk,
    OrderCreate,
    OrderUpdate,
)
from app.schemas.shipment import Shipment, ShipmentCreate, ShipmentUpdate
from app.schemas.supplier import Supplier, SupplierIssueCreate
from app.schemas.webhook import CarrierWebhook
from app.services.disruption_intelligence import disruption_detail, ingest_carrier_event
from app.services.manual_data_service import (
    adjust_inventory,
    bulk_create_orders,
    create_manual_disruption,
    create_order,
    create_shipment,
    record_supplier_issue,
    to_disruption_schema,
    transfer_stock,
    update_disruption,
    update_order,
    update_shipment,
)
from app.services.read_models import dashboard_summary, list_inventory, list_orders_at_risk, list_shipments, list_suppliers

api_router = APIRouter()
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

# Mount Sub-routers
api_router.include_router(auth_router)
api_router.include_router(recovery_router)
api_router.include_router(ai_router)
api_router.include_router(warehouses_router)


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
    return [to_disruption_schema(db, record) for record in records]


@api_router.post("/disruptions", response_model=Disruption, status_code=status.HTTP_201_CREATED, tags=["Disruptions"])
def report_disruption(
    payload: DisruptionCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> Disruption:
    """Report and persist an operational disruption with automatic entity linking."""
    _check_perm(current_user, Permission.DISRUPTIONS_WRITE)
    return create_manual_disruption(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
        settings=get_settings(),
    )


@api_router.patch("/disruptions/{disruption_id}", response_model=Disruption, tags=["Disruptions"])
def patch_disruption(
    disruption_id: str,
    payload: DisruptionUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> Disruption:
    """Update disruption status, severity, or add timeline evidence."""
    _check_perm(current_user, Permission.DISRUPTIONS_WRITE)
    return update_disruption(
        db,
        disruption_id=disruption_id,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


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


@api_router.post("/orders", response_model=OrderAtRisk, status_code=status.HTTP_201_CREATED, tags=["Orders"])
def create_new_order(
    payload: OrderCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> OrderAtRisk:
    """Create a customer order with validated lines and authoritative backend risk scoring."""
    _check_perm(current_user, Permission.ORDERS_WRITE)
    return create_order(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
        settings=get_settings(),
    )


@api_router.post("/orders/bulk", response_model=BulkOrderCreateResponse, status_code=status.HTTP_200_OK, tags=["Orders"])
def bulk_create_new_orders(
    payload: BulkOrderCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> BulkOrderCreateResponse:
    """Import a batch of customer orders with validation, idempotency, and audit logging."""
    _check_perm(current_user, Permission.ORDERS_WRITE)
    return bulk_create_orders(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
        settings=get_settings(),
    )


@api_router.patch("/orders/{order_id}", response_model=OrderAtRisk, tags=["Orders"])
def patch_order(
    order_id: str,
    payload: OrderUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> OrderAtRisk:
    """Update order attributes and recalculate risk score deterministically."""
    _check_perm(current_user, Permission.ORDERS_WRITE)
    return update_order(
        db,
        order_id=order_id,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
        settings=get_settings(),
    )


@api_router.get("/inventory", response_model=list[WarehouseInventory], tags=["Inventory"])
def get_inventory(
    db: DbSession,
    current_user: CurrentUser,
    warehouse_id: str | None = None,
    sku: str | None = None,
) -> list[WarehouseInventory]:
    _check_perm(current_user, Permission.INVENTORY_READ)
    return list_inventory(db, warehouse_id, sku)


@api_router.post("/inventory/adjust", response_model=WarehouseInventory, tags=["Inventory"])
def post_adjust_inventory(
    payload: InventoryAdjustmentRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseInventory:
    """Perform a transactional inventory adjustment preventing negative stock or reservation breach."""
    _check_perm(current_user, Permission.INVENTORY_WRITE)
    return adjust_inventory(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


@api_router.post("/inventory/transfer", tags=["Inventory"])
def post_transfer_inventory(
    payload: StockMovementRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> dict:
    """Execute a transactional stock movement between two physical warehouses."""
    _check_perm(current_user, Permission.INVENTORY_WRITE)
    return transfer_stock(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


@api_router.get("/shipments", response_model=list[Shipment], tags=["Shipments"])
def get_shipments(
    db: DbSession,
    current_user: CurrentUser,
    status: str | None = None,
) -> list[Shipment]:
    _check_perm(current_user, Permission.SHIPMENTS_READ)
    return list_shipments(db, status)


@api_router.post("/shipments", response_model=Shipment, status_code=status.HTTP_201_CREATED, tags=["Shipments"])
def post_create_shipment(
    payload: ShipmentCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> Shipment:
    """Register an inbound shipment and trigger disruption detection if delayed."""
    _check_perm(current_user, Permission.SHIPMENTS_WRITE)
    return create_shipment(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
        settings=get_settings(),
    )


@api_router.patch("/shipments/{shipment_id}", response_model=Shipment, tags=["Shipments"])
def patch_shipment(
    shipment_id: str,
    payload: ShipmentUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> Shipment:
    """Update shipment status/ETA and feed delay into the disruption intelligence workflow."""
    _check_perm(current_user, Permission.SHIPMENTS_WRITE)
    return update_shipment(
        db,
        shipment_id=shipment_id,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
        settings=get_settings(),
    )


@api_router.get("/suppliers", response_model=list[Supplier], tags=["Suppliers"])
def get_suppliers(db: DbSession, current_user: CurrentUser) -> list[Supplier]:
    _check_perm(current_user, Permission.SUPPLIERS_READ)
    return list_suppliers(db)


@api_router.post("/suppliers/issues", response_model=Supplier, tags=["Suppliers"])
def post_supplier_issue(
    payload: SupplierIssueCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> Supplier:
    """Record an operational delay or quality incident against a supplier."""
    _check_perm(current_user, Permission.SUPPLIERS_WRITE)
    return record_supplier_issue(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
        settings=get_settings(),
    )


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
