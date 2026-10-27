"""Shared response and error schemas."""
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorBody


class DashboardSummary(BaseModel):
    """Source-of-truth counts only; calculated KPIs are intentionally deferred."""

    activeDisruptions: int
    ordersAtRisk: int
    delayedShipments: int
    constrainedInventoryItems: int
    pendingApprovals: int
