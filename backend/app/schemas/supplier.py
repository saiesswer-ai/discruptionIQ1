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


class SupplierIssueCreate(BaseModel):
    supplierId: str
    issueType: str  # quality_hold, capacity_reduction, raw_material_shortage, facility_outage, lead_time_increase
    title: str
    description: str
    severity: str = "medium"  # critical, high, medium, low
    estimatedDelayDays: int = 0
    reason: str = "Manual supplier issue report"
