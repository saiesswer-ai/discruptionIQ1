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


class OrderLineCreate(BaseModel):
    sku: str
    quantity: int
    unitPriceUSD: float
    skuDescription: str | None = None


class OrderCreate(BaseModel):
    customerName: str
    customerTier: str  # Enterprise, Strategic, Standard
    priority: str  # P1, P2, P3
    promisedDeadline: str  # ISO timestamp
    primaryWarehouseId: str
    fulfillmentPolicy: str = "FULL_ONLY"  # FULL_ONLY, PARTIAL_ALLOWED
    orderLines: list[OrderLineCreate]
    reason: str | None = "Manual order entry"


class OrderUpdate(BaseModel):
    priority: str | None = None  # P1, P2, P3
    promisedDeadline: str | None = None  # ISO timestamp
    customerTier: str | None = None
    fulfillmentPolicy: str | None = None
    mitigationStatus: str | None = None
    primaryWarehouseId: str | None = None
    reason: str = "Order attributes update"
