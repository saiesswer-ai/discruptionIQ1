"""Pydantic schemas for Warehouse Inventory."""
from pydantic import BaseModel


class WarehouseInventory(BaseModel):
    id: str
    warehouseId: str
    warehouseName: str
    warehouseLocation: str
    sku: str
    skuDescription: str
    category: str
    onHandUnits: int | None = None
    availableUnits: int
    reservedUnits: int
    inboundUnits: int
    safetyStockThreshold: int
    status: str  # healthy, constrained, depleted, critical
    unitCostUSD: float
    lastAuditedAt: str
