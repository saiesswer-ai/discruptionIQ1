"""Recovery Advisor agent for plan trade-off explanation and feasibility-grounded recommendations."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.agents.base import BaseAgent
from app.schemas.ai import (
    MetricCitation,
    PlanComparisonItem,
    RecoveryTradeOffReport,
)


class RecoveryAdvisor(BaseAgent):
    """
    Evaluates candidate recovery plans and explains multi-criteria trade-offs.
    Strictly respects the deterministic feasibility validator and never overrides it.
    """

    def advise(
        self,
        disruption_data: dict[str, Any],
        plans: list[dict[str, Any]],
        comparison: dict[str, Any] | None = None,
    ) -> RecoveryTradeOffReport:
        """
        Produce a plan trade-off explanation and recommend the top feasible plan.
        If the LLM is disabled or fails, provides a deterministic fallback.
        """
        disruption_id = disruption_data.get("id", "UNKNOWN")
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        # Determine deterministic recommendation from comparison or feasibility
        feasible_plans = [p for p in plans if p.get("isFeasible")]
        deterministic_rec_id = (comparison or {}).get("recommendedPlanId")
        if not deterministic_rec_id:
            if feasible_plans:
                # Rank by protection rate descending, then cost ascending
                sorted_feasible = sorted(
                    feasible_plans,
                    key=lambda p: (-float(p.get("protectionRatePercent", 0)), float(p.get("estimatedCostUSD", 0))),
                )
                deterministic_rec_id = sorted_feasible[0]["id"]
            elif plans:
                deterministic_rec_id = plans[0]["id"]
            else:
                deterministic_rec_id = "NONE"

        def create_fallback() -> RecoveryTradeOffReport:
            plan_comparisons: list[PlanComparisonItem] = []
            verified_metrics: list[MetricCitation] = []

            for p in plans:
                pid = p.get("id", "")
                strat = p.get("strategyType", "Unknown")
                is_feas = bool(p.get("isFeasible"))
                cost = float(p.get("estimatedCostUSD", 0.0))
                prot_pct = float(p.get("protectionRatePercent", 0.0))
                late_hrs = float(p.get("expectedLatenessHours", 0.0))
                carbon = float(p.get("carbonEmissionsTonnes", 0.0))

                tradeoff_note = (
                    f"Feasible plan delivering {prot_pct:.1f}% protection at ${cost:,.2f} cost."
                    if is_feas
                    else f"Infeasible due to constraint: {p.get('feasibilityReason', 'Hard constraint breach')}."
                )

                plan_comparisons.append(
                    PlanComparisonItem(
                        plan_id=pid,
                        strategy_type=strat,
                        is_feasible=is_feas,
                        estimated_cost_usd=cost,
                        protection_rate_percent=prot_pct,
                        expected_lateness_hours=late_hrs,
                        carbon_emissions_tonnes=carbon,
                        key_tradeoff=tradeoff_note,
                    )
                )

                # Cite verified metrics
                verified_metrics.extend([
                    MetricCitation(plan_id=pid, metric_name="estimatedCostUSD", value=cost),
                    MetricCitation(plan_id=pid, metric_name="protectionRatePercent", value=prot_pct),
                    MetricCitation(plan_id=pid, metric_name="expectedLatenessHours", value=late_hrs),
                ])

            rec_plan = next((p for p in plans if p.get("id") == deterministic_rec_id), None)
            rec_name = rec_plan.get("name", "Deterministic Best Effort") if rec_plan else "No Feasible Plan"

            if rec_plan and rec_plan.get("isFeasible"):
                explanation = (
                    f"Recommended plan '{rec_plan.get('name')}' ({rec_plan.get('strategyType')}) "
                    f"satisfies all hard deterministic constraints, protecting "
                    f"{rec_plan.get('ordersProtectedCount')}/{rec_plan.get('totalOrdersCount')} orders "
                    f"({float(rec_plan.get('protectionRatePercent', 0)):.1f}%) with an estimated cost "
                    f"of ${float(rec_plan.get('estimatedCostUSD', 0)):,.2f} and {float(rec_plan.get('carbonEmissionsTonnes', 0)):.2f}t carbon emissions."
                )
                feas_ack = "Validated by deterministic plan validator. Meets inventory, lead time, and supplier constraints."
            else:
                explanation = (
                    "No candidate plan satisfies all deterministic hard constraints. "
                    "Review inventory availability or adjust constraints before approving."
                )
                feas_ack = "Deterministic feasibility checks detected violations in candidate plans."

            assumptions_and_risks = [
                "Assumes warehouse throughput capacity can accommodate picked allocations without internal queuing delays.",
                "Assumes transit carriers maintain quoted lead time estimates under current weather and corridor conditions.",
            ]

            return RecoveryTradeOffReport(
                disruption_id=disruption_id,
                recommended_plan_id=deterministic_rec_id,
                recommended_strategy_name=rec_name,
                trade_off_explanation=explanation,
                plan_comparisons=plan_comparisons,
                feasibility_acknowledgement=feas_ack,
                verified_metrics_cited=verified_metrics,
                assumptions_and_risks=assumptions_and_risks,
                is_fallback=True,
                generated_at=now_iso,
            )

        if not plans:
            return create_fallback()

        # Build prompt supplying strictly persisted metrics
        summarized_plans = []
        for p in plans:
            summarized_plans.append({
                "planId": p.get("id"),
                "name": p.get("name"),
                "strategyType": p.get("strategyType"),
                "isFeasible": p.get("isFeasible"),
                "feasibilityScore": p.get("feasibilityScore"),
                "feasibilityReason": p.get("feasibilityReason"),
                "failedConstraint": p.get("failedConstraint"),
                "estimatedCostUSD": p.get("estimatedCostUSD"),
                "protectionRatePercent": p.get("protectionRatePercent"),
                "ordersProtectedCount": p.get("ordersProtectedCount"),
                "totalOrdersCount": p.get("totalOrdersCount"),
                "expectedLateOrdersCount": p.get("expectedLateOrdersCount"),
                "expectedLatenessHours": p.get("expectedLatenessHours"),
                "latenessReductionHours": p.get("latenessReductionHours"),
                "unitsAllocated": p.get("unitsAllocated"),
                "carbonEmissionsTonnes": p.get("carbonEmissionsTonnes"),
            })

        system_prompt = (
            "You are the DisruptionIQ Recovery Advisor. You evaluate supply chain recovery plan options.\n"
            "STRICT OPERATIONAL RULES:\n"
            "1. Ground all trade-off evaluations solely on the supplied persisted plan metrics.\n"
            "2. NEVER invent inventory numbers, supplier capacity, costs, or arrival times.\n"
            "3. HARD FEASIBILITY RULE: You CANNOT override the deterministic feasibility validator. "
            "Never recommend an infeasible plan (isFeasible=false) over a feasible one.\n"
            "4. Clearly explain the trade-offs between protection rate, cost, lateness, and carbon emissions.\n"
            "5. Cite the exact verified metrics used in your comparison.\n"
            "6. Output ONLY valid JSON adhering to the RecoveryTradeOffReport schema."
        )

        user_prompt = (
            f"Evaluate candidate recovery plans for Disruption {disruption_id}:\n"
            f"DISRUPTION SUMMARY: {disruption_data.get('title')} (Severity: {disruption_data.get('severity')})\n\n"
            f"DETERMINISTIC RECOMMENDATION: {deterministic_rec_id}\n\n"
            f"CANDIDATE RECOVERY PLANS (PERSISTED METRICS):\n"
            f"{json.dumps(summarized_plans, indent=2)}\n\n"
            f"Generate the JSON report with fields: disruptionId, recommendedPlanId, recommendedStrategyName, "
            f"tradeOffExplanation, planComparisons, feasibilityAcknowledgement, verifiedMetricsCited, "
            f"assumptionsAndRisks, isFallback (false), generatedAt."
        )

        result = self._call_llm_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=RecoveryTradeOffReport,
            fallback_factory=create_fallback,
        )

        # Enforce Requirement 9: Do not allow model output to bypass deterministic feasibility
        plan_feasibility_map = {p.get("id"): bool(p.get("isFeasible")) for p in plans}
        if feasible_plans and not plan_feasibility_map.get(result.recommended_plan_id, False):
            # The model recommended an infeasible plan when feasible alternatives exist!
            # Correct the recommendation to the deterministic feasible winner.
            result.recommended_plan_id = deterministic_rec_id
            rec_obj = next((p for p in plans if p.get("id") == deterministic_rec_id), None)
            if rec_obj:
                result.recommended_strategy_name = rec_obj.get("name", "Deterministic Feasible Plan")
            result.feasibility_acknowledgement = (
                "Deterministic validator override: AI suggested plan was infeasible; "
                "reverted to highest-ranked feasible plan."
            )

        return result
