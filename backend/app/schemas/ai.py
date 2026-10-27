"""Structured Pydantic schemas for AI assistance outputs and evidence citations."""
from __future__ import annotations

from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class FactItem(BaseModel):
    """A single factual claim paired with authoritative evidence references."""
    model_config = ConfigDict(populate_by_name=True)

    statement: str
    evidence_references: list[str] = Field(default_factory=list, alias="evidenceReferences")
    entity_type: str | None = Field(default=None, alias="entityType")
    entity_id: str | None = Field(default=None, alias="entityId")


class ImpactItem(BaseModel):
    """An operational impact on an entity verified by domain services."""
    model_config = ConfigDict(populate_by_name=True)

    entity_type: str = Field(..., alias="entityType")
    entity_id: str = Field(..., alias="entityId")
    description: str
    severity: str


class DisruptionAnalysisReport(BaseModel):
    """Structured analysis report from the Disruption Analyst agent."""
    model_config = ConfigDict(populate_by_name=True)

    disruption_id: str = Field(..., alias="disruptionId")
    title: str
    severity: str
    concise_summary: str = Field(..., alias="conciseSummary")
    root_cause_analysis: str = Field(..., alias="rootCauseAnalysis")
    verified_facts: list[FactItem] = Field(default_factory=list, alias="verifiedFacts")
    assumptions: list[str] = Field(default_factory=list)
    operational_impacts: list[ImpactItem] = Field(default_factory=list, alias="operationalImpacts")
    recommended_focus_areas: list[str] = Field(default_factory=list, alias="recommendedFocusAreas")
    is_fallback: bool = Field(default=False, alias="isFallback")
    generated_at: str = Field(..., alias="generatedAt")


class MetricCitation(BaseModel):
    """Explicit citation of a persisted, deterministic plan metric."""
    model_config = ConfigDict(populate_by_name=True)

    plan_id: str = Field(..., alias="planId")
    metric_name: str = Field(..., alias="metricName")
    value: float | int | str


class PlanComparisonItem(BaseModel):
    """Comparative breakdown of a single candidate recovery plan."""
    model_config = ConfigDict(populate_by_name=True)

    plan_id: str = Field(..., alias="planId")
    strategy_type: str = Field(..., alias="strategyType")
    is_feasible: bool = Field(..., alias="isFeasible")
    estimated_cost_usd: float = Field(..., alias="estimatedCostUSD")
    protection_rate_percent: float = Field(..., alias="protectionRatePercent")
    expected_lateness_hours: float = Field(..., alias="expectedLatenessHours")
    carbon_emissions_tonnes: float = Field(..., alias="carbonEmissionsTonnes")
    key_tradeoff: str = Field(..., alias="keyTradeoff")


class RecoveryTradeOffReport(BaseModel):
    """Structured trade-off explanation and plan comparison from the Recovery Advisor agent."""
    model_config = ConfigDict(populate_by_name=True)

    disruption_id: str = Field(..., alias="disruptionId")
    recommended_plan_id: str = Field(..., alias="recommendedPlanId")
    recommended_strategy_name: str = Field(..., alias="recommendedStrategyName")
    trade_off_explanation: str = Field(..., alias="tradeOffExplanation")
    plan_comparisons: list[PlanComparisonItem] = Field(default_factory=list, alias="planComparisons")
    feasibility_acknowledgement: str = Field(..., alias="feasibilityAcknowledgement")
    verified_metrics_cited: list[MetricCitation] = Field(default_factory=list, alias="verifiedMetricsCited")
    assumptions_and_risks: list[str] = Field(default_factory=list, alias="assumptionsAndRisks")
    is_fallback: bool = Field(default=False, alias="isFallback")
    generated_at: str = Field(..., alias="generatedAt")


class DisruptionSummaryItem(BaseModel):
    """Brief disruption summary item for operational reporting."""
    model_config = ConfigDict(populate_by_name=True)

    disruption_id: str = Field(..., alias="disruptionId")
    title: str
    severity: str
    status: str
    delay_hours: int = Field(..., alias="delayHours")
    affected_orders_count: int = Field(..., alias="affectedOrdersCount")


class InventoryHotspotItem(BaseModel):
    """Identified critical inventory constraint."""
    model_config = ConfigDict(populate_by_name=True)

    warehouse_id: str = Field(..., alias="warehouseId")
    warehouse_name: str = Field(..., alias="warehouseName")
    sku: str
    available_units: int = Field(..., alias="availableUnits")
    safety_stock_threshold: int = Field(..., alias="safetyStockThreshold")
    status: str


class LogisticsBottleneckItem(BaseModel):
    """Identified logistics or carrier bottleneck."""
    model_config = ConfigDict(populate_by_name=True)

    shipment_id: str = Field(..., alias="shipmentId")
    carrier_name: str = Field(..., alias="carrierName")
    transport_mode: str = Field(..., alias="transportMode")
    delay_hours: int = Field(..., alias="delayHours")
    status: str


class ActionRecommendation(BaseModel):
    """Grounded operational recommendation with required evidence reference."""
    model_config = ConfigDict(populate_by_name=True)

    priority: str
    action: str
    rationale: str
    evidence_reference: str = Field(..., alias="evidenceReference")


class OperationsReport(BaseModel):
    """Holistic operational briefing from the Operations Reporter agent."""
    model_config = ConfigDict(populate_by_name=True)

    report_id: str = Field(..., alias="reportId")
    generated_at: str = Field(..., alias="generatedAt")
    simulation_clock: str = Field(..., alias="simulationClock")
    executive_summary: str = Field(..., alias="executiveSummary")
    active_disruptions_summary: list[DisruptionSummaryItem] = Field(default_factory=list, alias="activeDisruptionsSummary")
    orders_at_risk_overview: dict[str, int] = Field(default_factory=dict, alias="ordersAtRiskOverview")
    inventory_hotspots: list[InventoryHotspotItem] = Field(default_factory=list, alias="inventoryHotspots")
    logistics_bottlenecks: list[LogisticsBottleneckItem] = Field(default_factory=list, alias="logisticsBottlenecks")
    priority_action_recommendations: list[ActionRecommendation] = Field(default_factory=list, alias="priorityActionRecommendations")
    verified_facts_count: int = Field(..., alias="verifiedFactsCount")
    assumptions: list[str] = Field(default_factory=list)
    is_fallback: bool = Field(default=False, alias="isFallback")
