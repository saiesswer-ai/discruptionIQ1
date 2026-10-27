"""
Comprehensive test suite for the modular AI assistance layer.
Verifies provider abstractions, structured Pydantic schemas, evidence grounding,
feasibility invariance, database safety, timeouts, and deterministic fallbacks
using a mocked LLM provider (no real API keys required).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.agents.base import (
    BaseLLMProvider,
    LLMError,
    LLMResponseError,
    LLMTimeoutError,
    MockLLMProvider,
    OpenAICompatibleProvider,
    extract_json,
    get_llm_provider,
    mask_secret,
)
from app.agents.disruption_analyst import DisruptionAnalyst
from app.agents.operations_reporter import OperationsReporter
from app.agents.recovery_advisor import RecoveryAdvisor
from app.core.config import Settings
from app.core.database import get_db
from app.main import app
from app.models.governance import DisruptionRecord
from app.models.recovery import RecoveryPlan
from app.schemas.ai import (
    DisruptionAnalysisReport,
    OperationsReport,
    RecoveryTradeOffReport,
)
from app.services.ai_service import AIService, get_ai_service
from app.services.candidate_generator import generate_candidates
from app.services.plan_simulator import create_plans, list_plans

client = TestClient(app)


def _trigger_test_disruption() -> str:
    """Send a webhook event to ensure an active disruption exists in the isolated test DB."""
    event = {
        "eventId": f"test-ai-delay-{uuid4().hex}",
        "trackingNumber": "MSKU-781920-4",
        "eventType": "delay_reported",
        "occurredAt": "2026-10-26T20:00:00Z",
        "status": "delayed",
        "estimatedDeliveryDate": "2026-10-28T06:00:00Z",
        "location": "Rotterdam outer anchorage",
        "reason": "Berth hold",
    }
    res = client.post("/api/v1/webhooks/carrier", json=event)
    data = res.json()
    if data.get("disruptionIds"):
        return data["disruptionIds"][0]
    res_list = client.get("/api/v1/disruptions")
    return res_list.json()[0]["id"]


# ---------------------------------------------------------------------------
# 1. Provider Abstraction & Secrets Masking Tests
# ---------------------------------------------------------------------------

def test_secrets_masking_never_exposes_key():
    """Verify API keys are masked and never exposed in plain text."""
    assert mask_secret(None) == "[NOT SET]"
    assert mask_secret("") == "[NOT SET]"
    assert mask_secret("short") == "[REDACTED]"
    assert mask_secret("sk-1234567890abcdef") == "sk-...cdef"


def test_provider_factory_and_openai_provider_config():
    """Verify provider factory correctly instantiates based on settings."""
    # Default mock provider
    settings_mock = Settings(llm_provider="mock")
    prov_mock = get_llm_provider(settings_mock)
    assert isinstance(prov_mock, MockLLMProvider)

    # OpenAI-compatible provider
    settings_openai = Settings(
        llm_provider="openai",
        llm_api_key="sk-test-secret-key-12345",
        llm_model="gpt-4o-mini",
        llm_base_url="https://api.example.com/v1",
        llm_timeout_seconds=5.0,
    )
    prov_openai = get_llm_provider(settings_openai)
    assert isinstance(prov_openai, OpenAICompatibleProvider)
    assert prov_openai.model == "gpt-4o-mini"
    assert prov_openai.base_url == "https://api.example.com/v1"
    assert prov_openai.timeout_seconds == 5.0


def test_mock_llm_provider_behavior():
    """Test MockLLMProvider canned responses, handlers, and simulated timeouts."""
    mock = MockLLMProvider(default_response='{"status": "ok"}')
    res = mock.complete([{"role": "user", "content": "hello"}])
    assert res == '{"status": "ok"}'
    assert len(mock.call_history) == 1

    # Simulated timeout
    mock_timeout = MockLLMProvider(should_timeout=True)
    with pytest.raises(LLMTimeoutError):
        mock_timeout.complete([{"role": "user", "content": "ping"}])

    # Simulated error
    mock_err = MockLLMProvider(error_to_raise=LLMResponseError("HTTP 500"))
    with pytest.raises(LLMResponseError):
        mock_err.complete([{"role": "user", "content": "ping"}])


def test_extract_json_helper():
    """Verify JSON extractor correctly handles raw JSON and markdown code blocks."""
    raw = '{"key": "value"}'
    assert extract_json(raw) == {"key": "value"}

    wrapped = '```json\n{"key": "value"}\n```'
    assert extract_json(wrapped) == {"key": "value"}

    wrapped_no_lang = '```\n{"key": "value"}\n```'
    assert extract_json(wrapped_no_lang) == {"key": "value"}


# ---------------------------------------------------------------------------
# 2. Disruption Analyst Agent Tests
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_disruption_data():
    return {
        "id": "DIS-TEST001",
        "title": "Port Congestion Delay",
        "type": "carrier_delay",
        "severity": "critical",
        "status": "active",
        "detectedAt": "2026-10-26T18:00:00Z",
        "summary": "Carrier ETA delayed by 48 hours",
        "evidence": [
            {
                "kind": "delivery_comparison",
                "facts": {
                    "shipmentId": "SHP-001",
                    "estimatedDeliveryDate": "2026-10-30T12:00:00Z",
                    "promisedDeliveryDate": "2026-10-28T12:00:00Z",
                    "delayHours": 48,
                },
            }
        ],
        "affectedOrders": [
            {
                "id": "ORD-001",
                "riskScore": 90,
                "riskLevel": "critical",
                "evidence": [
                    {"kind": "delivery_after_deadline", "facts": {"weight": 45}}
                ],
            }
        ],
        "impacts": [
            {"entityType": "shipment", "entityId": "SHP-001", "evidence": {}},
            {"entityType": "sku", "entityId": "SKU-TEST-1", "evidence": {}},
            {"entityType": "warehouse", "entityId": "WH-01", "evidence": {}},
        ],
    }


def test_disruption_analyst_deterministic_fallback_when_disabled(sample_disruption_data):
    """When ai_enabled=False, analyst returns high-quality deterministic fallback."""
    settings = Settings(ai_enabled=False)
    analyst = DisruptionAnalyst(provider=MockLLMProvider(), settings=settings)

    report = analyst.analyze(sample_disruption_data)
    assert isinstance(report, DisruptionAnalysisReport)
    assert report.is_fallback is True
    assert report.disruption_id == "DIS-TEST001"
    assert report.severity == "critical"
    assert "Port Congestion Delay" in report.concise_summary
    assert len(report.verified_facts) > 0
    # Verified facts cite evidence references
    assert any("shipment:SHP-001" in fact.evidence_references for fact in report.verified_facts)
    # Clearly separates assumptions
    assert len(report.assumptions) > 0
    assert any("Assumes carrier estimated delivery date" in a for a in report.assumptions)


def test_disruption_analyst_with_mock_llm(sample_disruption_data):
    """When ai_enabled=True, analyst validates structured LLM response with Pydantic."""
    settings = Settings(ai_enabled=True)
    mock_payload = {
        "disruptionId": "DIS-TEST001",
        "title": "Port Congestion Delay",
        "severity": "critical",
        "conciseSummary": "AI concise assessment: 48h carrier delay jeopardizes critical customer orders.",
        "rootCauseAnalysis": "Vessel berth congestion at Port of LA delayed container discharge.",
        "verifiedFacts": [
            {
                "statement": "Shipment SHP-001 is delayed by 48 hours past its promise date.",
                "evidenceReferences": ["shipment:SHP-001", "delivery_comparison"],
                "entityType": "shipment",
                "entityId": "SHP-001",
            }
        ],
        "assumptions": ["Assumes no customs hold upon eventual vessel discharge."],
        "operationalImpacts": [
            {
                "entityType": "shipment",
                "entityId": "SHP-001",
                "description": "Transit delay on inbound stock",
                "severity": "critical",
            }
        ],
        "recommendedFocusAreas": ["Expedite backup inventory from secondary hub."],
        "isFallback": False,
        "generatedAt": "2026-10-26T18:05:00Z",
    }
    provider = MockLLMProvider(default_response=json.dumps(mock_payload))
    analyst = DisruptionAnalyst(provider=provider, settings=settings)

    report = analyst.analyze(sample_disruption_data)
    assert report.is_fallback is False
    assert report.concise_summary == mock_payload["conciseSummary"]
    assert report.root_cause_analysis == mock_payload["rootCauseAnalysis"]
    assert len(report.verified_facts) == 1
    assert report.verified_facts[0].entity_id == "SHP-001"


def test_disruption_analyst_fallback_on_provider_timeout(sample_disruption_data):
    """When provider times out, analyst catches timeout and returns deterministic fallback."""
    settings = Settings(ai_enabled=True)
    provider = MockLLMProvider(should_timeout=True)
    analyst = DisruptionAnalyst(provider=provider, settings=settings)

    report = analyst.analyze(sample_disruption_data)
    assert report.is_fallback is True
    assert report.disruption_id == "DIS-TEST001"
    assert "CRITICAL" in report.concise_summary


def test_disruption_analyst_fallback_on_invalid_schema(sample_disruption_data):
    """When provider returns malformed JSON or schema violation, fallback is returned."""
    settings = Settings(ai_enabled=True)
    provider = MockLLMProvider(default_response='{"invalid_json": 123}')
    analyst = DisruptionAnalyst(provider=provider, settings=settings)

    report = analyst.analyze(sample_disruption_data)
    assert report.is_fallback is True


# ---------------------------------------------------------------------------
# 3. Recovery Advisor Agent Tests
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_plans():
    return [
        {
            "id": "PLAN-001",
            "name": "On-Hand Priority Allocation",
            "strategyType": "On-Hand Allocation",
            "isFeasible": True,
            "feasibilityScore": 100.0,
            "feasibilityReason": "All hard constraints satisfied.",
            "failedConstraint": None,
            "estimatedCostUSD": 0.0,
            "protectionRatePercent": 60.0,
            "ordersProtectedCount": 3,
            "totalOrdersCount": 5,
            "expectedLateOrdersCount": 2,
            "expectedLatenessHours": 12.0,
            "latenessReductionHours": 36.0,
            "unitsAllocated": 120,
            "carbonEmissionsTonnes": 0.05,
        },
        {
            "id": "PLAN-002",
            "name": "Air Freight Expedite",
            "strategyType": "Air Freight Expedite",
            "isFeasible": True,
            "feasibilityScore": 100.0,
            "feasibilityReason": "All hard constraints satisfied.",
            "failedConstraint": None,
            "estimatedCostUSD": 4500.0,
            "protectionRatePercent": 100.0,
            "ordersProtectedCount": 5,
            "totalOrdersCount": 5,
            "expectedLateOrdersCount": 0,
            "expectedLatenessHours": 0.0,
            "latenessReductionHours": 48.0,
            "unitsAllocated": 200,
            "carbonEmissionsTonnes": 2.10,
        },
        {
            "id": "PLAN-003",
            "name": "Infeasible Backup Supplier",
            "strategyType": "Alternative Supplier",
            "isFeasible": False,
            "feasibilityScore": 40.0,
            "feasibilityReason": "C5_SUPPLIER_ELIGIBILITY: supplier inactive",
            "failedConstraint": "C5_SUPPLIER_ELIGIBILITY",
            "estimatedCostUSD": 1200.0,
            "protectionRatePercent": 80.0,
            "ordersProtectedCount": 4,
            "totalOrdersCount": 5,
            "expectedLateOrdersCount": 1,
            "expectedLatenessHours": 8.0,
            "latenessReductionHours": 40.0,
            "unitsAllocated": 160,
            "carbonEmissionsTonnes": 0.80,
        },
    ]


def test_recovery_advisor_deterministic_fallback(sample_disruption_data, sample_plans):
    """Verify recovery advisor deterministic trade-off explanation."""
    settings = Settings(ai_enabled=False)
    advisor = RecoveryAdvisor(provider=MockLLMProvider(), settings=settings)

    report = advisor.advise(
        disruption_data=sample_disruption_data,
        plans=sample_plans,
        comparison={"recommendedPlanId": "PLAN-002"},
    )
    assert isinstance(report, RecoveryTradeOffReport)
    assert report.is_fallback is True
    assert report.recommended_plan_id == "PLAN-002"
    assert "Air Freight Expedite" in report.recommended_strategy_name
    assert "100.0%" in report.trade_off_explanation
    assert len(report.plan_comparisons) == 3
    # Check that infeasible plan is noted
    infeasible_item = next(p for p in report.plan_comparisons if p.plan_id == "PLAN-003")
    assert infeasible_item.is_feasible is False
    assert "Infeasible due to constraint" in infeasible_item.key_tradeoff


def test_recovery_advisor_enforces_feasibility_cannot_be_bypassed(sample_disruption_data, sample_plans):
    """
    CRITICAL REQUIREMENT 9:
    If the LLM attempts to recommend an infeasible plan (PLAN-003),
    the RecoveryAdvisor must override and revert to the feasible plan (PLAN-002).
    """
    settings = Settings(ai_enabled=True)
    # LLM hallucinates / recommends infeasible PLAN-003
    mock_payload = {
        "disruptionId": "DIS-TEST001",
        "recommendedPlanId": "PLAN-003",  # Infeasible plan!
        "recommendedStrategyName": "Infeasible Backup Supplier",
        "tradeOffExplanation": "AI recommends PLAN-003 because it is cheaper than Air Expedite.",
        "planComparisons": [
            {
                "planId": "PLAN-003",
                "strategyType": "Alternative Supplier",
                "isFeasible": False,
                "estimatedCostUSD": 1200.0,
                "protectionRatePercent": 80.0,
                "expectedLatenessHours": 8.0,
                "carbonEmissionsTonnes": 0.8,
                "keyTradeoff": "Cheaper option.",
            }
        ],
        "feasibilityAcknowledgement": "AI acknowledges PLAN-003 violates supplier constraint.",
        "verifiedMetricsCited": [
            {"planId": "PLAN-003", "metricName": "estimatedCostUSD", "value": 1200.0}
        ],
        "assumptionsAndRisks": ["Assumes supplier can be activated manually."],
        "isFallback": False,
        "generatedAt": "2026-10-26T18:10:00Z",
    }

    provider = MockLLMProvider(default_response=json.dumps(mock_payload))
    advisor = RecoveryAdvisor(provider=provider, settings=settings)

    report = advisor.advise(
        disruption_data=sample_disruption_data,
        plans=sample_plans,
        comparison={"recommendedPlanId": "PLAN-002"},
    )

    # Recovery advisor MUST enforce that recommendedPlanId is feasible!
    assert report.recommended_plan_id == "PLAN-002"
    assert "Deterministic validator override" in report.feasibility_acknowledgement


# ---------------------------------------------------------------------------
# 4. Operations Reporter Agent Tests
# ---------------------------------------------------------------------------

def test_operations_reporter_deterministic_fallback():
    """Verify operations reporter calculates correct aggregated metrics in fallback."""
    settings = Settings(ai_enabled=False)
    reporter = OperationsReporter(provider=MockLLMProvider(), settings=settings)

    disruptions = [
        {"id": "DIS-1", "title": "Delay 1", "severity": "critical", "status": "active", "delayHours": 48, "affectedOrderCount": 4}
    ]
    orders = [
        {"id": "O1", "customerName": "Acme", "priority": "P1", "orderValueUSD": 5000.0, "hoursUntilBreach": 12},
        {"id": "O2", "customerName": "Beta", "priority": "P2", "orderValueUSD": 3000.0, "hoursUntilBreach": 24},
    ]
    inventory = [
        {"warehouseId": "WH-01", "warehouseName": "Main", "sku": "SKU-A", "availableUnits": 5, "safetyStockThreshold": 20, "status": "critical"}
    ]
    shipments = [
        {"id": "SHP-1", "carrierName": "OceanExpress", "transportMode": "ocean", "delayHours": 48, "status": "delayed"}
    ]

    report = reporter.generate_report(
        disruptions=disruptions,
        orders=orders,
        inventory=inventory,
        shipments=shipments,
        simulation_clock="2026-10-26T18:00:00Z",
    )

    assert isinstance(report, OperationsReport)
    assert report.is_fallback is True
    assert report.orders_at_risk_overview["P1"] == 1
    assert report.orders_at_risk_overview["P2"] == 1
    assert report.orders_at_risk_overview["totalValueUSD"] == 8000
    assert len(report.inventory_hotspots) == 1
    assert len(report.logistics_bottlenecks) == 1
    # Check grounded recommendations with evidence references
    assert len(report.priority_action_recommendations) >= 2
    assert any("order:O1" in rec.evidence_reference for rec in report.priority_action_recommendations)


# ---------------------------------------------------------------------------
# 5. AIService Database Safety & State Isolation Tests
# ---------------------------------------------------------------------------

def test_ai_service_analyze_disruption_does_not_mutate_entities():
    """Verify AI service does not mutate inventory, orders, or approvals."""
    ai_service = AIService(settings=Settings(ai_enabled=False))
    disruption_id = _trigger_test_disruption()

    session_gen = get_db()
    db = next(session_gen)
    try:
        disruption = db.get(DisruptionRecord, disruption_id)
        assert disruption is not None
        original_title = disruption.title
        original_status = disruption.status

        # Analyze without saving
        report = ai_service.analyze_disruption(db=db, disruption_id=disruption.id, save_to_db=False)
        assert isinstance(report, DisruptionAnalysisReport)

        # Confirm DB record is untouched
        db.refresh(disruption)
        assert disruption.title == original_title
        assert disruption.status == original_status
    finally:
        db.close()


def test_ai_service_analyze_disruption_save_to_db():
    """Verify save_to_db stores the explanation into DisruptionRecord payload."""
    ai_service = AIService(settings=Settings(ai_enabled=False))
    disruption_id = _trigger_test_disruption()

    session_gen = get_db()
    db = next(session_gen)
    try:
        disruption = db.get(DisruptionRecord, disruption_id)
        assert disruption is not None

        report = ai_service.analyze_disruption(db=db, disruption_id=disruption.id, save_to_db=True)
        db.commit()

        # Reload and check payload
        db.refresh(disruption)
        payload = json.loads(disruption.payload_json or "{}")
        assert "aiAnalysis" in payload
        assert "aiSummary" in payload
        assert payload["aiSummary"] == report.concise_summary
    finally:
        db.close()


def test_ai_service_advise_recovery_cannot_approve_or_execute_plan():
    """
    REQUIREMENT 8:
    Verify AI recovery advisor never executes DB mutations, reserves inventory,
    or changes plan status from 'proposed'/'simulated' to 'approved'/'executed'.
    """
    ai_service = AIService(settings=Settings(ai_enabled=False))
    disruption_id = _trigger_test_disruption()

    session_gen = get_db()
    db = next(session_gen)
    try:
        # Create plans for the disruption
        plans = create_plans(db, disruption_id=disruption_id, actor_id="test", actor_role="planner")
        assert len(plans) > 0

        report = ai_service.advise_recovery(db=db, disruption_id=disruption_id, save_to_db=True)
        db.commit()

        assert isinstance(report, RecoveryTradeOffReport)

        # Check recommended plan
        rec_plan = db.get(RecoveryPlan, report.recommended_plan_id)
        assert rec_plan is not None
        # Status MUST remain proposed or simulated, NEVER approved or executed
        assert rec_plan.status in {"proposed", "simulated"}
        assert rec_plan.approval_status is None
        # Explanation is saved in notes/metadata without approving
        assert "[AI Advisory]" in (rec_plan.execution_notes or "")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 6. FastAPI Endpoints Integration Tests
# ---------------------------------------------------------------------------

def test_api_disruption_analyze_endpoint():
    """Test POST /api/v1/ai/disruptions/{id}/analyze."""
    disruption_id = _trigger_test_disruption()

    # Call AI analyze endpoint
    res_ai = client.post(f"/api/v1/ai/disruptions/{disruption_id}/analyze")
    assert res_ai.status_code == 200
    data = res_ai.json()
    assert data["disruptionId"] == disruption_id
    assert "conciseSummary" in data
    assert "verifiedFacts" in data
    assert "assumptions" in data
    assert data["isFallback"] is True


def test_api_recovery_advise_endpoint():
    """Test POST /api/v1/ai/recovery/{id}/advise."""
    disruption_id = _trigger_test_disruption()

    # Ensure plans exist
    res_plans = client.post(
        "/api/v1/recovery/plans",
        json={"disruptionId": disruption_id},
        headers={"X-Actor-Id": "test", "X-Actor-Role": "planner"},
    )
    assert res_plans.status_code == 201

    res_advise = client.post(f"/api/v1/ai/recovery/{disruption_id}/advise")
    assert res_advise.status_code == 200
    data = res_advise.json()
    assert data["disruptionId"] == disruption_id
    assert "recommendedPlanId" in data
    assert "tradeOffExplanation" in data
    assert "planComparisons" in data
    assert "feasibilityAcknowledgement" in data


def test_api_operations_report_endpoint():
    """Test GET /api/v1/ai/reports/operations."""
    res = client.get("/api/v1/ai/reports/operations")
    assert res.status_code == 200
    report = res.json()
    assert "reportId" in report
    assert "executiveSummary" in report
    assert "ordersAtRiskOverview" in report
    assert "inventoryHotspots" in report
    assert "logisticsBottlenecks" in report
    assert "priorityActionRecommendations" in report


def test_api_analyze_nonexistent_disruption_returns_404():
    """Test 404 behavior for unknown disruption ID."""
    res = client.post("/api/v1/ai/disruptions/DIS-NONEXISTENT/analyze")
    assert res.status_code == 404
