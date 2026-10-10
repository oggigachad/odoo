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


RequireOfficer = require_role(["President", "Vice President", "Secretary", "Treasurer", "Officer"])
RequireTreasurer = require_role(["Treasurer"])
