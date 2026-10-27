"""Pydantic schemas for Governance Audit Trail."""
from typing import Optional, Dict, Any
from pydantic import BaseModel


class AuditLogDiff(BaseModel):
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None


class AuditLogEntry(BaseModel):
    id: str
    timestamp: str
    actorName: str
    actorRole: str
    action: str
    entityType: str  # Disruption, RecoveryPlan, Order, Approval, Simulation, Inventory
    entityId: str
    reason: str
    changesSummary: Optional[str] = None
    diffPayload: Optional[AuditLogDiff] = None
