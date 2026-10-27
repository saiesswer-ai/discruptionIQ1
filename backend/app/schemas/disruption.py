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
