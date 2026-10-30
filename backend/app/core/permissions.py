"""Explicit permissions matrix and role-based access control definitions."""
from __future__ import annotations

from enum import Enum
from typing import Any

from app.models.auth import UserRole


class Permission(str, Enum):
    # Read-only resource views
    DASHBOARD_READ = "dashboard:read"
    DISRUPTIONS_READ = "disruptions:read"
    ORDERS_READ = "orders:read"
    INVENTORY_READ = "inventory:read"
    SHIPMENTS_READ = "shipments:read"
    SUPPLIERS_READ = "suppliers:read"
    APPROVALS_READ = "approvals:read"
    AUDIT_READ = "audit:read"
    WAREHOUSES_READ = "warehouses:read"
    TRANSFERS_READ = "transfers:read"

    # Recovery Plan lifecycle actions
    PLANS_CREATE = "plans:create"
    PLANS_READ = "plans:read"
    PLANS_SIMULATE = "plans:simulate"
    PLANS_SUBMIT = "plans:submit"
    PLANS_MODIFY = "plans:modify"
    PLANS_APPROVE_STANDARD = "plans:approve_standard"
    PLANS_APPROVE_PROCUREMENT = "plans:approve_procurement"
    PLANS_REJECT = "plans:reject"
    PLANS_EXECUTE = "plans:execute"

    # AI operations
    AI_ANALYZE = "ai:analyze"
    AI_ADVISE = "ai:advise"
    AI_REPORT = "ai:report"

    # Operational Manual Data Entry & Management
    DISRUPTIONS_WRITE = "disruptions:write"
    INVENTORY_WRITE = "inventory:write"
    SHIPMENTS_WRITE = "shipments:write"
    SUPPLIERS_WRITE = "suppliers:write"
    ORDERS_WRITE = "orders:write"
    WAREHOUSES_WRITE = "warehouses:write"
    PRODUCTS_WRITE = "products:write"

    # Stock Transfer Lifecycle Permissions
    TRANSFERS_REQUEST = "transfers:request"
    TRANSFERS_APPROVE = "transfers:approve"
    TRANSFERS_DISPATCH = "transfers:dispatch"
    TRANSFERS_RECEIVE = "transfers:receive"

    # Administrative
    ADMIN_ALL = "admin:all"


# Map legacy/display role aliases to canonical backend roles
ROLE_ALIASES: dict[str, str] = {
    "analyst": UserRole.OPERATIONS_ANALYST.value,
    "operations analyst": UserRole.OPERATIONS_ANALYST.value,
    "operations_analyst": UserRole.OPERATIONS_ANALYST.value,
    "logistics_mgr": UserRole.SUPPLY_CHAIN_MANAGER.value,
    "supply chain manager": UserRole.SUPPLY_CHAIN_MANAGER.value,
    "supply_chain_manager": UserRole.SUPPLY_CHAIN_MANAGER.value,
    "manager": UserRole.SUPPLY_CHAIN_MANAGER.value,
    "warehouse_lead": UserRole.WAREHOUSE_OPERATOR.value,
    "warehouse operator": UserRole.WAREHOUSE_OPERATOR.value,
    "warehouse_operator": UserRole.WAREHOUSE_OPERATOR.value,
    "warehouse": UserRole.WAREHOUSE_OPERATOR.value,
    "director": UserRole.PROCUREMENT_APPROVER.value,
    "procurement approver": UserRole.PROCUREMENT_APPROVER.value,
    "procurement_approver": UserRole.PROCUREMENT_APPROVER.value,
    "procurement": UserRole.PROCUREMENT_APPROVER.value,
    "admin": UserRole.ADMINISTRATOR.value,
    "administrator": UserRole.ADMINISTRATOR.value,
}


def normalize_role(raw_role: str) -> str:
    """Normalize input role strings into canonical backend UserRole values."""
    cleaned = raw_role.strip().lower()
    return ROLE_ALIASES.get(cleaned, cleaned)


