from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member
from app.core.database import get_db
from app.schemas.auth import MagicLinkRequest, MemberInfo, TokenExchangeRequest, TokenResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/magic-link", status_code=202)
async def request_magic_link(
    payload: MagicLinkRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Request a 15-minute magic login link.

    Always returns 202 without revealing if email is registered.
    """
    service = AuthService(db)
    await service.request_magic_link(payload.email)
    return {"message": "If the email is recognized, a magic sign-in link has been sent."}


@router.post("/token", response_model=TokenResponse)
async def exchange_token(
    payload: TokenExchangeRequest,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Exchange single-use magic token for a 24h JWT session."""
    service = AuthService(db)
    session_token = await service.exchange_token(payload.token)

    # Set HttpOnly session cookie for web client
    response.set_cookie(
        key="session",
        value=session_token,
        max_age=86400,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True in HTTPS production
    )

    return TokenResponse(token=session_token, token_type="bearer", expires_in=86400)


@router.get("/me", response_model=MemberInfo, tags=["Profile"])
async def get_my_profile(
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
) -> MemberInfo:
    """Return profile, current roles, and active membership status."""
    return current_user
