"""
Password hashing + JWT helpers.

Passwords are NEVER stored in plaintext. `hash_password` runs bcrypt (via
passlib) with a per-password random salt baked into the output hash, and
that hash string is the only thing persisted (in `users.hashed_password`,
see app/db/models.py). Login verifies by re-hashing the candidate password
with the stored salt and comparing -- the original password is never
recovered or compared directly.

Sessions are stateless JWTs signed with `settings.secret_key` (HS256).
The frontend stores the resulting token (see frontend/src/lib/auth.ts) and
sends it back as `Authorization: Bearer <token>` on every request; this
file is what mints and later verifies that token.
"""
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def generate_numeric_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP string."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp(otp: str) -> str:
    """Hash an OTP code using bcrypt so it cannot be extracted from the DB."""
    return pwd_context.hash(otp)


def verify_otp_hash(plain_otp: str, hashed_otp: str) -> bool:
    """Verify an OTP against its stored hash."""
    return pwd_context.verify(plain_otp, hashed_otp)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    """Returns the user id (subject) encoded in the token, or None if the
    token is missing, malformed, expired, or signed with the wrong key."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


def create_password_reset_token(user_id: str, phone_number: str) -> str:
    """Creates a short-lived token granting permission to reset the password."""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.password_reset_token_expire_minutes
    )
    payload: dict[str, Any] = {
        "sub": user_id,
        "phone": phone_number,
        "purpose": "password_reset",
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_password_reset_token(token: str) -> dict[str, Any] | None:
    """Decodes and validates a password reset token."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("purpose") != "password_reset":
            return None
        return payload
    except jwt.PyJWTError:
        return None
