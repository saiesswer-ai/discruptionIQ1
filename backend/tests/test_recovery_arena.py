"""
Unit and integration tests for the Recovery Arena engine.

Tests cover (Requirement 16):
  1.  Competing orders: limited stock distributed by FairShare priority weights
  2.  Insufficient stock: FULL_ONLY orders get 0; PARTIAL_ALLOWED get what's left
  3.  Duplicate allocation guard: same (plan, order, SKU) cannot be written twice
  4.  Split-order rules: partial fills only on PARTIAL_ALLOWED orders
  5.  Lead-time constraints: inbound inventory not counted before its arrival
  6.  Stale plan protection: execution fails when inventory has changed since plan creation
  7.  Plan lifecycle: proposed → simulated → submitted → approved → executed
  8.  Idempotent execution: same idempotency key is safe to replay
  9.  Plan creation: 6 strategies generated, each with a unique ID
  10. Feasibility validation: infeasible plans carry machine-readable reasons
  11. Plan comparison: ranked by protection rate then cost
  12. Audit trail: every lifecycle action produces a persisted event
  13. Alt-supplier eligibility: inactive supplier fails C5 constraint
  14. No LLM: all metrics, costs and decisions are deterministic ints/floats
  15. API smoke tests: all documented endpoints return correct status codes
  16. Database isolation: each test gets a clean seeded DB
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core import database
from app.main import app
from app.models.recovery import PlanAllocation, PlanAuditEvent, RecoveryPlan
from app.models.supply_chain import Inventory, Order, OrderLine, Supplier
from app.services.candidate_generator import generate_candidates
from app.services.fairshare_allocator import (
    AllocationCandidate,
    AllocationResult,
    fairshare_allocate,
)
from app.services.inventory_snapshot import PlanLedger, build_snapshot
from app.services.plan_executor import ExecutionError, execute_plan, submit_plan_for_approval, approve_plan
from app.services.plan_simulator import compare_plans, create_plans, get_plan, simulate_plan
from app.services.plan_validator import validate_plan
from sqlalchemy import select


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_db():
    """Return a fresh test session."""
    return database.SessionLocal()


def _disruption_with_orders(db, n_orders: int = 2) -> str:
    """
    Create a minimal disruption + orders + order_lines in the test DB so
    generate_candidates has something to work with.
    Returns the disruption_id.
    """
    from app.models.governance import DisruptionRecord

    dis_id = f"DIS-TEST-{uuid.uuid4().hex[:6].upper()}"
    db.add(DisruptionRecord(
        id=dis_id,
        title="Test disruption",
        severity="high",
        status="active",
        detected_at=datetime.now(timezone.utc),
    ))
    db.flush()

    # Use the first warehouse and a known SKU from seeded inventory
    wh_id = "WH-CHI-01"
    sku = "MCU-8800"

    for i in range(n_orders):
        ord_id = f"ORD-TST-{uuid.uuid4().hex[:6]}"
        priority = "P1" if i == 0 else "P2"
        policy = "FULL_ONLY" if i == 0 else "PARTIAL_ALLOWED"
        db.add(Order(
            id=ord_id,
            customer_name=f"TestCustomer{i}",
            customer_tier="Enterprise" if i == 0 else "Standard",
            priority=priority,
            promised_deadline=datetime(2026, 10, 30, tzinfo=timezone.utc),
            hours_until_breach=72,
            order_value_usd="5000.00",
            risk_score=80,
            risk_level="high",
            mitigation_status="pending",
            associated_disruption_id=dis_id,
            primary_warehouse_id=wh_id,
            fulfillment_policy=policy,
            explanation="Test order",
        ))
        db.flush()
        db.add(OrderLine(
            id=f"LINE-{uuid.uuid4().hex[:8]}",
            order_id=ord_id,
            sku=sku,
            sku_description="Microcontroller Unit 8800",
            quantity=50,
            unit_price_usd="25.00",
            line_total_usd="1250.00",
        ))
        db.flush()

    db.commit()
    return dis_id


# ===========================================================================
# 1. Competing orders: FairShare distributes by priority weight
# ===========================================================================

class TestFairShareCompetingOrders:

    def test_p1_order_gets_more_than_p2_when_stock_is_scarce(self):
        """P1 weight=10 should beat P2 weight=5 when only partial stock exists."""
        p1 = AllocationCandidate(
            order_id="ORD-P1", customer_name="Alpha", customer_tier="Enterprise",
            priority="P1", fulfillment_policy="PARTIAL_ALLOWED", sku="MCU-8800",
            sku_description="MCU", order_quantity=100, hours_until_breach=48,
            order_value_usd=5000.0, primary_warehouse_id="WH-1",
        )
        p2 = AllocationCandidate(
            order_id="ORD-P2", customer_name="Beta", customer_tier="Standard",
            priority="P2", fulfillment_policy="PARTIAL_ALLOWED", sku="MCU-8800",
            sku_description="MCU", order_quantity=100, hours_until_breach=72,
            order_value_usd=3000.0, primary_warehouse_id="WH-1",
        )
        from app.services.inventory_snapshot import InventorySlot
        slot = InventorySlot(
            inventory_id="INV-1", warehouse_id="WH-1", warehouse_name="Test WH",
            sku="MCU-8800", sku_description="MCU", category="Electronics",
            on_hand_units=90, available_units=90, reserved_units=0,
            inbound_units=0, safety_stock_threshold=10, unit_cost_usd=25.0,
            status="healthy",
        )
        ledger = PlanLedger()
        results = fairshare_allocate([p1, p2], [slot], ledger, priority_weights={"P1": 10, "P2": 5, "P3": 1})

        p1_result = next(r for r in results if r.order_id == "ORD-P1")
        p2_result = next(r for r in results if r.order_id == "ORD-P2")

        assert p1_result.allocated_quantity > p2_result.allocated_quantity
        assert p1_result.allocated_quantity + p2_result.allocated_quantity == 90

    def test_tie_breaking_by_deadline_then_order_id(self):
        """Two equal-weight orders: the one with fewer hours_until_breach wins."""
        from app.services.inventory_snapshot import InventorySlot
        urgent = AllocationCandidate(
            order_id="ORD-AAA", customer_name="Urgent", customer_tier="Enterprise",
            priority="P1", fulfillment_policy="PARTIAL_ALLOWED", sku="SKU-X",
            sku_description="X", order_quantity=60, hours_until_breach=10,
            order_value_usd=1000.0, primary_warehouse_id="WH-1",
        )
        relaxed = AllocationCandidate(
            order_id="ORD-ZZZ", customer_name="Relaxed", customer_tier="Enterprise",
            priority="P1", fulfillment_policy="PARTIAL_ALLOWED", sku="SKU-X",
            sku_description="X", order_quantity=60, hours_until_breach=100,
            order_value_usd=1000.0, primary_warehouse_id="WH-1",
        )
        slot = InventorySlot(
            inventory_id="INV-X", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-X", sku_description="X", category="Cat",
            on_hand_units=80, available_units=80, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="healthy",
        )
        ledger = PlanLedger()
        results = fairshare_allocate([urgent, relaxed], [slot], ledger)

        urgent_r = next(r for r in results if r.order_id == "ORD-AAA")
        relaxed_r = next(r for r in results if r.order_id == "ORD-ZZZ")

        # ORD-AAA has urgency bonus (10h < 24h threshold)
        assert urgent_r.allocated_quantity >= relaxed_r.allocated_quantity


# ===========================================================================
# 2. Insufficient stock: FULL_ONLY vs PARTIAL_ALLOWED
# ===========================================================================

class TestInsufficientStock:

    def test_full_only_order_gets_zero_when_stock_insufficient(self):
        """If total available < order_quantity, FULL_ONLY orders must get 0."""
        from app.services.inventory_snapshot import InventorySlot
        full_only = AllocationCandidate(
            order_id="ORD-F1", customer_name="C", customer_tier="Enterprise",
            priority="P1", fulfillment_policy="FULL_ONLY", sku="SKU-Y",
            sku_description="Y", order_quantity=100, hours_until_breach=50,
            order_value_usd=2000.0, primary_warehouse_id="WH-1",
        )
        slot = InventorySlot(
            inventory_id="INV-Y", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-Y", sku_description="Y", category="Cat",
            on_hand_units=40, available_units=40, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="constrained",
        )
        ledger = PlanLedger()
        results = fairshare_allocate([full_only], [slot], ledger, split_order_permitted=False)

        assert results[0].allocated_quantity == 0
        assert results[0].outcome_status == "late_breached"

    def test_partial_allowed_order_gets_available_when_stock_insufficient(self):
        """PARTIAL_ALLOWED order receives what's available (not 0 and not full)."""
        from app.services.inventory_snapshot import InventorySlot
        partial = AllocationCandidate(
            order_id="ORD-PA1", customer_name="C", customer_tier="Standard",
            priority="P2", fulfillment_policy="PARTIAL_ALLOWED", sku="SKU-Z",
            sku_description="Z", order_quantity=100, hours_until_breach=60,
            order_value_usd=1000.0, primary_warehouse_id="WH-1",
        )
        slot = InventorySlot(
            inventory_id="INV-Z", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-Z", sku_description="Z", category="Cat",
            on_hand_units=35, available_units=35, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="constrained",
        )
        ledger = PlanLedger()
        results = fairshare_allocate([partial], [slot], ledger)

        assert 0 < results[0].allocated_quantity <= 35
        assert results[0].outcome_status == "partial_delay"


