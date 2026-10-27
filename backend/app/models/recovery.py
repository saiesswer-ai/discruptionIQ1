"""
SQLAlchemy persistence models for the Recovery Arena engine.

Three tables:
  recovery_plans        — one row per candidate plan
  plan_allocations      — one row per order-line allocation within a plan
  plan_audit_events     — immutable append-only audit log
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RecoveryPlan(Base):
    """A candidate recovery plan for a single disruption.

    Status lifecycle:
      proposed  → simulated → submitted → approved | rejected → executed
    """

    __tablename__ = "recovery_plans"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    disruption_id: Mapped[str] = mapped_column(
        ForeignKey("disruptions.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(256))
    strategy_type: Mapped[str] = mapped_column(String(64))
    # proposed | simulated | submitted | approved | rejected | executed
    status: Mapped[str] = mapped_column(String(32), index=True, default="proposed")

    # Scenario snapshot (read from DB at generation time; never changes)
    scenario_clock: Mapped[str] = mapped_column(String(32))  # ISO timestamp
    assumptions_json: Mapped[str] = mapped_column(Text, default="[]")
    priority_weights_json: Mapped[str] = mapped_column(Text, default="{}")

    # Summary metrics (computed deterministically; refreshed on simulate)
    estimated_cost_usd: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    orders_protected_count: Mapped[int] = mapped_column(Integer, default=0)
    total_orders_count: Mapped[int] = mapped_column(Integer, default=0)
    expected_late_orders_count: Mapped[int] = mapped_column(Integer, default=0)
    protection_rate_pct: Mapped[float] = mapped_column(Numeric(6, 2), default=0.0)
    expected_lateness_hours: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    lateness_reduction_hours: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    units_allocated: Mapped[int] = mapped_column(Integer, default=0)
    carbon_emissions_tonnes: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0)

    # Feasibility
    feasibility_score: Mapped[float] = mapped_column(Numeric(5, 2), default=0.0)
    is_feasible: Mapped[int] = mapped_column(Integer, default=0)  # bool as 0/1
    feasibility_reason: Mapped[str] = mapped_column(Text, default="")
    failed_constraint: Mapped[str | None] = mapped_column(Text, nullable=True)
    infeasibility_risks_json: Mapped[str] = mapped_column(Text, default="[]")

    # Actions & constraints (serialised lists)
    actions_json: Mapped[str] = mapped_column(Text, default="[]")
    constraints_json: Mapped[str] = mapped_column(Text, default="[]")

    # Creation & Lifecycle tracking
    created_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    submitted_by: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Simulation details
    simulated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    simulated_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    simulation_details_json: Mapped[str] = mapped_column(Text, default="{}")

    # Approval / rejection / modification / execution
    approval_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    approval_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rejected_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    modification_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    executed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    execution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(
        String(128), unique=True, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class PlanAllocation(Base):
    """One fulfilled order-line allocation row within a RecoveryPlan.

    Each row is keyed (plan_id, order_id, sku) so the same SKU in different
    orders can appear multiple times but the same (order, SKU) cannot be
    double-allocated in the same plan.
    """

    __tablename__ = "plan_allocations"
    __table_args__ = (
        UniqueConstraint(
            "plan_id", "order_id", "sku",
            name="uq_plan_order_sku",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    plan_id: Mapped[str] = mapped_column(
        ForeignKey("recovery_plans.id"), index=True
    )
    order_id: Mapped[str] = mapped_column(
        ForeignKey("orders.order_id"), index=True
    )
    customer_name: Mapped[str] = mapped_column(String(128))
    customer_tier: Mapped[str] = mapped_column(String(32))
    order_priority: Mapped[str] = mapped_column(String(4))
    sku: Mapped[str] = mapped_column(String(32))
    sku_description: Mapped[str] = mapped_column(String(128))
    order_quantity: Mapped[int] = mapped_column(Integer)
    allocated_quantity: Mapped[int] = mapped_column(Integer)
    fulfillment_pct: Mapped[float] = mapped_column(Numeric(6, 2))

    source_warehouse_id: Mapped[str] = mapped_column(String(16))
    source_warehouse_name: Mapped[str] = mapped_column(String(128))
    # Inventory bookkeeping at simulation time (read-only snapshot)
    source_available_before: Mapped[int] = mapped_column(Integer)
    source_remaining_after: Mapped[int] = mapped_column(Integer)

    # Delivery timeline (hours)
    lead_time_hours: Mapped[float] = mapped_column(Numeric(8, 2))
    hours_until_breach: Mapped[int] = mapped_column(Integer)
    outcome_status: Mapped[str] = mapped_column(String(32))  # protected_on_time | partial_delay | late_breached
    lateness_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=0.0)
    penalty_avoidance_usd: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)

    # Which strategy supplied this unit
    action_type: Mapped[str] = mapped_column(String(32))  # on_hand | expedite | alt_supplier | transfer | inbound
    notes: Mapped[str] = mapped_column(Text, default="")


class PlanAuditEvent(Base):
    """Immutable audit log for every plan lifecycle transition.

    Actions: plan_created | plan_simulated | plan_submitted |
             plan_approved | plan_rejected | plan_executed
    """

    __tablename__ = "plan_audit_events"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    plan_id: Mapped[str] = mapped_column(
        ForeignKey("recovery_plans.id"), index=True
    )
    disruption_id: Mapped[str] = mapped_column(String(48), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    actor_id: Mapped[str] = mapped_column(String(128))
    actor_role: Mapped[str] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
