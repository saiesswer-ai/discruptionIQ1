"""Pydantic schemas for System and Disruption Notifications."""
from typing import Optional
from pydantic import BaseModel


class NotificationItem(BaseModel):
    id: str
    title: str
    message: str
    category: str  # disruption, risk, approval, recovery, system
    severity: str  # info, warning, critical, success
    timestamp: str
    read: bool
    linkedEntityId: Optional[str] = None
    linkedEntityType: Optional[str] = None  # disruption, order, plan, approval
