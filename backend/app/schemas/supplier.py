"""Pydantic schemas for Suppliers."""
from pydantic import BaseModel


class Supplier(BaseModel):
    id: str
    name: str
    country: str
    category: str
    tier: str  # Tier 1, Tier 2
    reliabilityScore: int  # 0-100
    onTimeDeliveryRate: float
    averageLeadTimeDays: int
    delayIncidentsLast90d: int
    status: str  # preferred, conditional, restricted
    contactEmail: str
