from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import settings
from app.core.errors import UnauthenticatedError

ALGORITHM = "HS256"


def create_magic_link_token(email: str, expires_delta: timedelta = timedelta(minutes=15)) -> str:
    """Create a short-lived token for magic-link authentication (15 min)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email.lower(),
        "purpose": "magic_link",
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_magic_link_token(token: str) -> str:
    """Validate and return email from magic-link token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("purpose") != "magic_link":
            raise UnauthenticatedError("Invalid token purpose.")
        sub = payload.get("sub")
        if not sub or not isinstance(sub, str):
            raise UnauthenticatedError("Token missing subject email.")
        return sub
    except JWTError as err:
        raise UnauthenticatedError("Invalid or expired magic link.") from err


def create_session_token(member_id: int, expires_delta: timedelta = timedelta(hours=24)) -> str:
    """Create a 24-hour session JWT with only member_id and expiry."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(member_id),
        "purpose": "session",
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=ALGORITHM)


def decode_session_token(token: str) -> int:
    """Validate session token and return member_id."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
        if payload.get("purpose") != "session":
            raise UnauthenticatedError("Invalid session token.")
        sub = payload.get("sub")
        if not sub:
            raise UnauthenticatedError("Invalid session token payload.")
        return int(sub)
    except (JWTError, ValueError) as err:
        raise UnauthenticatedError("Session expired or invalid.") from err
