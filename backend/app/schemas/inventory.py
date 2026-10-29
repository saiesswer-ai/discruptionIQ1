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


class InventoryAdjustmentRequest(BaseModel):
    warehouseId: str
    sku: str
    adjustmentType: str = "manual_adjustment"  # cycle_count, receipt, write_off, manual_adjustment
    quantityDelta: int | None = None  # e.g. +10, -5
    newOnHandUnits: int | None = None  # Or specify exact new on_hand count
    reason: str
    reference: str | None = None


class StockMovementRequest(BaseModel):
    fromWarehouseId: str
    toWarehouseId: str
    sku: str
    quantity: int  # must be > 0
    reason: str
    reference: str | None = None
