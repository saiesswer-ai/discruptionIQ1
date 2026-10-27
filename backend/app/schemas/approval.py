"""Pydantic schemas for Approval governance requests."""
from typing import Optional
from pydantic import BaseModel


class ApprovalRequest(BaseModel):
    id: str
    planId: str
    planName: str
    disruptionId: str
    disruptionTitle: str
    requesterName: str
    requesterRole: str  # director, logistics_mgr, warehouse_lead, analyst
    requestedAt: str
    estimatedCostUSD: float
    affectedOrdersCount: int
    projectedSavingsUSD: float
    status: str  # pending, approved, rejected, modification_requested
    reviewedBy: Optional[str] = None
    reviewedRole: Optional[str] = None
    reviewedAt: Optional[str] = None
    justificationNotes: str
    reviewerComments: Optional[str] = None
    requiredApprovalLevel: str
