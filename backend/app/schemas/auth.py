"""Pydantic schemas for authentication and user profiles."""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64, description="Username or email address")
    password: str = Field(..., min_length=6, description="Account password")


class UserProfileResponse(BaseModel):
    id: str
    username: str
    email: str
    fullName: str
    role: str
    approvalLimitUSD: float = 0.0
    permissions: list[str] = Field(default_factory=list)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserProfileResponse


class LogoutResponse(BaseModel):
    message: str = "Logged out successfully"
