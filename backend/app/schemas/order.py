"""Pydantic schemas for Order entities."""
from pydantic import BaseModel


class OrderAtRisk(BaseModel):
    id: str
    customerName: str
    customerTier: str  # Enterprise, Strategic, Standard
    sku: str
    skuDescription: str
    quantityUnits: int
    orderValueUSD: float
    promisedDeadline: str
    hoursUntilBreach: int
    priority: str  # P1, P2, P3
    riskScore: int  # 1-100
    riskLevel: str  # critical, high, medium, low
    primaryWarehouseId: str
    associatedDisruptionId: str
    fulfillmentPolicy: str | None = "FULL_ONLY"
    explanation: str
    mitigationStatus: str  # unmitigated, candidate_plan, approved, protected