# ===========================================================================
# 3. Duplicate allocation guard
# ===========================================================================

class TestDuplicateAllocationGuard:

    def test_ledger_prevents_double_draw(self):
        """Two successive draws on same slot must not exceed available_units."""
        from app.services.inventory_snapshot import InventorySlot
        slot = InventorySlot(
            inventory_id="INV-D", warehouse_id="WH-D", warehouse_name="WH",
            sku="SKU-D", sku_description="D", category="Cat",
            on_hand_units=50, available_units=50, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="healthy",
        )
        ledger = PlanLedger()
        drawn1 = ledger.draw(slot, 30)
        drawn2 = ledger.draw(slot, 30)  # Only 20 left
        assert drawn1 == 30
        assert drawn2 == 20
        assert ledger.remaining(slot) == 0

    def test_plan_allocation_unique_constraint(self):
        """DB must reject inserting duplicate (plan_id, order_id, sku)."""
        db = _get_db()
        try:
            now = datetime.now(timezone.utc)
            plan_id = f"PLAN-DUP-{uuid.uuid4().hex[:8].upper()}"
            # Minimal plan record (no FK to disruption needed for this unit test)
            from app.models.governance import DisruptionRecord
            dis_id = f"DIS-DUP-{uuid.uuid4().hex[:6].upper()}"
            db.add(DisruptionRecord(
                id=dis_id, title="dup test", severity="low",
                status="active", detected_at=now,
            ))
            db.flush()
            db.add(RecoveryPlan(
                id=plan_id, disruption_id=dis_id, name="Dup Test",
                strategy_type="test", status="proposed",
                scenario_clock=now.isoformat(), created_at=now, updated_at=now,
            ))
            db.flush()

            alloc_a = PlanAllocation(
                id=f"ALLOC-A-{uuid.uuid4().hex[:8]}",
                plan_id=plan_id, order_id="ORD-X", customer_name="C",
                customer_tier="Enterprise", order_priority="P1",
                sku="SKU-DUP", sku_description="D",
                order_quantity=10, allocated_quantity=10, fulfillment_pct=100.0,
                source_warehouse_id="WH-1", source_warehouse_name="WH",
                source_available_before=10, source_remaining_after=0,
                lead_time_hours=0.0, hours_until_breach=48,
                outcome_status="protected_on_time", action_type="on_hand",
            )
            alloc_b = PlanAllocation(
                id=f"ALLOC-B-{uuid.uuid4().hex[:8]}",
                plan_id=plan_id, order_id="ORD-X", customer_name="C",
                customer_tier="Enterprise", order_priority="P1",
                sku="SKU-DUP", sku_description="D",
                order_quantity=10, allocated_quantity=5, fulfillment_pct=50.0,
                source_warehouse_id="WH-1", source_warehouse_name="WH",
                source_available_before=10, source_remaining_after=5,
                lead_time_hours=0.0, hours_until_breach=48,
                outcome_status="partial_delay", action_type="on_hand",
            )
            db.add(alloc_a)
            db.flush()
            db.add(alloc_b)
            with pytest.raises(Exception):  # IntegrityError from unique constraint
                db.flush()
        finally:
            db.rollback()
            db.close()


