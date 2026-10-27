"""Pydantic schemas for Shipments."""
from typing import List, Optional
from pydantic import BaseModel


class Shipment(BaseModel):
    id: str
    trackingNumber: str
    carrierName: str
    transportMode: str  # Ocean, Air, Road, Rail
    origin: str
    destination: str
    status: str  # on_schedule, delayed, customs_hold, rerouted, delivered
    currentLocation: Optional[str] = None
    promisedDeliveryDate: str
    estimatedDeliveryDate: str
    delayHours: int
    supplierId: str
    supplierName: str
    cargoDescription: str
    affectedOrderIds: Optional[List[str]] = None
    affectedOrdersCount: int
