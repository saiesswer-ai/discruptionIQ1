"""Authentication endpoints for DisruptionIQ."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.database import get_db
from app.core.permissions import ROLE_PERMISSIONS, normalize_role
from app.core.security import create_access_token, login_rate_limiter, verify_password
from app.models.auth import User, UserRole
from app.models.governance import AuditRecord
from app.schemas.auth import LoginRequest, LogoutResponse, TokenResponse, UserProfileResponse

auth_router = APIRouter(prefix="/auth", tags=["Authentication"])
DbSession = Annotated[Session, Depends(get_db)]


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


@auth_router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and issue signed bearer token",
)
def login(request: Request, body: LoginRequest, db: DbSession) -> TokenResponse:
    """
    Authenticate against database credentials using PBKDF2-HMAC-SHA256 password hashing.
    Enforces rate limiting to prevent brute-force attacks.
    """
    settings = get_settings()
    ip = _client_ip(request)
    rate_key = f"{ip}:{body.username.lower()}"

    if settings.rate_limit_enabled:
        allowed, retry_after = login_rate_limiter.is_allowed(rate_key)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Too many failed login attempts. Try again in {retry_after} seconds.",
                },
                headers={"Retry-After": str(retry_after)},
            )

    # Find user by username or email
    user = db.scalars(
        select(User).where(
            (User.username == body.username) | (User.email == body.username)
        )
    ).first()

    if not user or not verify_password(body.password, user.password_hash):
        if settings.rate_limit_enabled:
            login_rate_limiter.record_attempt(rate_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Invalid username or password."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "USER_INACTIVE", "message": "User account has been deactivated."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Success: reset rate limit tracking
    if settings.rate_limit_enabled:
        login_rate_limiter.reset(rate_key)

    # Create signed token
    token = create_access_token(
        data={
            "sub": user.id,
            "username": user.username,
            "role": user.role,
        }
    )

    # Record login audit event
    now = datetime.now(timezone.utc)
    audit = AuditRecord(
        id=f"AUD-AUTH-{uuid.uuid4().hex[:10].upper()}",
        timestamp=now,
        action="user_login",
        entity_type="User",
        entity_id=user.id,
        payload_json=json.dumps({
            "username": user.username,
            "role": user.role,
            "ip": ip,
            "userAgent": request.headers.get("user-agent", "unknown"),
        }),
    )
    db.add(audit)
    db.commit()

    canonical_role = normalize_role(user.role)
    permissions = [p.value for p in ROLE_PERMISSIONS.get(canonical_role, set())]

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserProfileResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            fullName=user.full_name,
            role=user.role,
            approvalLimitUSD=float(user.approval_limit_usd or 0.0),
            permissions=sorted(permissions),
        ),
    )


@auth_router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current authenticated user profile and permissions",
)
def get_me(current_user: Annotated[User, Depends(get_current_user)]) -> UserProfileResponse:
    canonical_role = normalize_role(current_user.role)
    permissions = [p.value for p in ROLE_PERMISSIONS.get(canonical_role, set())]
    return UserProfileResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        fullName=current_user.full_name,
        role=current_user.role,
        approvalLimitUSD=float(current_user.approval_limit_usd or 0.0),
        permissions=sorted(permissions),
    )


@auth_router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Log out active session",
)
def logout(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: DbSession,
) -> LogoutResponse:
    now = datetime.now(timezone.utc)
    audit = AuditRecord(
        id=f"AUD-AUTH-{uuid.uuid4().hex[:10].upper()}",
        timestamp=now,
        action="user_logout",
        entity_type="User",
        entity_id=current_user.id,
        payload_json=json.dumps({
            "username": current_user.username,
            "role": current_user.role,
            "ip": _client_ip(request),
        }),
    )
    db.add(audit)
    db.commit()
    return LogoutResponse()