# Explicit permissions matrix for every backend role
ROLE_PERMISSIONS: dict[str, set[Permission]] = {
    UserRole.OPERATIONS_ANALYST.value: {
        Permission.DASHBOARD_READ,
        Permission.DISRUPTIONS_READ,
        Permission.ORDERS_READ,
        Permission.INVENTORY_READ,
        Permission.SHIPMENTS_READ,
        Permission.SUPPLIERS_READ,
        Permission.APPROVALS_READ,
        Permission.AUDIT_READ,
        Permission.WAREHOUSES_READ,
        Permission.TRANSFERS_READ,
        Permission.TRANSFERS_REQUEST,
        Permission.PLANS_CREATE,
        Permission.PLANS_READ,
        Permission.PLANS_SIMULATE,
        Permission.PLANS_SUBMIT,
        Permission.PLANS_MODIFY,
        Permission.AI_ANALYZE,
        Permission.AI_ADVISE,
        Permission.AI_REPORT,
        Permission.DISRUPTIONS_WRITE,
        Permission.SHIPMENTS_WRITE,
        Permission.SUPPLIERS_WRITE,
        Permission.ORDERS_WRITE,
    },
    UserRole.WAREHOUSE_OPERATOR.value: {
        Permission.DASHBOARD_READ,
        Permission.DISRUPTIONS_READ,
        Permission.ORDERS_READ,
        Permission.INVENTORY_READ,
        Permission.SHIPMENTS_READ,
        Permission.WAREHOUSES_READ,
        Permission.TRANSFERS_READ,
        Permission.TRANSFERS_REQUEST,
        Permission.TRANSFERS_DISPATCH,
        Permission.TRANSFERS_RECEIVE,
        Permission.PLANS_READ,
        Permission.PLANS_EXECUTE,  # Warehouse operators can execute approved warehouse picks
        Permission.INVENTORY_WRITE,
    },
    UserRole.SUPPLY_CHAIN_MANAGER.value: {
        Permission.DASHBOARD_READ,
        Permission.DISRUPTIONS_READ,
        Permission.ORDERS_READ,
        Permission.INVENTORY_READ,
        Permission.SHIPMENTS_READ,
        Permission.SUPPLIERS_READ,
        Permission.APPROVALS_READ,
        Permission.AUDIT_READ,
        Permission.WAREHOUSES_READ,
        Permission.WAREHOUSES_WRITE,
        Permission.TRANSFERS_READ,
        Permission.TRANSFERS_REQUEST,
        Permission.TRANSFERS_APPROVE,
        Permission.TRANSFERS_DISPATCH,
        Permission.TRANSFERS_RECEIVE,
        Permission.PRODUCTS_WRITE,
        Permission.PLANS_CREATE,
        Permission.PLANS_READ,
        Permission.PLANS_SIMULATE,
        Permission.PLANS_SUBMIT,
        Permission.PLANS_MODIFY,
        Permission.PLANS_APPROVE_STANDARD,  # Standard operational approvals (internal stock/transfers)
        Permission.PLANS_REJECT,
        Permission.PLANS_EXECUTE,
        Permission.AI_ANALYZE,
        Permission.AI_ADVISE,
        Permission.AI_REPORT,
        Permission.DISRUPTIONS_WRITE,
        Permission.INVENTORY_WRITE,
        Permission.SHIPMENTS_WRITE,
        Permission.SUPPLIERS_WRITE,
        Permission.ORDERS_WRITE,
    },
    UserRole.PROCUREMENT_APPROVER.value: {
        Permission.DASHBOARD_READ,
        Permission.DISRUPTIONS_READ,
        Permission.ORDERS_READ,
        Permission.INVENTORY_READ,
        Permission.SHIPMENTS_READ,
        Permission.SUPPLIERS_READ,
        Permission.APPROVALS_READ,
        Permission.AUDIT_READ,
        Permission.WAREHOUSES_READ,
        Permission.TRANSFERS_READ,
        Permission.TRANSFERS_APPROVE,
        Permission.PLANS_READ,
        Permission.PLANS_APPROVE_STANDARD,
        Permission.PLANS_APPROVE_PROCUREMENT,  # Authorised to approve external purchases & alt-sourcing
        Permission.PLANS_REJECT,
        Permission.AI_ADVISE,
        Permission.AI_REPORT,
        Permission.SUPPLIERS_WRITE,
    },
    UserRole.ADMINISTRATOR.value: set(Permission),  # Administrators hold all permissions
}


def role_has_permission(role: str, permission: Permission) -> bool:
    """Verify whether a role grants a specific permission."""
    canonical_role = normalize_role(role)
    if canonical_role == UserRole.ADMINISTRATOR.value:
        return True
    allowed = ROLE_PERMISSIONS.get(canonical_role, set())
    return permission in allowed


def plan_requires_procurement_approval(
    plan: Any,
    allocations: list[Any] | None = None,
    threshold_usd: float = 50_000.0,
) -> tuple[bool, str]:
    """
    Determine if a plan requires procurement approval according to configured policy.
    Triggers when:
      1. Any allocation or action involves alternative sourcing ('alt_supplier' or purchase).
      2. The estimated cost exceeds the procurement approval threshold.
    """
    # 1. Check strategy type
    strategy = getattr(plan, "strategy_type", "").lower()
    if "alt_supplier" in strategy or "procurement" in strategy or "purchase" in strategy:
        return True, f"Plan strategy '{strategy}' triggers alternative sourcing"

    # 2. Check cost threshold
    cost = float(getattr(plan, "estimated_cost_usd", 0.0) or 0.0)
    if cost >= threshold_usd:
        return True, f"Plan estimated cost (${cost:,.2f}) meets or exceeds procurement threshold (${threshold_usd:,.2f})"

    # 3. Check allocations for alt_supplier actions
    if allocations:
        for a in allocations:
            action_type = getattr(a, "action_type", "")
            if action_type == "alt_supplier":
                return True, "Plan contains allocations with external alternative suppliers"

    return False, ""
