"""
Modular AI assistance service orchestrating Disruption Analyst, Recovery Advisor,
and Operations Reporter using verified domain data and deterministic models.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents.base import BaseLLMProvider, get_llm_provider
from app.agents.disruption_analyst import DisruptionAnalyst
from app.agents.operations_reporter import OperationsReporter
from app.agents.recovery_advisor import RecoveryAdvisor
from app.core.config import Settings, get_settings
from app.models.governance import DisruptionRecord
from app.models.recovery import RecoveryPlan
from app.schemas.ai import (
    DisruptionAnalysisReport,
    OperationsReport,
    RecoveryTradeOffReport,
)
from app.services.disruption_intelligence import disruption_detail
from app.services.plan_simulator import compare_plans, list_plans
from app.services.read_models import (
    list_inventory,
    list_orders_at_risk,
    list_shipments,
)

logger = logging.getLogger("app.services.ai")


class AIService:
    """
    AI Assistance Service Layer for DisruptionIQ.

    Guarantees:
    - Never mutates authoritative inventory, permissions, or plan approval statuses.
    - Uses only verified disruption telemetry, calculated risk scores, and persisted plan metrics.
    - Enforces deterministic feasibility rules over all LLM recommendations.
    - Provides deterministic fallback responses when the LLM is unavailable or disabled.
    """

    def __init__(
        self,
        provider: BaseLLMProvider | None = None,
        settings: Settings | None = None,
    ):
        self.settings = settings or get_settings()
        self.provider = provider or get_llm_provider(self.settings)

        self.disruption_analyst = DisruptionAnalyst(provider=self.provider, settings=self.settings)
        self.recovery_advisor = RecoveryAdvisor(provider=self.provider, settings=self.settings)
        self.operations_reporter = OperationsReporter(provider=self.provider, settings=self.settings)

    def analyze_disruption(
        self,
        db: Session,
        disruption_id: str,
        save_to_db: bool = False,
    ) -> DisruptionAnalysisReport:
        """
        Generate a concise, evidence-grounded disruption summary and root-cause analysis.
        Optionally saves the AI-generated explanation into the disruption payload.
        """
        # Fetch verified facts and impacts from authoritative domain service
        disruption_data = disruption_detail(db, disruption_id)

        # Run Disruption Analyst agent
        report = self.disruption_analyst.analyze(disruption_data)

        # Save AI-generated explanation with the related disruption where requested
        if save_to_db:
            record = db.get(DisruptionRecord, disruption_id)
            if record:
                payload = json.loads(record.payload_json or "{}")
                payload["aiAnalysis"] = report.model_dump(mode="json", by_alias=True)
                payload["aiSummary"] = report.concise_summary
                record.payload_json = json.dumps(payload, sort_keys=True)
                db.flush()
                logger.info(
                    "Persisted AI disruption analysis to DisruptionRecord",
                    extra={"disruption_id": disruption_id, "is_fallback": report.is_fallback},
                )

        return report

    def advise_recovery(
        self,
        db: Session,
        disruption_id: str,
        save_to_db: bool = False,
    ) -> RecoveryTradeOffReport:
        """
        Generate plan trade-off explanations comparing candidate recovery options.
        Guarantees that deterministic feasibility checks cannot be bypassed.
        Optionally saves the explanation into the recommended plan's metadata.
        """
        # Fetch verified disruption data
        disruption_data = disruption_detail(db, disruption_id)

        # Fetch persisted candidate plans and deterministic comparison
        plans = list_plans(db, disruption_id)
        if not plans:
            raise HTTPException(
                status_code=404,
                detail=f"No recovery plans found for disruption {disruption_id}. Create plans first.",
            )

        comparison = compare_plans(db, disruption_id)

        # Run Recovery Advisor agent
        report = self.recovery_advisor.advise(disruption_data, plans, comparison)

        # Save AI-generated trade-off explanation with the recommended plan where requested
        if save_to_db and report.recommended_plan_id != "NONE":
            rec_plan = db.get(RecoveryPlan, report.recommended_plan_id)
            if rec_plan:
                sim_details = json.loads(rec_plan.simulation_details_json or "{}")
                sim_details["aiTradeoffAnalysis"] = report.model_dump(mode="json", by_alias=True)
                rec_plan.simulation_details_json = json.dumps(sim_details, sort_keys=True)
                if not rec_plan.execution_notes:
                    rec_plan.execution_notes = f"[AI Advisory] {report.trade_off_explanation}"
                db.flush()
                logger.info(
                    "Persisted AI trade-off analysis to RecoveryPlan",
                    extra={"plan_id": rec_plan.id, "is_fallback": report.is_fallback},
                )

        return report

    def generate_operations_report(self, db: Session) -> OperationsReport:
        """
        Produce a comprehensive operational briefing from live verified domain read models.
        """
        # Fetch verified domain telemetry
        disruption_records = db.scalars(select(DisruptionRecord)).all()
        disruptions = [
            {
                "id": r.id,
                "title": r.title,
                "severity": r.severity,
                "status": r.status,
                "delayHours": json.loads(r.payload_json or "{}").get("delayHours", 0),
                "affectedOrderCount": len(json.loads(r.payload_json or "{}").get("affectedOrders", [])),
            }
            for r in disruption_records
        ]

        orders = [o.model_dump(mode="json", by_alias=True) for o in list_orders_at_risk(db, None, None)]
        inventory = [i.model_dump(mode="json", by_alias=True) for i in list_inventory(db, None, None)]
        shipments = [s.model_dump(mode="json", by_alias=True) for s in list_shipments(db, None)]

        clock_iso = self.settings.simulation_clock.isoformat()

        # Run Operations Reporter agent
        return self.operations_reporter.generate_report(
            disruptions=disruptions,
            orders=orders,
            inventory=inventory,
            shipments=shipments,
            simulation_clock=clock_iso,
        )


_default_ai_service: AIService | None = None


def get_ai_service(
    provider: BaseLLMProvider | None = None,
    settings: Settings | None = None,
) -> AIService:
    """Return an AIService instance (creating a default singleton if no custom config passed)."""
    global _default_ai_service
    if provider is not None or settings is not None:
        return AIService(provider=provider, settings=settings)
    if _default_ai_service is None:
        _default_ai_service = AIService()
    return _default_ai_service