# ===========================================================================
# 4. Split-order rules
# ===========================================================================

class TestSplitOrderRules:

    def test_split_order_strategy_respects_partial_allowed(self):
        """S5 split-order must allow partial fill for PARTIAL_ALLOWED orders."""
        from app.services.inventory_snapshot import InventorySlot
        pa = AllocationCandidate(
            order_id="ORD-SPLIT", customer_name="C", customer_tier="Standard",
            priority="P2", fulfillment_policy="PARTIAL_ALLOWED", sku="SKU-S",
            sku_description="S", order_quantity=80, hours_until_breach=60,
            order_value_usd=2000.0, primary_warehouse_id="WH-1",
        )
        slot = InventorySlot(
            inventory_id="INV-S", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-S", sku_description="S", category="Cat",
            on_hand_units=40, available_units=40, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="constrained",
        )
        ledger = PlanLedger()
        results = fairshare_allocate([pa], [slot], ledger, split_order_permitted=True)
        assert results[0].allocated_quantity > 0
        assert results[0].allocated_quantity <= 40

    def test_split_order_prohibited_for_full_only(self):
        """FULL_ONLY orders must not be partially filled when split_order_permitted=False."""
        from app.services.inventory_snapshot import InventorySlot
        fo = AllocationCandidate(
            order_id="ORD-FO", customer_name="C", customer_tier="Enterprise",
            priority="P1", fulfillment_policy="FULL_ONLY", sku="SKU-FO",
            sku_description="FO", order_quantity=80, hours_until_breach=72,
            order_value_usd=4000.0, primary_warehouse_id="WH-1",
        )
        slot = InventorySlot(
            inventory_id="INV-FO", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-FO", sku_description="FO", category="Cat",
            on_hand_units=40, available_units=40, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="constrained",
        )
        ledger = PlanLedger()
        results = fairshare_allocate([fo], [slot], ledger, split_order_permitted=False)
        assert results[0].allocated_quantity == 0


