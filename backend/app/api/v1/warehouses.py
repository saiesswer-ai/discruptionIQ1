"""API Router for Warehouses, Companies, Products, and Stock Transfers."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.permissions import Permission, role_has_permission
from app.models.auth import User, UserRole
from app.schemas.inventory import (
    CompanySchema,
    InventoryCreateRequest,
    ProductCreatePayload,
    ProductSchema,
    ShortageAnalysisItem,
    StockMovementSchema,
    StockReceiptRequest,
    TransferActionPayload,
    TransferApprovalPayload,
    TransferRequestPayload,
    WarehouseCreatePayload,
    WarehouseInventory,
    WarehouseSchema,
    WarehouseTransferSchema,
    WarehouseUpdatePayload,
)
from app.services.warehouse_service import (
    approve_transfer,
    cancel_transfer,
    create_inventory_record,
    create_product,
    create_warehouse,
    dispatch_transfer,
    get_company_detail,
    get_shortage_analysis,
    get_stock_movements,
    get_transfer_detail,
    get_warehouse_detail,
    list_companies,
    list_products,
    list_transfers,
    list_warehouses,
    receive_transfer,
    record_stock_receipt,
    request_transfer,
    update_warehouse,
)

warehouses_router = APIRouter()
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _check_perm(user: User, perm: Permission) -> None:
    if not role_has_permission(user.role, perm):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": f"Role '{user.role}' lacks permission '{perm.value}'"},
        )


def _check_warehouse_operator_access(user: User, warehouse_id: str, action_desc: str) -> None:
    """Enforce facility isolation for warehouse operators when assigned to a specific facility."""
    if user.role == UserRole.WAREHOUSE_OPERATOR.value and getattr(user, "assigned_warehouse_id", None):
        if user.assigned_warehouse_id != warehouse_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "WAREHOUSE_ACCESS_DENIED",
                    "message": f"Warehouse operator '{user.username}' is restricted to assigned facility '{user.assigned_warehouse_id}' and cannot {action_desc} at '{warehouse_id}'.",
                },
            )


# ---------------------------------------------------------------------------
# Companies
# ---------------------------------------------------------------------------

@warehouses_router.get("/companies", response_model=list[CompanySchema], tags=["Companies"])
def get_companies(db: DbSession, current_user: CurrentUser) -> list[CompanySchema]:
    _check_perm(current_user, Permission.WAREHOUSES_READ)
    return list_companies(db)


@warehouses_router.get("/companies/{company_id}", tags=["Companies"])
def get_company(company_id: str, db: DbSession, current_user: CurrentUser) -> dict:
    _check_perm(current_user, Permission.WAREHOUSES_READ)
    return get_company_detail(db, company_id)


# ---------------------------------------------------------------------------
# Warehouses
# ---------------------------------------------------------------------------

@warehouses_router.get("/warehouses", response_model=list[WarehouseSchema], tags=["Warehouses"])
def get_warehouses(
    db: DbSession,
    current_user: CurrentUser,
    company_id: str | None = Query(default=None),
) -> list[WarehouseSchema]:
    _check_perm(current_user, Permission.WAREHOUSES_READ)
    return list_warehouses(db, company_id)


@warehouses_router.get("/warehouses/{warehouse_id}", tags=["Warehouses"])
def get_warehouse(warehouse_id: str, db: DbSession, current_user: CurrentUser) -> dict:
    _check_perm(current_user, Permission.WAREHOUSES_READ)
    return get_warehouse_detail(db, warehouse_id)


@warehouses_router.post("/warehouses", response_model=WarehouseSchema, status_code=status.HTTP_201_CREATED, tags=["Warehouses"])
def post_create_warehouse(
    payload: WarehouseCreatePayload,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseSchema:
    _check_perm(current_user, Permission.WAREHOUSES_WRITE)
    return create_warehouse(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


@warehouses_router.patch("/warehouses/{warehouse_id}", response_model=WarehouseSchema, tags=["Warehouses"])
def patch_update_warehouse(
    warehouse_id: str,
    payload: WarehouseUpdatePayload,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseSchema:
    _check_perm(current_user, Permission.WAREHOUSES_WRITE)
    return update_warehouse(
        db,
        warehouse_id=warehouse_id,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


@warehouses_router.get("/warehouses/{warehouse_id}/transfers", response_model=list[WarehouseTransferSchema], tags=["Warehouses"])
def get_warehouse_transfers(
    warehouse_id: str,
    db: DbSession,
    current_user: CurrentUser,
) -> list[WarehouseTransferSchema]:
    _check_perm(current_user, Permission.TRANSFERS_READ)
    return list_transfers(db, warehouse_id=warehouse_id)


@warehouses_router.get("/warehouses/{warehouse_id}/shortages", response_model=list[ShortageAnalysisItem], tags=["Warehouses"])
def get_warehouse_shortages(
    warehouse_id: str,
    db: DbSession,
    current_user: CurrentUser,
) -> list[ShortageAnalysisItem]:
    _check_perm(current_user, Permission.INVENTORY_READ)
    return get_shortage_analysis(db, warehouse_id=warehouse_id)


# ---------------------------------------------------------------------------
# Products / SKUs
# ---------------------------------------------------------------------------

@warehouses_router.get("/products", response_model=list[ProductSchema], tags=["Products"])
def get_products(db: DbSession, current_user: CurrentUser) -> list[ProductSchema]:
    _check_perm(current_user, Permission.INVENTORY_READ)
    return list_products(db)


@warehouses_router.post("/products", response_model=ProductSchema, status_code=status.HTTP_201_CREATED, tags=["Products"])
def post_create_product(
    payload: ProductCreatePayload,
    db: DbSession,
    current_user: CurrentUser,
) -> ProductSchema:
    _check_perm(current_user, Permission.PRODUCTS_WRITE)
    return create_product(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


# ---------------------------------------------------------------------------
# Inventory Additions & Direct Dock Receipts
# ---------------------------------------------------------------------------

@warehouses_router.post("/inventory", response_model=WarehouseInventory, status_code=status.HTTP_201_CREATED, tags=["Inventory"])
def post_create_inventory_slot(
    payload: InventoryCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseInventory:
    _check_perm(current_user, Permission.INVENTORY_WRITE)
    _check_warehouse_operator_access(current_user, payload.warehouseId, "create inventory records")
    return create_inventory_record(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


@warehouses_router.post("/inventory/receipt", response_model=WarehouseInventory, tags=["Inventory"])
def post_record_stock_receipt(
    payload: StockReceiptRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseInventory:
    _check_perm(current_user, Permission.INVENTORY_WRITE)
    _check_warehouse_operator_access(current_user, payload.warehouseId, "receive stock")
    return record_stock_receipt(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


@warehouses_router.get("/inventory/shortages", response_model=list[ShortageAnalysisItem], tags=["Inventory"])
def get_all_shortages(db: DbSession, current_user: CurrentUser) -> list[ShortageAnalysisItem]:
    _check_perm(current_user, Permission.INVENTORY_READ)
    return get_shortage_analysis(db)


@warehouses_router.get("/inventory/movements", response_model=list[StockMovementSchema], tags=["Inventory"])
def get_all_movements(
    db: DbSession,
    current_user: CurrentUser,
    warehouse_id: str | None = Query(default=None),
    sku: str | None = Query(default=None),
) -> list[StockMovementSchema]:
    _check_perm(current_user, Permission.INVENTORY_READ)
    return get_stock_movements(db, warehouse_id=warehouse_id, sku=sku)


# ---------------------------------------------------------------------------
# Stock Transfer Workflow Lifecycle (PART D)
# ---------------------------------------------------------------------------

@warehouses_router.get("/inventory/transfers", response_model=list[WarehouseTransferSchema], tags=["Transfers"])
def get_all_transfers(
    db: DbSession,
    current_user: CurrentUser,
    warehouse_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> list[WarehouseTransferSchema]:
    _check_perm(current_user, Permission.TRANSFERS_READ)
    return list_transfers(db, warehouse_id=warehouse_id, status=status)


@warehouses_router.get("/inventory/transfers/{transfer_id}", response_model=WarehouseTransferSchema, tags=["Transfers"])
def get_transfer(transfer_id: str, db: DbSession, current_user: CurrentUser) -> WarehouseTransferSchema:
    _check_perm(current_user, Permission.TRANSFERS_READ)
    return get_transfer_detail(db, transfer_id=transfer_id)


@warehouses_router.post("/inventory/transfers/request", response_model=WarehouseTransferSchema, status_code=status.HTTP_201_CREATED, tags=["Transfers"])
def post_request_transfer(
    payload: TransferRequestPayload,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseTransferSchema:
    """Request a persistent inter-warehouse stock transfer in REQUESTED status."""
    _check_perm(current_user, Permission.TRANSFERS_REQUEST)
    _check_warehouse_operator_access(current_user, payload.sourceWarehouseId, "request outbound transfers")
    return request_transfer(
        db,
        payload=payload,
        actor_id=current_user.username,
        actor_role=current_user.role,
    )


@warehouses_router.post("/inventory/transfers/{transfer_id}/approve", response_model=WarehouseTransferSchema, tags=["Transfers"])
def post_approve_transfer(
    transfer_id: str,
    payload: TransferApprovalPayload,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseTransferSchema:
    """Authorize a transfer request. Transition: REQUESTED -> APPROVED."""
    _check_perm(current_user, Permission.TRANSFERS_APPROVE)
    return approve_transfer(
        db,
        transfer_id=transfer_id,
        actor_id=current_user.username,
        actor_role=current_user.role,
        comments=payload.comments,
    )


@warehouses_router.post("/inventory/transfers/{transfer_id}/dispatch", response_model=WarehouseTransferSchema, tags=["Transfers"])
def post_dispatch_transfer(
    transfer_id: str,
    payload: TransferActionPayload,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseTransferSchema:
    """Dispatch stock for an approved transfer. Reserves source stock and marks inbound at destination."""
    _check_perm(current_user, Permission.TRANSFERS_DISPATCH)
    t = get_transfer_detail(db, transfer_id)
    _check_warehouse_operator_access(current_user, t.sourceWarehouseId, "dispatch transfers")
    return dispatch_transfer(
        db,
        transfer_id=transfer_id,
        actor_id=current_user.username,
        actor_role=current_user.role,
        tracking_reference=payload.notes,
    )


@warehouses_router.post("/inventory/transfers/{transfer_id}/receive", response_model=WarehouseTransferSchema, tags=["Transfers"])
def post_receive_transfer(
    transfer_id: str,
    payload: TransferActionPayload,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseTransferSchema:
    """Acknowledge stock delivery at destination. Updates on-hand balances and releases reservation."""
    _check_perm(current_user, Permission.TRANSFERS_RECEIVE)
    t = get_transfer_detail(db, transfer_id)
    _check_warehouse_operator_access(current_user, t.destinationWarehouseId, "receive transfers")
    return receive_transfer(
        db,
        transfer_id=transfer_id,
        actor_id=current_user.username,
        actor_role=current_user.role,
        notes=payload.notes,
    )


@warehouses_router.post("/inventory/transfers/{transfer_id}/cancel", response_model=WarehouseTransferSchema, tags=["Transfers"])
def post_cancel_transfer(
    transfer_id: str,
    payload: TransferActionPayload,
    db: DbSession,
    current_user: CurrentUser,
) -> WarehouseTransferSchema:
    """Cancel a pending transfer and release any held reservations."""
    _check_perm(current_user, Permission.TRANSFERS_REQUEST)
    return cancel_transfer(
        db,
        transfer_id=transfer_id,
        actor_id=current_user.username,
        actor_role=current_user.role,
        reason=payload.reason or "Transfer cancelled by operator",
    )
