"""FastAPI endpoints for modular AI assistance (Disruption Analyst, Recovery Advisor, Operations Reporter)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.permissions import Permission, role_has_permission
from app.models.auth import User
from app.schemas.ai import (
    DisruptionAnalysisReport,
    OperationsReport,
    RecoveryTradeOffReport,
)
from app.services.ai_service import get_ai_service

ai_router = APIRouter(prefix="/ai", tags=["AI Assistance"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _check_perm(user: User, perm: Permission) -> None:
    if not role_has_permission(user.role, perm):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": f"Role '{user.role}' lacks permission '{perm.value}'"},
        )


@ai_router.post(
    "/disruptions/{disruption_id}/analyze",
    response_model=DisruptionAnalysisReport,
    summary="Analyze disruption with evidence-backed AI summary",
)
def analyze_disruption_endpoint(
    disruption_id: str,
    db: DbSession,
    current_user: CurrentUser,
    save_to_db: bool = Query(default=False, description="Whether to persist the explanation to DisruptionRecord"),
) -> DisruptionAnalysisReport:
    """
    Invoke the Disruption Analyst agent using verified disruption facts and calculated risk factors.
    Falls back gracefully to deterministic analysis if the LLM is unavailable or disabled.
    """
    _check_perm(current_user, Permission.AI_ANALYZE)
    ai_service = get_ai_service()
    return ai_service.analyze_disruption(db=db, disruption_id=disruption_id, save_to_db=save_to_db)


@ai_router.post(
    "/recovery/{disruption_id}/advise",
    response_model=RecoveryTradeOffReport,
    summary="Evaluate recovery plan trade-offs and recommend feasible plan",
)
def advise_recovery_endpoint(
    disruption_id: str,
    db: DbSession,
    current_user: CurrentUser,
    save_to_db: bool = Query(default=False, description="Whether to save the advisory notes to RecoveryPlan"),
) -> RecoveryTradeOffReport:
    """
    Invoke the Recovery Advisor agent to explain multi-criteria trade-offs among candidate plans.
    Guarantees deterministic feasibility checks cannot be bypassed.
    """
    _check_perm(current_user, Permission.AI_ADVISE)
    ai_service = get_ai_service()
    return ai_service.advise_recovery(db=db, disruption_id=disruption_id, save_to_db=save_to_db)


@ai_router.get(
    "/reports/operations",
    response_model=OperationsReport,
    summary="Generate executive operational briefing",
)
def get_operations_report_endpoint(
    db: DbSession,
    current_user: CurrentUser,
) -> OperationsReport:
    """
    Invoke the Operations Reporter agent to generate an executive supply chain briefing
    based on live inventory, shipments, orders at risk, and active disruptions.
    """
    _check_perm(current_user, Permission.AI_REPORT)
    ai_service = get_ai_service()
    return ai_service.generate_operations_report(db=db)