# ===========================================================================
# 5. Lead-time constraints / inbound timing
# ===========================================================================

class TestLeadTimeConstraints:

    def test_inbound_inventory_flagged_when_lead_time_too_short(self):
        """C4 constraint must fail when inbound arrives after the lead_time used."""
        from app.services.inventory_snapshot import InventorySlot
        sim_clock = datetime(2026, 10, 26, 18, 0, 0, tzinfo=timezone.utc)
        # Inbound arrives in 72h
        inbound_arrival = datetime(2026, 10, 29, 18, 0, 0, tzinfo=timezone.utc)

        slot = InventorySlot(
            inventory_id="INV-IB", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-IB", sku_description="IB", category="Cat",
            on_hand_units=100, available_units=100, reserved_units=0,
            inbound_units=50, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="healthy", inbound_arrives_at=inbound_arrival,
        )
        snapshot = {("WH-1", "SKU-IB"): slot}
        ledger = PlanLedger()

        # Alloc pretends inbound is used now (lead_time=0, but inbound arrives in 72h)
        alloc = AllocationResult(
            order_id="ORD-IB", customer_name="C", customer_tier="Enterprise",
            priority="P1", sku="SKU-IB", sku_description="IB",
            order_quantity=50, allocated_quantity=50, fulfillment_pct=100.0,
            source_warehouse_id="WH-1", source_warehouse_name="WH",
            source_available_before=100, source_remaining_after=50,
            lead_time_hours=0.0, hours_until_breach=48,
            outcome_status="protected_on_time", lateness_hours=0.0,
            penalty_avoidance_usd=0.0, action_type="inbound", notes="",
        )
        _, _, constraints = validate_plan([alloc], snapshot, ledger, 0.0, sim_clock)
        c4 = next(c for c in constraints if c["id"] == "C4_INBOUND_TIMING")
        assert not c4["passed"]

    def test_inbound_inventory_valid_when_lead_time_covers_arrival(self):
        """C4 passes when lead_time_hours >= inbound arrival delta."""
        from app.services.inventory_snapshot import InventorySlot
        sim_clock = datetime(2026, 10, 26, 18, 0, 0, tzinfo=timezone.utc)
        inbound_arrival = datetime(2026, 10, 29, 18, 0, 0, tzinfo=timezone.utc)

        slot = InventorySlot(
            inventory_id="INV-IB2", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-IB2", sku_description="IB2", category="Cat",
            on_hand_units=100, available_units=100, reserved_units=0,
            inbound_units=50, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="healthy", inbound_arrives_at=inbound_arrival,
        )
        snapshot = {("WH-1", "SKU-IB2"): slot}
        ledger = PlanLedger()

        alloc = AllocationResult(
            order_id="ORD-IB2", customer_name="C", customer_tier="Enterprise",
            priority="P1", sku="SKU-IB2", sku_description="IB2",
            order_quantity=50, allocated_quantity=50, fulfillment_pct=100.0,
            source_warehouse_id="WH-1", source_warehouse_name="WH",
            source_available_before=100, source_remaining_after=50,
            lead_time_hours=80.0,  # 80h > 72h inbound delta
            hours_until_breach=96,
            outcome_status="protected_on_time", lateness_hours=0.0,
            penalty_avoidance_usd=0.0, action_type="inbound", notes="",
        )
        _, _, constraints = validate_plan([alloc], snapshot, ledger, 0.0, sim_clock)
        c4 = next(c for c in constraints if c["id"] == "C4_INBOUND_TIMING")
        assert c4["passed"]


