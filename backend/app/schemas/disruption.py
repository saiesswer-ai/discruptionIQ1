"""Pydantic schemas for Disruption entities."""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class DisruptionTimelineEvent(BaseModel):
    id: str
    timestamp: str
    title: str
    description: str
    source: str


class Disruption(BaseModel):
    id: str
    title: str
    type: str  # carrier_delay, supplier_outage, port_congestion, customs_hold, warehouse_freeze
    typeLabel: str
    severity: str  # critical, high, medium, low
    status: str  # active, evaluating, mitigating, resolved
    detectedAt: str
    location: str
    carrierOrSupplier: str
    delayHours: int
    affectedOrderCount: int
    affectedSKUs: List[str]
    estimatedFinancialImpactUSD: float
    summary: str
    rootCause: str
    eventPayload: Dict[str, Any] = {}
    timeline: List[DisruptionTimelineEvent] = []
    linkedShipmentIds: List[str] = []
    linkedWarehouseIds: List[str] = []


class DisruptionCreate(BaseModel):
    type: str  # carrier_delay, supplier_delay, supplier_outage, inventory_shortage, port_congestion, customs_hold, warehouse_freeze, weather_disruption, labor_strike
    title: str
    severity: str  # critical, high, medium, low
    status: str = "active"  # active, evaluating, mitigating, resolved
    detectedAt: Optional[str] = None
    location: str
    carrierOrSupplier: Optional[str] = ""
    delayHours: int = 0
    summary: str
    rootCause: Optional[str] = "Manual operational report"
    source: Optional[str] = "Manual Operations Report"
    affectedShipmentId: Optional[str] = None
    affectedSupplierId: Optional[str] = None
    affectedWarehouseId: Optional[str] = None
    affectedOrderIds: Optional[List[str]] = None
    affectedSKUs: Optional[List[str]] = None
    estimatedFinancialImpactUSD: Optional[float] = 0.0
    evidence: Optional[List[Dict[str, Any]]] = None
    reason: Optional[str] = "Manual operational disruption report"
    idempotencyKey: Optional[str] = None


class DisruptionUpdate(BaseModel):
    status: Optional[str] = None
    severity: Optional[str] = None
    delayHours: Optional[int] = None
    title: Optional[str] = None
    summary: Optional[str] = None
    estimatedFinancialImpactUSD: Optional[float] = None
    newEvidence: Optional[Dict[str, Any]] = None
    newTimelineEvent: Optional[Dict[str, Any]] = None
    reason: str = "Disruption status/evidence update"
