"""Disruption Analyst agent for concise disruption summaries and evidence-grounded analysis."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.agents.base import BaseAgent
from app.schemas.ai import (
    DisruptionAnalysisReport,
    FactItem,
    ImpactItem,
)


class DisruptionAnalyst(BaseAgent):
    """
    Analyzes supply chain disruptions using only verified domain facts and evidence.
    Distinguishes verified facts from assumptions and requires evidence citations.
    """

    def analyze(self, disruption_data: dict[str, Any]) -> DisruptionAnalysisReport:
        """
        Generate a structured disruption analysis report.
        If the LLM is disabled or unavailable, returns a verified deterministic fallback.
        """
        disruption_id = disruption_data.get("id", "UNKNOWN")
        title = disruption_data.get("title", "Supply Chain Disruption")
        severity = disruption_data.get("severity", "medium")
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        # Deterministic fallback builder
        def create_fallback() -> DisruptionAnalysisReport:
            evidence_list = disruption_data.get("evidence", [])
            affected_orders = disruption_data.get("affectedOrders", [])
            impacts = disruption_data.get("impacts", [])

            # Extract impacted SKUs and warehouses
            skus = sorted({imp.get("entityId") for imp in impacts if imp.get("entityType") == "sku" and imp.get("entityId")})
            warehouses = sorted({imp.get("entityId") for imp in impacts if imp.get("entityType") == "warehouse" and imp.get("entityId")})
            shipments = sorted({imp.get("entityId") for imp in impacts if imp.get("entityType") == "shipment" and imp.get("entityId")})

            # Formulate verified facts with explicit evidence references
            verified_facts: list[FactItem] = []
            for ev in evidence_list:
                kind = ev.get("kind", "evidence")
                facts = ev.get("facts", {})
                if kind == "delivery_comparison":
                    shipment_id = facts.get("shipmentId", shipments[0] if shipments else "unknown")
                    verified_facts.append(
                        FactItem(
                            statement=f"Shipment {shipment_id} ETA is {facts.get('estimatedDeliveryDate')} vs promised delivery date {facts.get('promisedDeliveryDate')}.",
                            evidence_references=[f"shipment:{shipment_id}", "delivery_comparison"],
                            entity_type="shipment",
                            entity_id=shipment_id,
                        )
                    )
                else:
                    verified_facts.append(
                        FactItem(
                            statement=f"Verified {kind} evidence recorded: {json.dumps(facts)}.",
                            evidence_references=[kind],
                            entity_type=None,
                            entity_id=None,
                        )
                    )

            # Order impact facts
            if affected_orders:
                high_risk_count = sum(1 for o in affected_orders if o.get("riskLevel") in {"critical", "high"})
                verified_facts.append(
                    FactItem(
                        statement=f"{len(affected_orders)} customer orders impacted, with {high_risk_count} at critical or high risk.",
                        evidence_references=[f"order:{o.get('id')}" for o in affected_orders[:5]],
                        entity_type="order",
                        entity_id=affected_orders[0].get("id") if affected_orders else None,
                    )
                )

            # Operational impact items
            operational_impacts: list[ImpactItem] = []
            for imp in impacts:
                operational_impacts.append(
                    ImpactItem(
                        entity_type=imp.get("entityType", "unknown"),
                        entity_id=imp.get("entityId", "unknown"),
                        description=f"Deterministic impact on {imp.get('entityType')} {imp.get('entityId')}",
                        severity=severity,
                    )
                )

            # Concise summary
            concise_summary = (
                f"Disruption {disruption_id} ({title}) is {severity.upper()} severity. "
                f"{len(affected_orders)} customer order(s) affected across {len(skus)} SKU(s) "
                f"at {len(warehouses)} distribution hub(s)."
            )

            # Root cause statement grounded in evidence
            root_cause = (
                f"Carrier transit delay on shipment(s) {', '.join(shipments) if shipments else 'in transit'} "
                f"causing stock shortfall against promised order deadlines."
            )

            # Explicit operational assumptions
            assumptions = [
                "Assumes carrier estimated delivery date does not encounter further unscheduled delays.",
                "Assumes existing on-hand warehouse balances remain reserved for assigned orders.",
            ]

            # Recommended focus areas
            focus_areas = [
                "Prioritize P1 order protection via alternate inventory allocation.",
                "Evaluate expedited transit options to bridge delivery deadline gaps.",
                "Trigger candidate recovery plan simulations.",
            ]

            return DisruptionAnalysisReport(
                disruption_id=disruption_id,
                title=title,
                severity=severity,
                concise_summary=concise_summary,
                root_cause_analysis=root_cause,
                verified_facts=verified_facts,
                assumptions=assumptions,
                operational_impacts=operational_impacts,
                recommended_focus_areas=focus_areas,
                is_fallback=True,
                generated_at=now_iso,
            )

        # Grounding context for LLM prompt
        system_prompt = (
            "You are the DisruptionIQ Disruption Analyst. You provide concise, objective disruption analysis.\n"
            "CRITICAL GROUNDING RULES:\n"
            "1. Base all statements STRICTLY on the provided verified facts, evidence items, and calculated scores.\n"
            "2. NEVER invent inventory quantities, supplier capabilities, costs, or arrival times.\n"
            "3. Every verified fact MUST cite matching evidence references or entity IDs.\n"
            "4. Clearly distinguish verified facts from operational assumptions.\n"
            "5. Do not propose or execute any database modifications.\n"
            "6. Output ONLY valid JSON conforming to the DisruptionAnalysisReport schema."
        )

        user_prompt = (
            f"Analyze the following verified supply chain disruption:\n"
            f"DISRUPTION METADATA:\n"
            f"- ID: {disruption_id}\n"
            f"- Title: {title}\n"
            f"- Type: {disruption_data.get('type')}\n"
            f"- Severity: {severity}\n"
            f"- Status: {disruption_data.get('status')}\n"
            f"- Detected At: {disruption_data.get('detectedAt')}\n"
            f"- Base Summary: {disruption_data.get('summary')}\n\n"
            f"VERIFIED EVIDENCE RECORDS:\n"
            f"{json.dumps(disruption_data.get('evidence', []), indent=2)}\n\n"
            f"CALCULATED ORDER IMPACTS AND SCORES:\n"
            f"{json.dumps(disruption_data.get('affectedOrders', []), indent=2)}\n\n"
            f"ENTITY IMPACTS (Warehouses, SKUs, Shipments):\n"
            f"{json.dumps(disruption_data.get('impacts', []), indent=2)}\n\n"
            f"Please generate the JSON report with fields: disruptionId, title, severity, "
            f"conciseSummary, rootCauseAnalysis, verifiedFacts, assumptions, "
            f"operationalImpacts, recommendedFocusAreas, isFallback (set to false), generatedAt."
        )

        return self._call_llm_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=DisruptionAnalysisReport,
            fallback_factory=create_fallback,
        )
