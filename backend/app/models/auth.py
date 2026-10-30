"""Authentication and user persistence models."""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserRole(str, Enum):
    OPERATIONS_ANALYST = "operations_analyst"
    SUPPLY_CHAIN_MANAGER = "supply_chain_manager"
    WAREHOUSE_OPERATOR = "warehouse_operator"
    PROCUREMENT_APPROVER = "procurement_approver"
    ADMINISTRATOR = "administrator"


class User(Base):
    """User account entity storing authentication credentials and backend-enforced roles."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    role: Mapped[str] = mapped_column(String(32), index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    approval_limit_usd: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    assigned_warehouse_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)
