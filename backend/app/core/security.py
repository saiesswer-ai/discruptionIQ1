"""Production-conscious password hashing, token encoding/decoding, and rate limiting."""
from __future__ import annotations

import base64
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
from typing import Any

from app.core.config import get_settings


class SecurityError(Exception):
    """Base class for security and token exceptions."""


class TokenExpiredError(SecurityError):
    """Raised when an authentication token has expired."""


class TokenInvalidError(SecurityError):
    """Raised when an authentication token is malformed or invalid."""


# ---------------------------------------------------------------------------
# Password Hashing & Verification (PBKDF2-HMAC-SHA256 with 600,000 rounds)
# Compliant with OWASP & NIST recommendations; zero C-extension dependency.
# ---------------------------------------------------------------------------

PBKDF2_ALGORITHM = "sha256"


def get_pbkdf2_iterations() -> int:
    settings = get_settings()
    # Fast iteration count for test environments to keep test suite responsive
    if settings.environment.lower() in ("test", "testing"):
        return 10_000
    return 600_000


def hash_password(password: str) -> str:
    """Hash a plaintext password using PBKDF2-HMAC-SHA256 with a unique random salt."""
    if not password:
        raise ValueError("Password cannot be empty")
    iterations = get_pbkdf2_iterations()
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(
        PBKDF2_ALGORITHM,
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return f"pbkdf2_sha256${iterations}${salt.hex()}${dk.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2 hash using constant-time comparison."""
    if not plain_password or not hashed_password:
        return False
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4:
            return False
        algo, iter_str, salt_hex, hash_hex = parts
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iter_str)
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(hash_hex)
        candidate_hash = hashlib.pbkdf2_hmac(
            PBKDF2_ALGORITHM,
            plain_password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(candidate_hash, expected_hash)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Signed Authenticated Tokens (HMAC-SHA256 Signed Web Tokens)
# ---------------------------------------------------------------------------

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding and padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data.encode("utf-8"))


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a tamper-evident signed token with UTC expiration and unique identifier."""
    settings = get_settings()
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": secrets.token_hex(16),
    })

    header = {"alg": "HS256", "typ": "JWT"}
    header_json = json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_json = json.dumps(to_encode, separators=(",", ":"), sort_keys=True).encode("utf-8")

    header_b64 = _b64url_encode(header_json)
    payload_b64 = _b64url_encode(payload_json)
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    secret_key = settings.jwt_secret_key.encode("utf-8")
    signature = hmac.new(secret_key, signing_input, hashlib.sha256).digest()
    sig_b64 = _b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify an HMAC-SHA256 signed token."""
    settings = get_settings()
    parts = token.split(".")
    if len(parts) != 3:
        raise TokenInvalidError("Malformed token structure")

    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    secret_key = settings.jwt_secret_key.encode("utf-8")
    expected_sig = hmac.new(secret_key, signing_input, hashlib.sha256).digest()

    try:
        provided_sig = _b64url_decode(sig_b64)
    except Exception as exc:
        raise TokenInvalidError("Invalid signature encoding") from exc

    if not hmac.compare_digest(expected_sig, provided_sig):
        raise TokenInvalidError("Signature verification failed")

    try:
        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))
    except Exception as exc:
        raise TokenInvalidError("Invalid token payload") from exc

    exp = payload.get("exp")
    if exp is None:
        raise TokenInvalidError("Token missing expiration claim")

    now = datetime.now(timezone.utc).timestamp()
    if now > exp:
        raise TokenExpiredError("Token has expired")

    return payload


# ---------------------------------------------------------------------------
# Rate Limiting (In-Memory Sliding Window for Login Endpoints)
# ---------------------------------------------------------------------------

class LoginRateLimiter:
    """Sliding-window rate limiter protecting login against brute-force attempts."""

    def __init__(self, max_attempts: int = 5, window_seconds: int = 60) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        # key -> list of attempt timestamps
        self._attempts: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> tuple[bool, int]:
        """Check if request for key (e.g. IP or IP+username) is allowed.

        Returns (is_allowed, seconds_until_reset).
        """
        now = datetime.now(timezone.utc).timestamp()
        cutoff = now - self.window_seconds
        # Prune older attempts
        self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]

        if len(self._attempts[key]) >= self.max_attempts:
            oldest = self._attempts[key][0]
            retry_after = max(1, int(oldest + self.window_seconds - now))
            return False, retry_after

        return True, 0

    def record_attempt(self, key: str) -> None:
        now = datetime.now(timezone.utc).timestamp()
        self._attempts[key].append(now)

    def reset(self, key: str) -> None:
        if key in self._attempts:
            del self._attempts[key]

    def clear(self) -> None:
        self._attempts.clear()


login_rate_limiter = LoginRateLimiter()