# ===========================================================================
# 6. Stale plan detection
# ===========================================================================

class TestStalePlanDetection:

    def test_execute_fails_when_inventory_has_been_reduced(self):
        """
        Simulate a plan, drain inventory manually, then attempt execution.
        Re-validation must catch the stale state.
        """
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=1)
            plans = create_plans(db, dis_id, "test_user", "analyst")
            assert len(plans) > 0

            # Find an on-hand plan with allocations
            on_hand = next(
                (p for p in plans if p["strategyType"] == "on_hand_priority"
                 and p["isFeasible"]),
                None,
            )
            if on_hand is None:
                pytest.skip("No feasible on-hand plan to test against")

            plan_id = on_hand["id"]

            # Submit → Approve
            submit_plan_for_approval(db, plan_id, "user", "director", "Stale test")
            approve_plan(db, plan_id, "manager", "director", "approved")

            # Drain ALL inventory for the allocated SKU across all warehouses
            all_inv = db.scalars(
                select(Inventory).where(Inventory.sku == "MCU-8800")
            ).all()
            for inv in all_inv:
                inv.available_units = 0
            db.commit()

            # Execution must fail
            with pytest.raises(ExecutionError) as exc:
                execute_plan(db, plan_id, "user", "director", f"KEY-STALE-{uuid.uuid4().hex}")

            assert "stale" in exc.value.reason.lower() or "REVALIDATION_FAILED" in exc.value.code

        finally:
            db.close()


# ===========================================================================
# 7. Plan lifecycle
# ===========================================================================

class TestPlanLifecycle:

    def test_full_lifecycle_proposed_to_executed(self):
        """A plan must go through proposed → simulated → submitted → approved → executed."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=2)
            plans = create_plans(db, dis_id, "user", "analyst")
            assert len(plans) >= 1

            # Use the on-hand plan (lowest cost, most likely feasible)
            plan = next(
                (p for p in plans if p["strategyType"] == "on_hand_priority"),
                plans[0],
            )
            plan_id = plan["id"]

            # Simulate
            simulated = simulate_plan(db, plan_id, "user", "analyst")
            assert simulated["status"] == "simulated"

            # Submit
            result = submit_plan_for_approval(db, plan_id, "user", "analyst", "Production critical path")
            assert result["status"] == "submitted"

            # Approve
            result = approve_plan(db, plan_id, "director", "director", "Approved for execution")
            assert result["status"] == "approved"

            # Execute
            key = f"EXEC-KEY-{uuid.uuid4().hex}"
            result = execute_plan(db, plan_id, "director", "director", key)
            assert result["status"] == "executed"
            assert result["idempotent"] is False

        finally:
            db.close()

    def test_cannot_execute_without_approval(self):
        """Executing a proposed (not approved) plan must be rejected."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=1)
            plans = create_plans(db, dis_id, "user", "analyst")
            plan_id = plans[0]["id"]

            with pytest.raises(ExecutionError) as exc:
                execute_plan(db, plan_id, "user", "analyst", f"KEY-{uuid.uuid4().hex}")

            assert exc.value.code == "INVALID_STATUS"
        finally:
            db.close()


# ===========================================================================
# 8. Idempotent execution
# ===========================================================================

