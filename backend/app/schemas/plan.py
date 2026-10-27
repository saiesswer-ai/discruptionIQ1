"""Pydantic schemas for Recovery Plans and simulation allocations."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class RecoveryActionItem(BaseModel):
    id: str
    actionType: str  # air_expedite, interhub_transfer, alternate_supplier, split_shipment, priority_pick
    description: str
    originHub: str
    destHub: str
    quantityUnits: int
    carrierOrVendor: str
    estimatedHours: float
    costUSD: float


class PlanOrderAllocation(BaseModel):
    orderId: str
    customerName: str
    customerTier: str
    sku: str
    orderQuantity: int
    allocatedQuantity: int
    fulfillmentPercent: float
    sourceWarehouseId: str
    sourceWarehouseName: str
    sourceAvailableBefore: int
    sourceRemainingAfter: int
    leadTimeHours: float
    hoursUntilBreach: int
    outcomeStatus: str  # protected_on_time, partial_delay, late_breached
    latenessHours: float
    penaltyAvoidanceUSD: float
    notes: str


class PlanConstraintItem(BaseModel):
    id: str
    name: str
    required: str
    actual: str
    passed: bool
    failureDetail: Optional[str] = None


class SimulationDetails(BaseModel):
    simulatedAt: str
    simulatedBy: str
    inventoryStressLevel: str  # low, moderate, high
    transitReliabilityConfidence: float
    slaSavesCount: int
    projectedPenaltyAvoidanceUSD: float
    netBenefitUSD: float


class RecoveryPlan(BaseModel):
    id: str
    disruptionId: str
    name: str
    strategyType: str  # Air Freight Expedite, Inter-Hub Cross-Dock, Dual-Source Reallocation, Split Batch Express
    status: str  # proposed, simulated, submitted, approved, rejected, executed
    estimatedCostUSD: float
    ordersProtectedCount: int
    totalOrdersCount: int
    expectedLateOrdersCount: int
    protectionRatePercent: float
    expectedLatenessHours: float
    latenessReductionHours: float
    unitsAllocated: int
    carbonEmissionsTonnes: float
    feasibilityScore: float
    isFeasible: bool
    feasibilityReason: str
    failedConstraint: Optional[str] = None
    infeasibilityRisks: List[str] = []
    assumptions: List[str] = []
    constraints: List[PlanConstraintItem] = []
    orderAllocations: List[PlanOrderAllocation] = []
    actions: List[RecoveryActionItem] = []
    simulationDetails: Optional[SimulationDetails] = None
    approvalId: Optional[str] = None
    approvalStatus: Optional[str] = None
    executionNotes: Optional[str] = None
