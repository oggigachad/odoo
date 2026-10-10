from typing import Annotated, Awaitable, Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.core.security import decode_session_token
from app.schemas.auth import MemberInfo
from app.services.auth_service import AuthService

security = HTTPBearer(auto_error=False)


async def get_current_member(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberInfo:
    token: str | None = None
    if credentials:
        token = credentials.credentials
    elif "session" in request.cookies:
        token = request.cookies.get("session")

    if not token:
        raise UnauthenticatedError("Authentication required.")

    member_id = decode_session_token(token)
    service = AuthService(db)
    return await service.get_current_user_info(member_id)


def require_role(allowed_roles: list[str]) -> Callable[[MemberInfo], Awaitable[MemberInfo]]:
    async def role_checker(current_user: Annotated[MemberInfo, Depends(get_current_member)]) -> MemberInfo:
        # Check if user has at least one of the allowed roles
        user_roles_lower = [r.lower() for r in current_user.roles]
        if any(role.lower() in user_roles_lower for role in allowed_roles):
            return current_user
        raise ForbiddenError(f"Action requires one of the following roles: {', '.join(allowed_roles)}")

    return role_checker


# Single source of truth for who counts as what (compared case-insensitively).
FINANCE_POSITIONS = ("Treasurer", "Accountant", "Admin")
OFFICER_POSITIONS = ("President", "Vice President", "Secretary", "Officer", *FINANCE_POSITIONS)

# Announcements are written by the admin or officers (not by the finance roles)
ANNOUNCER_POSITIONS = ("Admin", "President", "Vice President", "Secretary", "Officer")
ASSIGNABLE_POSITIONS = ("Admin", "President", "Vice President", "Secretary", "Treasurer", "Accountant", "Officer")

RequireOfficer = require_role(list(OFFICER_POSITIONS))
RequireAdmin = require_role(["Admin"])
RequireAnnouncer = require_role(list(ANNOUNCER_POSITIONS))
RequireTreasurer = require_role(list(FINANCE_POSITIONS))


def is_officer(user: MemberInfo) -> bool:
    officer_lower = {p.lower() for p in OFFICER_POSITIONS}
    return any(r.lower() in officer_lower for r in user.roles)


def is_finance(user: MemberInfo) -> bool:
    finance_lower = {p.lower() for p in FINANCE_POSITIONS}
    return any(r.lower() in finance_lower for r in user.roles)


async def get_optional_member(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberInfo | None:
    """Like get_current_member but returns None for anonymous callers (public checkout flows)."""
    if not credentials and "session" not in request.cookies:
        return None
    try:
        return await get_current_member(request, credentials, db)
    except UnauthenticatedError:
        return None
