from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import RateLimitedError
from app.core.redis import check_rate_limit
from app.core.security import decode_session_token
from app.schemas.auth import (
    ChangePasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    RegisterOtpRequest,
    SessionResponse,
    MagicLinkRequest,
    MemberInfo,
    OTPGenerateRequest,
    OTPGenerateResponse,
    OTPVerifyRequest,
    TokenExchangeRequest,
    TokenResponse,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/magic-link", status_code=202)
async def request_magic_link(
    payload: MagicLinkRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Request a 15-minute magic login link.

    Rate-limited per IP to prevent spamming and email queue exhaustion.
    Always returns 202 without revealing if email is registered.
    """
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = await check_rate_limit("magic_link", client_ip, limit=5, window_secs=60)
    if not allowed:
        raise RateLimitedError(f"Too many magic link requests. Please wait {retry_after}s.")

    service = AuthService(db)
    await service.request_magic_link(payload.email, payload.portal)
    return {"message": "If the email is recognized, a magic sign-in link has been sent."}


@router.get("/signup-rules")
async def signup_rules() -> dict[str, list[str]]:
    """Which email domains may create an account (shown on the sign-up form)."""
    return {"student_domains": settings.student_domains, "admin_domains": settings.admin_domains}


@router.get("/check-email")
async def check_email_availability(
    email: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    """Check if an email is already registered in the system."""
    from app.repositories.member_repo import MemberRepository
    repo = MemberRepository(db)
    existing = await repo.get_by_email(email.strip().lower())
    return {"available": existing is None, "exists": existing is not None}


@router.post("/otp/generate", response_model=OTPGenerateResponse)
async def generate_otp(
    payload: OTPGenerateRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OTPGenerateResponse:
    """Generate a 6-digit OTP code for instant login verification.

    Rate-limited and throttled.
    In development/testing mode, dev_otp is included in the response payload.
    """
    client_ip = request.client.host if request.client else "unknown"
    service = AuthService(db)
    otp, expires_in = await service.generate_otp(payload.email, client_ip, payload.purpose)
    # The code is only echoed back to a developer on this same machine, never to a remote caller
    local = (request.client.host if request.client else "") in ("127.0.0.1", "::1", "localhost", "testclient")
    dev_otp = otp if (otp and settings.APP_ENV in ("development", "test") and local) else None

    return OTPGenerateResponse(
        message="A 6-digit verification code has been dispatched.",
        expires_in=expires_in,
        dev_otp=dev_otp,
    )


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="session",
        value=token,
        max_age=86400,
        httponly=True,
        samesite="lax",
        secure=settings.APP_ENV not in ("development", "test"),
    )


@router.post("/otp/verify", response_model=SessionResponse)
async def verify_otp(
    payload: OTPVerifyRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionResponse:
    """Verify 6-digit OTP and issue authenticated session token."""
    service = AuthService(db)
    session_token = await service.verify_otp(payload.email, payload.otp)
    user = await service.get_current_user_info(decode_session_token(session_token))
    _set_session_cookie(response, session_token)
    return SessionResponse(token=session_token, user=user)


@router.get("/testmail-otp")
async def get_testmail_otp(email: str | None = None) -> dict[str, Any]:
    """Development helper: read the latest OTP from testmail.app (TESTMAIL_API_KEY / TESTMAIL_NAMESPACE in .env).

    Disabled outside development/test: this endpoint hands out sign-in codes, so it must never be reachable in production.
    """
    import re

    import httpx

    from app.core.errors import ForbiddenError

    if settings.APP_ENV not in ("development", "test") or not (settings.TESTMAIL_API_KEY and settings.TESTMAIL_NAMESPACE):
        raise ForbiddenError("This development helper is disabled.")
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(
                "https://api.testmail.app/api/json",
                params={"apikey": settings.TESTMAIL_API_KEY, "namespace": settings.TESTMAIL_NAMESPACE, "limit": 5},
            )
            if resp.status_code == 200:
                for em in resp.json().get("emails", []):
                    if email and email.lower() not in em.get("to", "").lower():
                        continue
                    m = re.search(r"(\d{6})", (em.get("text") or "") + " " + (em.get("subject") or ""))
                    if m:
                        return {"otp": m.group(1), "source": "testmail.app", "subject": em.get("subject")}
    except Exception:  # noqa: BLE001
        pass
    return {"otp": None, "source": "none"}


@router.post("/register-otp", response_model=SessionResponse, status_code=201)
async def register_with_otp(
    payload: RegisterOtpRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionResponse:
    """Register student account with 6-digit OTP verification."""
    service = AuthService(db)
    token, user = await service.verify_otp_and_register(
        payload.full_name, payload.email, payload.phone, payload.student_id, payload.otp, payload.password
    )
    _set_session_cookie(response, token)
    return SessionResponse(token=token, user=user)


@router.post("/login", response_model=SessionResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionResponse:
    """Email + password sign-in. Role and access level always come from the database."""
    client_ip = request.client.host if request.client else "unknown"
    token, user = await AuthService(db).login_with_password(payload.email, payload.password, client_ip)
    _set_session_cookie(response, token)
    return SessionResponse(token=token, user=user)


@router.post("/register", response_model=SessionResponse, status_code=201)
async def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionResponse:
    """Create an account. Everyone starts as a Guest; staff roles are granted by an Admin."""
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = await check_rate_limit("register_ip", client_ip, limit=10, window_secs=300)
    if not allowed:
        raise RateLimitedError(f"Too many sign-up attempts. Please wait {retry_after}s.")
    token, user = await AuthService(db).register(
        payload.full_name, payload.email, payload.password, payload.phone, payload.student_id, payload.otp
    )
    _set_session_cookie(response, token)
    return SessionResponse(token=token, user=user)


@router.post("/google", response_model=SessionResponse)
async def google_login(
    payload: GoogleLoginRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SessionResponse:
    """Verify a Google ID token on the server and sign the user in."""
    token, user = await AuthService(db).login_with_google(payload.credential)
    _set_session_cookie(response, token)
    return SessionResponse(token=token, user=user)


@router.post("/password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    await AuthService(db).change_password(current_user.member_id, payload.current_password, payload.new_password)
    return {"message": "Password updated."}


@router.post("/token", response_model=TokenResponse)
async def exchange_token(
    payload: TokenExchangeRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Exchange single-use magic token for a 24h JWT session."""
    service = AuthService(db)
    session_token = await service.exchange_token(payload.token)

    _set_session_cookie(response, session_token)
    return TokenResponse(token=session_token, token_type="bearer", expires_in=86400)


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    """Clear session cookie."""
    response.delete_cookie(key="session")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=MemberInfo, tags=["Profile"])
async def get_my_profile(
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
) -> MemberInfo:
    """Return profile, current roles, and active membership status."""
    return current_user