class TestIdempotentExecution:

    def test_same_idempotency_key_safe_to_replay(self):
        """Re-submitting the same idempotency_key must return the original result."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=1)
            plans = create_plans(db, dis_id, "user", "analyst")
            plan_id = plans[0]["id"]

            submit_plan_for_approval(db, plan_id, "user", "analyst", "Idempotency test")
            approve_plan(db, plan_id, "director", "director")

            key = f"IDEM-KEY-{uuid.uuid4().hex}"
            result1 = execute_plan(db, plan_id, "director", "director", key)
            assert result1["idempotent"] is False
            assert result1["status"] == "executed"

            # Replay — must not double-execute
            result2 = execute_plan(db, plan_id, "director", "director", key)
            assert result2["idempotent"] is True

        finally:
            db.close()


# ===========================================================================
# 9. Plan creation: 6 strategies with unique IDs
# ===========================================================================

class TestPlanCreation:

    def test_six_distinct_strategies_generated(self):
        """generate_candidates must return 6 plans with unique IDs and strategy types."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=3)
            plans = generate_candidates(db, dis_id)
            assert len(plans) == 6

            ids = [p["id"] for p in plans]
            assert len(set(ids)) == 6, "All plan IDs must be unique"

            strategies = {p["strategyType"] for p in plans}
            expected = {
                "on_hand_priority", "interhub_transfer", "air_expedite",
                "alt_supplier", "split_order", "dual_source",
            }
            assert strategies == expected

        finally:
            db.close()

    def test_each_plan_has_required_fields(self):
        """Every plan dict must carry all required fields."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=1)
            plans = generate_candidates(db, dis_id)
            required = {
                "id", "disruptionId", "name", "strategyType", "status",
                "estimatedCostUSD", "isFeasible", "feasibilityReason",
                "assumptions", "constraints", "orderAllocations", "actions",
            }
            for plan in plans:
                missing = required - plan.keys()
                assert not missing, f"Plan {plan.get('id')} missing fields: {missing}"

        finally:
            db.close()


# ===========================================================================
# 10. Feasibility: infeasible plans carry machine-readable reasons
# ===========================================================================

class TestFeasibilityValidation:

    def test_over_draw_fails_c2_constraint(self):
        """Allocating more than available_units must fail C2."""
        from app.services.inventory_snapshot import InventorySlot
        sim_clock = datetime(2026, 10, 26, 18, 0, 0, tzinfo=timezone.utc)
        slot = InventorySlot(
            inventory_id="INV-OD", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-OD", sku_description="OD", category="Cat",
            on_hand_units=10, available_units=10, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="healthy",
        )
        snapshot = {("WH-1", "SKU-OD"): slot}
        ledger = PlanLedger()

        # Manually create an over-drawn allocation (bypassing ledger)
        alloc = AllocationResult(
            order_id="ORD-OD", customer_name="C", customer_tier="E",
            priority="P1", sku="SKU-OD", sku_description="OD",
            order_quantity=50, allocated_quantity=50, fulfillment_pct=100.0,
            source_warehouse_id="WH-1", source_warehouse_name="WH",
            source_available_before=10, source_remaining_after=-40,
            lead_time_hours=0.0, hours_until_breach=48,
            outcome_status="protected_on_time", lateness_hours=0.0,
            penalty_avoidance_usd=0.0, action_type="on_hand", notes="",
        )
        is_feas, reason, constraints = validate_plan([alloc], snapshot, ledger, 0.0, sim_clock)
        c2 = next(c for c in constraints if c["id"] == "C2_NO_DOUBLE_ALLOCATION")
        assert not c2["passed"]
        assert not is_feas

    def test_inactive_supplier_fails_c5_constraint(self):
        """Using an inactive supplier for alt-source must fail C5."""
        from app.services.inventory_snapshot import InventorySlot
        sim_clock = datetime(2026, 10, 26, 18, 0, 0, tzinfo=timezone.utc)
        slot = InventorySlot(
            inventory_id="INV-AS", warehouse_id="WH-1", warehouse_name="WH",
            sku="SKU-AS", sku_description="AS", category="Cat",
            on_hand_units=100, available_units=100, reserved_units=0,
            inbound_units=0, safety_stock_threshold=0, unit_cost_usd=10.0,
            status="healthy",
        )
        snapshot = {("WH-1", "SKU-AS"): slot}
        ledger = PlanLedger()

        alloc = AllocationResult(
            order_id="ORD-AS", customer_name="C", customer_tier="E",
            priority="P1", sku="SKU-AS", sku_description="AS",
            order_quantity=20, allocated_quantity=20, fulfillment_pct=100.0,
            source_warehouse_id="WH-1", source_warehouse_name="WH",
            source_available_before=100, source_remaining_after=80,
            lead_time_hours=24.0, hours_until_breach=48,
            outcome_status="protected_on_time", lateness_hours=0.0,
            penalty_avoidance_usd=0.0, action_type="alt_supplier",
            notes="supplier:SUP-INACTIVE",
        )
        supplier_status_map = {"SUP-INACTIVE": "suspended"}
        is_feas, reason, constraints = validate_plan(
            [alloc], snapshot, ledger, 0.0, sim_clock,
            supplier_status_map=supplier_status_map,
        )
        c5 = next(c for c in constraints if c["id"] == "C5_SUPPLIER_ELIGIBILITY")
        assert not c5["passed"]


# ===========================================================================
# 11. Plan comparison ranked by protection rate then cost
# ===========================================================================

class TestPlanComparison:

    def test_compare_returns_ranked_feasible_plans(self):
        """compare_plans must rank feasible plans by protection rate desc, then cost asc."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=2)
            create_plans(db, dis_id, "user", "analyst")

            result = compare_plans(db, dis_id)
            assert "feasiblePlanCount" in result
            assert "comparisonMetrics" in result
            assert "recommendedPlanId" in result

            metrics = result["comparisonMetrics"]
            if len(metrics) >= 2:
                for i in range(len(metrics) - 1):
                    a, b = metrics[i], metrics[i + 1]
                    assert (
                        a["protectionRatePercent"] > b["protectionRatePercent"]
                        or (
                            a["protectionRatePercent"] == b["protectionRatePercent"]
                            and a["estimatedCostUSD"] <= b["estimatedCostUSD"]
                        )
                    )

        finally:
            db.close()


