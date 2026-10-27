"""Authentication and authorization FastAPI dependencies."""
from __future__ import annotations

from typing import Annotated, Callable

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.permissions import Permission, normalize_role, role_has_permission
from app.core.security import TokenExpiredError, TokenInvalidError, decode_access_token
from app.models.auth import User, UserRole

DbSession = Annotated[Session, Depends(get_db)]


def _extract_token_from_header(auth_header: str | None) -> str | None:
    if not auth_header:
        return None
    parts = auth_header.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def get_current_user(
    request: Request,
    db: DbSession,
    authorization: str | None = Header(default=None),
    x_actor_id: str | None = Header(default=None),
    x_actor_role: str | None = Header(default=None),  # Deliberately ignored for permissions
) -> User:
    """
    Authenticate the incoming request and return the active User entity from the database.

    Security rules:
      1. If a signed Bearer token is provided, verify its signature, claims, and expiry.
      2. NEVER trust client-supplied roles (e.g. X-Actor-Role header); always retrieve the role
         directly from the database record.
      3. If no token is provided:
         - In production (or when auth_required=True), immediately raise 401 Unauthorized.
         - In development mode (auth_required=False), check if an explicit X-Actor-Id is passed
           and resolve it against the database user registry; otherwise return a default analyst.
    """
    settings = get_settings()
    token = _extract_token_from_header(authorization)

    # 1. Bearer Token Authentication
    if token:
        try:
            payload = decode_access_token(token)
        except TokenExpiredError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "TOKEN_EXPIRED", "message": "Authentication token has expired. Please log in again."},
                headers={"WWW-Authenticate": "Bearer"},
            )
        except TokenInvalidError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_TOKEN", "message": f"Invalid authentication token: {exc}"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "INVALID_TOKEN", "message": "Token missing subject claim"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = db.get(User, user_id)
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "USER_INACTIVE", "message": "User account not found or deactivated"},
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    # 2. If token is missing and auth is strictly enforced
    if settings.auth_required:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "Authentication required. Missing Bearer token."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3. Development / Test fallback mode (auth_required=False)
    # When X-Actor-Id is passed, ALWAYS look up the user in the database to get their true role.
    # NEVER trust X-Actor-Role!
    if x_actor_id:
        # Check by id or username
        user = db.scalars(
            select(User).where((User.id == x_actor_id) | (User.username == x_actor_id))
        ).first()
        if user and user.is_active:
            return user

        # If not found in DB, check known development alias
        alias_role = normalize_role(x_actor_id)
        user_by_role = db.scalars(
            select(User).where(User.role == alias_role)
        ).first()
        if user_by_role and user_by_role.is_active:
            return user_by_role

    # Default development fallback user (Operations Analyst)
    default_dev_user = db.scalars(
        select(User).where(User.role == UserRole.OPERATIONS_ANALYST.value)
    ).first()
    if default_dev_user:
        return default_dev_user

    # If database not yet seeded, synthesize an in-memory dev user
    from datetime import datetime, timezone
    return User(
        id="usr_dev_analyst",
        username="dev_analyst",
        email="analyst@disruptioniq.local",
        full_name="Development Operations Analyst",
        role=UserRole.OPERATIONS_ANALYST.value,
        approval_limit_usd=0.0,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def require_permission(permission: Permission) -> Callable[[User], User]:
    """Dependency factory checking that the authenticated user possesses the required permission."""

    def _dependency(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        # Role is loaded from the database
        if not role_has_permission(current_user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN",
                    "message": f"Insufficient permissions. Role '{current_user.role}' lacks permission '{permission.value}'.",
                },
            )
        return current_user

    return _dependency


def require_role(*allowed_roles: str | UserRole) -> Callable[[User], User]:
    """Dependency factory enforcing that the authenticated user's database role matches one of allowed_roles."""
    canonical_allowed = {
        normalize_role(r.value if isinstance(r, UserRole) else str(r))
        for r in allowed_roles
    }

    def _dependency(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        user_role = normalize_role(current_user.role)
        if user_role == UserRole.ADMINISTRATOR.value or user_role in canonical_allowed:
            return current_user

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": f"Action requires one of roles {[r for r in canonical_allowed]}; actor has '{user_role}'.",
            },
        )

    return _dependency
