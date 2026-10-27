"""Response contracts for deterministic disruption intelligence."""
from typing import Any
from pydantic import BaseModel


class Evidence(BaseModel):
    kind: str
    facts: dict[str, Any]


class AffectedOrder(BaseModel):
    id: str
    riskScore: int
    riskLevel: str
    evidence: list[Evidence]


class DisruptionDetail(BaseModel):
    id: str
    title: str
    type: str
    severity: str
    status: str
    detectedAt: str
    summary: str
    evidence: list[Evidence]
    affectedOrders: list[AffectedOrder]
    impacts: list[dict[str, Any]]