# ===========================================================================
# 12. Audit trail
# ===========================================================================

class TestAuditTrail:

    def test_plan_created_audit_events_written(self):
        """create_plans must write one audit event per plan."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=1)
            plans = create_plans(db, dis_id, "test_actor", "analyst")
            events = db.scalars(
                select(PlanAuditEvent).where(PlanAuditEvent.disruption_id == dis_id)
            ).all()
            created_events = [e for e in events if e.action == "plan_created"]
            assert len(created_events) == len(plans)

        finally:
            db.close()

    def test_simulate_and_lifecycle_audit_events_written(self):
        """Each lifecycle transition must produce an audit event."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=1)
            plans = create_plans(db, dis_id, "user", "analyst")
            plan_id = plans[0]["id"]

            simulate_plan(db, plan_id, "user", "analyst")
            submit_plan_for_approval(db, plan_id, "user", "analyst", "Audit test justification")
            approve_plan(db, plan_id, "director", "director", "LGTM")

            events = db.scalars(
                select(PlanAuditEvent).where(PlanAuditEvent.plan_id == plan_id)
                .order_by(PlanAuditEvent.occurred_at.asc())
            ).all()
            actions = [e.action for e in events]
            assert "plan_created" in actions
            assert "plan_simulated" in actions
            assert "plan_submitted" in actions
            assert "plan_approved" in actions

        finally:
            db.close()


# ===========================================================================
# 13. Alt-supplier eligibility
# ===========================================================================
# (Covered by TestFeasibilityValidation.test_inactive_supplier_fails_c5_constraint)


# ===========================================================================
# 14. Determinism (no LLM)
# ===========================================================================

class TestDeterminism:

    def test_same_inputs_produce_identical_plans(self):
        """Calling generate_candidates twice with the same inputs must produce identical metrics."""
        db = _get_db()
        try:
            dis_id = _disruption_with_orders(db, n_orders=2)
            # Call once, read metrics
            plans1 = generate_candidates(db, dis_id)
            # Call again (DB unchanged)
            plans2 = generate_candidates(db, dis_id)

            # Strategies are the same
            strats1 = {p["strategyType"]: p["protectionRatePercent"] for p in plans1}
            strats2 = {p["strategyType"]: p["protectionRatePercent"] for p in plans2}
            assert strats1 == strats2

        finally:
            db.close()


# ===========================================================================
# 15. API smoke tests
# ===========================================================================

