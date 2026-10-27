"""Operations Reporter agent for executive operational briefings and grounded recommendations."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.agents.base import BaseAgent
from app.schemas.ai import (
    ActionRecommendation,
    DisruptionSummaryItem,
    InventoryHotspotItem,
    LogisticsBottleneckItem,
    OperationsReport,
)


class OperationsReporter(BaseAgent):
    """
    Generates cross-functional supply chain operational reports across disruptions,
    inventory posture, order risks, and transit bottlenecks.
    """

    def generate_report(
        self,
        disruptions: list[dict[str, Any]],
        orders: list[dict[str, Any]],
        inventory: list[dict[str, Any]],
        shipments: list[dict[str, Any]],
        simulation_clock: str | None = None,
    ) -> OperationsReport:
        """
        Generate a comprehensive operational briefing.
        Falls back to a fully deterministic report if the LLM is unavailable or disabled.
        """
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        clock_str = simulation_clock or now_iso
        report_id = f"RPT-{uuid.uuid4().hex[:10].upper()}"

        def create_fallback() -> OperationsReport:
            # Active disruptions
            active_disruptions: list[DisruptionSummaryItem] = []
            for d in disruptions:
                if d.get("status") in {"active", "open", "investigating"}:
                    active_disruptions.append(
                        DisruptionSummaryItem(
                            disruption_id=d.get("id", ""),
                            title=d.get("title", ""),
                            severity=d.get("severity", "medium"),
                            status=d.get("status", "active"),
                            delay_hours=int(d.get("delayHours", 0)),
                            affected_orders_count=int(d.get("affectedOrderCount", 0)),
                        )
                    )

            # Orders overview
            p1_count = sum(1 for o in orders if o.get("priority") == "P1")
            p2_count = sum(1 for o in orders if o.get("priority") == "P2")
            p3_count = sum(1 for o in orders if o.get("priority") == "P3")
            total_val = sum(float(o.get("orderValueUSD", 0.0)) for o in orders)
            orders_overview = {
                "P1": p1_count,
                "P2": p2_count,
                "P3": p3_count,
                "totalAtRisk": len(orders),
                "totalValueUSD": int(total_val),
            }

            # Inventory hotspots
            inventory_hotspots: list[InventoryHotspotItem] = []
            for inv in inventory:
                avail = int(inv.get("availableUnits", 0))
                thresh = int(inv.get("safetyStockThreshold", 0))
                status = str(inv.get("status", "normal"))
                if avail < thresh or status != "normal":
                    inventory_hotspots.append(
                        InventoryHotspotItem(
                            warehouse_id=inv.get("warehouseId", ""),
                            warehouse_name=inv.get("warehouseName", ""),
                            sku=inv.get("sku", ""),
                            available_units=avail,
                            safety_stock_threshold=thresh,
                            status=status,
                        )
                    )

            # Logistics bottlenecks
            logistics_bottlenecks: list[LogisticsBottleneckItem] = []
            for shp in shipments:
                delay = int(shp.get("delayHours", 0))
                status = str(shp.get("status", "in_transit"))
                if delay > 0 or status in {"delayed", "customs_hold"}:
                    logistics_bottlenecks.append(
                        LogisticsBottleneckItem(
                            shipment_id=shp.get("id", ""),
                            carrier_name=shp.get("carrierName", "Unknown Carrier"),
                            transport_mode=shp.get("transportMode", "ocean"),
                            delay_hours=delay,
                            status=status,
                        )
                    )

            # Grounded priority actions
            recommendations: list[ActionRecommendation] = []
            if active_disruptions:
                crit_d = [d for d in active_disruptions if d.severity == "critical"]
                top_d = crit_d[0] if crit_d else active_disruptions[0]
                recommendations.append(
                    ActionRecommendation(
                        priority="Immediate (0-2h)",
                        action=f"Review and simulate Recovery Arena candidate plans for {top_d.disruption_id}.",
                        rationale=f"Disruption {top_d.disruption_id} affects {top_d.affected_orders_count} orders with {top_d.delay_hours}h delay.",
                        evidence_reference=f"disruption:{top_d.disruption_id}",
                    )
                )

            if p1_count > 0:
                p1_orders = [o for o in orders if o.get("priority") == "P1"]
                top_p1 = p1_orders[0]
                recommendations.append(
                    ActionRecommendation(
                        priority="High (2-4h)",
                        action=f"Protect Tier 1 allocation for Order {top_p1.get('id')} ({top_p1.get('customerName')}).",
                        rationale=f"P1 SLA deadline breach risk at {top_p1.get('hoursUntilBreach')}h.",
                        evidence_reference=f"order:{top_p1.get('id')}",
                    )
                )

            if logistics_bottlenecks:
                top_shp = logistics_bottlenecks[0]
                recommendations.append(
                    ActionRecommendation(
                        priority="Medium (4-8h)",
                        action=f"Coordinate with carrier {top_shp.carrier_name} on {top_shp.shipment_id} expedite options.",
                        rationale=f"Shipment {top_shp.shipment_id} has {top_shp.delay_hours}h delay ({top_shp.status}).",
                        evidence_reference=f"shipment:{top_shp.shipment_id}",
                    )
                )

            verified_count = len(disruptions) + len(orders) + len(inventory) + len(shipments)

            summary_text = (
                f"Operational Status at clock {clock_str}: {len(active_disruptions)} active disruption(s) detected. "
                f"{len(orders)} customer orders at risk (${total_val:,.2f} total value), including {p1_count} critical P1 orders. "
                f"{len(inventory_hotspots)} inventory hotspot(s) and {len(logistics_bottlenecks)} transit delay(s) tracked."
            )

            assumptions = [
                "Assumes carrier status updates reflect latest EDI tracking timestamps.",
                "Assumes warehouse safety-stock parameters reflect current operating policy.",
            ]

            return OperationsReport(
                report_id=report_id,
                generated_at=now_iso,
                simulation_clock=clock_str,
                executive_summary=summary_text,
                active_disruptions_summary=active_disruptions,
                orders_at_risk_overview=orders_overview,
                inventory_hotspots=inventory_hotspots,
                logistics_bottlenecks=logistics_bottlenecks,
                priority_action_recommendations=recommendations,
                verified_facts_count=verified_count,
                assumptions=assumptions,
                is_fallback=True,
            )

        # Prepare verified domain data for model
        input_summary = {
            "simulationClock": clock_str,
            "disruptionsCount": len(disruptions),
            "ordersAtRiskCount": len(orders),
            "inventoryItemsCount": len(inventory),
            "shipmentsCount": len(shipments),
            "activeDisruptions": [
                {"id": d.get("id"), "title": d.get("title"), "severity": d.get("severity"), "delayHours": d.get("delayHours")}
                for d in disruptions if d.get("status") in {"active", "open", "investigating"}
            ],
            "p1OrdersSample": [
                {"id": o.get("id"), "customer": o.get("customerName"), "hoursUntilBreach": o.get("hoursUntilBreach"), "val": o.get("orderValueUSD")}
                for o in orders if o.get("priority") == "P1"
            ][:5],
            "delayedShipments": [
                {"id": s.get("id"), "carrier": s.get("carrierName"), "delayHours": s.get("delayHours"), "status": s.get("status")}
                for s in shipments if int(s.get("delayHours", 0)) > 0
            ],
        }

        system_prompt = (
            "You are the DisruptionIQ Operations Reporter. You generate executive operational briefings.\n"
            "CRITICAL CONSTRAINTS:\n"
            "1. Ground all analysis and metrics strictly in the supplied verified network telemetry.\n"
            "2. NEVER invent inventory quantities, arrival times, costs, or supplier capacities.\n"
            "3. Every action recommendation MUST cite an exact evidence reference (e.g. order:ID, disruption:ID, shipment:ID).\n"
            "4. Clearly distinguish verified facts from assumptions.\n"
            "5. Do NOT execute or simulate database mutations.\n"
            "6. Output ONLY valid JSON conforming to the OperationsReport schema."
        )

        user_prompt = (
            f"Generate an operational briefing based on this verified supply chain network state:\n"
            f"{json.dumps(input_summary, indent=2)}\n\n"
            f"Generate the JSON report with fields: reportId, generatedAt, simulationClock, "
            f"executiveSummary, activeDisruptionsSummary, ordersAtRiskOverview, inventoryHotspots, "
            f"logisticsBottlenecks, priorityActionRecommendations, verifiedFactsCount, "
            f"assumptions, isFallback (false)."
        )

        return self._call_llm_structured(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            schema=OperationsReport,
            fallback_factory=create_fallback,
        )
