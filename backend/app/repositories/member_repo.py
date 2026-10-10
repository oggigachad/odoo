from datetime import date
from typing import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.schema_models import LeadershipRole, Member, Membership


class MemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, member_id: int) -> Member | None:
        result = await self.session.execute(select(Member).where(Member.member_id == member_id))
        return result.scalars().first()

    async def get_by_email(self, email: str) -> Member | None:
        result = await self.session.execute(select(Member).where(func.lower(Member.email) == email.lower()))
        return result.scalars().first()

    async def get_roles_for_year(self, member_id: int, term_year: int) -> Sequence[str]:
        result = await self.session.execute(
            select(LeadershipRole.position).where(
                LeadershipRole.member_id == member_id,
                LeadershipRole.term_year == term_year,
            )
        )
        return result.scalars().all()

    async def has_active_membership(self, member_id: int, today: date) -> bool:
        result = await self.session.execute(
            select(Membership.membership_id).where(
                Membership.member_id == member_id,
                Membership.payment_id.is_not(None),
                Membership.valid_from <= today,
                Membership.valid_until >= today,
            )
        )
        return result.scalars().first() is not None