class TestAPIEndpoints:
    """Smoke tests for the documented Recovery Arena REST endpoints."""

    client = TestClient(app)

    def _get_disruption_id(self) -> str:
        """Use the first disruption from the webhook flow."""
        event = {
            "eventId": f"smoke-{uuid.uuid4().hex}",
            "trackingNumber": "MSKU-781920-4",
            "eventType": "delay_reported",
            "occurredAt": "2026-10-26T20:00:00Z",
            "status": "delayed",
            "estimatedDeliveryDate": "2026-10-28T06:00:00Z",
            "location": "Rotterdam outer anchorage",
            "reason": "Berth hold",
        }
        resp = self.client.post("/api/v1/webhooks/carrier", json=event)
        assert resp.status_code == 202
        disruption_ids = resp.json().get("disruptionIds", [])
        if disruption_ids:
            return disruption_ids[0]
        # Fallback: find any active disruption
        disruptions = self.client.get("/api/v1/disruptions").json()
        return disruptions[0]["id"] if disruptions else ""

    def test_create_plans_endpoint(self):
        dis_id = self._get_disruption_id()
        if not dis_id:
            pytest.skip("No disruption available")
        resp = self.client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers={"X-Actor-Id": "smoke_user", "X-Actor-Role": "analyst"},
        )
        assert resp.status_code == 201
        plans = resp.json()
        assert len(plans) > 0
        assert all("id" in p for p in plans)

    def test_list_plans_endpoint(self):
        dis_id = self._get_disruption_id()
        if not dis_id:
            pytest.skip("No disruption available")
        self.client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers={"X-Actor-Id": "smoke_user", "X-Actor-Role": "analyst"},
        )
        resp = self.client.get(f"/api/v1/recovery/{dis_id}/plans")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_plan_not_found(self):
        resp = self.client.get("/api/v1/recovery/plans/PLAN-NONEXISTENT")
        assert resp.status_code == 404

    def test_simulate_plan_endpoint(self):
        dis_id = self._get_disruption_id()
        if not dis_id:
            pytest.skip("No disruption available")
        plans_resp = self.client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers={"X-Actor-Id": "smoke_user", "X-Actor-Role": "analyst"},
        )
        plans = plans_resp.json()
        if not plans:
            pytest.skip("No plans generated")
        plan_id = plans[0]["id"]
        resp = self.client.post(
            f"/api/v1/recovery/plans/{plan_id}/simulate",
            headers={"X-Actor-Id": "smoke_user", "X-Actor-Role": "analyst"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "simulated"

    def test_compare_plans_endpoint(self):
        dis_id = self._get_disruption_id()
        if not dis_id:
            pytest.skip("No disruption available")
        self.client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers={"X-Actor-Id": "smoke_user", "X-Actor-Role": "analyst"},
        )
        resp = self.client.get(f"/api/v1/recovery/{dis_id}/compare")
        assert resp.status_code == 200
        body = resp.json()
        assert "feasiblePlanCount" in body
        assert "recommendedPlanId" in body

    def test_audit_trail_endpoint(self):
        dis_id = self._get_disruption_id()
        if not dis_id:
            pytest.skip("No disruption available")
        self.client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers={"X-Actor-Id": "smoke_user", "X-Actor-Role": "analyst"},
        )
        resp = self.client.get(f"/api/v1/recovery/{dis_id}/audit")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_full_submit_approve_execute_via_api(self):
        """End-to-end API flow: create → simulate → submit → approve → execute."""
        dis_id = self._get_disruption_id()
        if not dis_id:
            pytest.skip("No disruption available")

        plans = self.client.post(
            "/api/v1/recovery/plans",
            json={"disruptionId": dis_id},
            headers={"X-Actor-Id": "api_user", "X-Actor-Role": "analyst"},
        ).json()
        if not plans:
            pytest.skip("No plans generated")

        plan_id = plans[0]["id"]

        # Simulate
        self.client.post(
            f"/api/v1/recovery/plans/{plan_id}/simulate",
            headers={"X-Actor-Id": "api_user", "X-Actor-Role": "analyst"},
        )

        # Submit
        r = self.client.post(
            f"/api/v1/recovery/plans/{plan_id}/submit",
            json={"justification": "Emergency recovery needed for P1 orders"},
            headers={"X-Actor-Id": "api_user", "X-Actor-Role": "analyst"},
        )
        assert r.status_code == 200

        # Approve
        r = self.client.post(
            f"/api/v1/recovery/plans/{plan_id}/approve",
            json={"comments": "Approved — within budget"},
            headers={"X-Actor-Id": "api_director", "X-Actor-Role": "director"},
        )
        assert r.status_code == 200

        # Execute
        key = f"API-EXEC-{uuid.uuid4().hex}"
        r = self.client.post(
            f"/api/v1/recovery/plans/{plan_id}/execute",
            json={"idempotencyKey": key},
            headers={"X-Actor-Id": "api_director", "X-Actor-Role": "director"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "executed"
