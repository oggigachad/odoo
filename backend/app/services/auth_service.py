from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import UnauthenticatedError
from app.core.security import create_magic_link_token, create_session_token, decode_magic_link_token
from app.repositories.member_repo import MemberRepository
from app.schemas.auth import MemberInfo


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MemberRepository(session)

    async def request_magic_link(self, email: str) -> str:
        """Generate magic link token.

        Never reveals whether the email exists.
        """
        token = create_magic_link_token(email)
        member = await self.repo.get_by_email(email)
        if member:
            # In production, dispatch email here via email provider
            pass
        return token

    async def exchange_token(self, token: str) -> str:
        """Validate magic token and produce 24h session JWT."""
        email = decode_magic_link_token(token)
        member = await self.repo.get_by_email(email)
        if not member:
            raise UnauthenticatedError("No registered member found for this email.")
        return create_session_token(member.member_id)

    async def get_current_user_info(self, member_id: int) -> MemberInfo:
        member = await self.repo.get_by_id(member_id)
        if not member:
            raise UnauthenticatedError("Member not found.")

        today = date.today()
        current_year = today.year
        roles = list(await self.repo.get_roles_for_year(member_id, current_year))
        is_active = await self.repo.has_active_membership(member_id, today)

        return MemberInfo(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            phone=member.phone,
            is_active=is_active,
            roles=roles,
        )
