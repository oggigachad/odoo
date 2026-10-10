import hashlib
import hmac
import secrets
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
        email_res: str = f"{sub}"
        return email_res
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


# ---------------------------------------------------------------------
# Password hashing (PBKDF2-HMAC-SHA256, stdlib only)
# ---------------------------------------------------------------------
# OWASP guidance for PBKDF2-HMAC-SHA256 is 600k+; the count is stored in each hash, so older hashes keep verifying
_PBKDF2_ITERATIONS = 20_000 if settings.APP_ENV == "test" else 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        scheme, iterations, salt, expected = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------
# Ticket QR signing. The QR encodes "SKYLINE1.<ticket_code>.<signature>" which is
# not a URL: only the Skyline website/app check-in can interpret and verify it.
# ---------------------------------------------------------------------
TICKET_QR_PREFIX = "SKYLINE1"


def _ticket_key() -> bytes:
    if not settings.TICKET_SIGNING_SECRET:
        raise RuntimeError("TICKET_SIGNING_SECRET is not set. Ticket QR codes need their own signing key.")
    return settings.TICKET_SIGNING_SECRET.encode()


def sign_ticket_code(ticket_code: str) -> str:
    return hmac.new(_ticket_key(), ticket_code.lower().encode(), hashlib.sha256).hexdigest()[:20]


def build_ticket_qr_payload(ticket_code: str) -> str:
    return f"{TICKET_QR_PREFIX}.{ticket_code.lower()}.{sign_ticket_code(ticket_code)}"


def parse_ticket_qr_payload(payload: str) -> str | None:
    """Return the ticket code if payload is a validly signed Skyline QR payload, else None."""
    parts = payload.strip().split(".")
    if len(parts) != 3 or parts[0] != TICKET_QR_PREFIX:
        return None
    _, code, sig = parts
    if not hmac.compare_digest(sig, sign_ticket_code(code)):
        return None
    return code
