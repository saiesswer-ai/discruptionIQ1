"""Pydantic schemas for Warehouse, Inventory, Transfers, Products, and Companies."""
from pydantic import BaseModel, Field


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
    isDemo: bool = False


class InventoryAdjustmentRequest(BaseModel):
    warehouseId: str
    sku: str
    adjustmentType: str = "manual_adjustment"  # cycle_count, receipt, write_off, manual_adjustment
    quantityDelta: int | None = None  # e.g. +10, -5
    newOnHandUnits: int | None = None  # Or specify exact new on_hand count
    reason: str
    reference: str | None = None


class InventoryCreateRequest(BaseModel):
    warehouseId: str
    sku: str
    onHandUnits: int = Field(ge=0)
    safetyStockThreshold: int = Field(ge=0)
    reason: str = "Initial stock allocation"
    reference: str | None = None


class StockReceiptRequest(BaseModel):
    warehouseId: str
    sku: str
    quantity: int = Field(gt=0)
    supplierId: str | None = None
    shipmentTrackingNumber: str | None = None
    purchaseOrderNumber: str | None = None
    reason: str = "PO dock receipt"


class StockMovementRequest(BaseModel):
    fromWarehouseId: str
    toWarehouseId: str
    sku: str
    quantity: int  # must be > 0
    reason: str
    reference: str | None = None


class CompanySchema(BaseModel):
    id: str
    name: str
    code: str
    registrationNumber: str
    headquarters: str
    country: str
    contactEmail: str
    isDemo: bool
    status: str
    createdAt: str
    warehouseCount: int = 0
    totalCapacitySqm: int = 0


class WarehouseSchema(BaseModel):
    id: str
    name: str
    location: str
    city: str
    country: str
    totalCapacitySqm: int
    availableDockDoors: int
    status: str
    companyId: str | None = None
    companyName: str | None = None
    isDemo: bool = False
    managerName: str | None = None
    contactEmail: str | None = None
    maxPalletCapacity: int | None = 10000
    currentUtilizationPct: float | None = 0.0
    activeInventoryCount: int = 0
    totalUnitsOnHand: int = 0
    shortageCount: int = 0
    incomingShipmentsCount: int = 0
    outgoingOrdersCount: int = 0


class WarehouseCreatePayload(BaseModel):
    id: str | None = None
    name: str
    location: str
    city: str
    country: str
    totalCapacitySqm: int = Field(gt=0)
    availableDockDoors: int = Field(ge=0)
    status: str = "active"
    companyId: str | None = None
    managerName: str | None = None
    contactEmail: str | None = None
    maxPalletCapacity: int | None = 10000
    isDemo: bool = True


class WarehouseUpdatePayload(BaseModel):
    name: str | None = None
    location: str | None = None
    city: str | None = None
    country: str | None = None
    totalCapacitySqm: int | None = None
    availableDockDoors: int | None = None
    status: str | None = None
    managerName: str | None = None
    contactEmail: str | None = None
    maxPalletCapacity: int | None = None


class ProductSchema(BaseModel):
    sku: str
    name: str
    description: str
    category: str
    unitCostUSD: float
    weightKg: float = 1.0
    isDemo: bool = True
    status: str = "active"


class ProductCreatePayload(BaseModel):
    sku: str
    name: str
    description: str
    category: str
    unitCostUSD: float = Field(gt=0)
    weightKg: float = 1.0
    isDemo: bool = True


class TransferRequestPayload(BaseModel):
    sourceWarehouseId: str
    destinationWarehouseId: str
    sku: str
    quantity: int = Field(gt=0)
    reason: str
    expectedArrival: str | None = None
    authorizationCode: str | None = None
    trackingReference: str | None = None
    notes: str | None = None


class TransferApprovalPayload(BaseModel):
    comments: str | None = None


class TransferActionPayload(BaseModel):
    reason: str | None = None
    notes: str | None = None


class WarehouseTransferSchema(BaseModel):
    id: str
    sourceWarehouseId: str
    sourceWarehouseName: str
    destinationWarehouseId: str
    destinationWarehouseName: str
    sku: str
    skuDescription: str
    category: str
    quantity: int
    status: str  # REQUESTED, APPROVED, IN_TRANSIT, RECEIVED, CANCELLED
    reason: str
    requestedBy: str
    requestedAt: str
    approvedBy: str | None = None
    approvedAt: str | None = None
    dispatchedBy: str | None = None
    dispatchedAt: str | None = None
    receivedBy: str | None = None
    receivedAt: str | None = None
    cancelledBy: str | None = None
    cancelledAt: str | None = None
    cancellationReason: str | None = None
    expectedArrival: str | None = None
    trackingReference: str | None = None
    authorizationCode: str | None = None
    notes: str | None = None
    isDemo: bool = True


class StockMovementSchema(BaseModel):
    id: str
    timestamp: str
    movementType: str  # RECEIPT, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT_UP, ADJUSTMENT_DOWN, DISPATCH
    warehouseId: str
    warehouseName: str
    sku: str
    skuDescription: str
    quantity: int
    balanceBefore: int
    balanceAfter: int
    referenceType: str
    referenceId: str | None = None
    actorId: str
    notes: str | None = None
    isDemo: bool = True


class ShortageAnalysisItem(BaseModel):
    warehouseId: str
    warehouseName: str
    sku: str
    skuDescription: str
    onHandUnits: int
    availableUnits: int
    reservedUnits: int
    safetyStockThreshold: int
    unitsBelowSafety: int
    status: str  # critical, depleted, constrained
    affectedOrdersCount: int
    pendingInboundUnits: int
    recommendedAction: str
