from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError

from app.config import get_settings

settings = get_settings()
_hasher = PasswordHasher()

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False
    return True


def create_token(user_id: int, role: str, token_type: TokenType, token_version: int = 0) -> str:
    now = datetime.now(UTC)
    lifetime = (
        timedelta(minutes=settings.access_token_minutes)
        if token_type == "access"
        else timedelta(days=settings.refresh_token_days)
    )
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": token_type,
        # The token is only valid while it matches the user's current version;
        # bumping the version (logout / password change) revokes every token.
        "tv": token_version,
        "iat": now,
        "exp": now + lifetime,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType) -> dict:
    """Raises jwt.PyJWTError (incl. expiry) on anything invalid."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"expected a {expected_type} token")
    return payload


def create_email_verify_token(user_id: int) -> str:
    """A signed, short-lived token proving control of the signup email address."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": "verify",
        "iat": now,
        "exp": now + timedelta(hours=settings.email_verify_ttl_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_email_verify_token(token: str) -> dict:
    """Raises jwt.PyJWTError (incl. expiry) on anything invalid."""
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != "verify":
        raise jwt.InvalidTokenError("expected an email-verification token")
    return payload
