import datetime
from decimal import Decimal
from typing import Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DuplicateEmailError, NotFoundError
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

    async def create(self, full_name: str, email: str, phone: str | None) -> Member:
        member = Member(
            full_name=full_name.strip(),
            email=email.strip().lower(),
            phone=phone.strip() if phone else None,
            joined_on=datetime.date.today(),
        )
        self.session.add(member)
        try:
            await self.session.flush()
            await self.session.refresh(member)
            return member
        except IntegrityError as err:
            await self.session.rollback()
            raise DuplicateEmailError() from err

    async def update(self, member_id: int, full_name: str | None, phone: str | None) -> Member:
        member = await self.get_by_id(member_id)
        if not member:
            raise NotFoundError("Member not found.")
        if full_name is not None:
            member.full_name = full_name.strip()
        if phone is not None:
            member.phone = phone.strip() if phone else None
        await self.session.flush()
        await self.session.refresh(member)
        return member

    async def search(
        self, query: str | None, active: bool | None, limit: int = 20, offset: int = 0
    ) -> tuple[Sequence[Member], int]:
        stmt = select(Member)
        if query:
            q = f"%{query.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(Member.full_name).like(q), func.lower(Member.email).like(q)))

        today = datetime.date.today()
        if active is True:
            stmt = stmt.join(Membership, Membership.member_id == Member.member_id).where(
                Membership.payment_id.is_not(None),
                Membership.valid_from <= today,
                Membership.valid_until >= today,
            )
        elif active is False:
            active_subquery = (
                select(Membership.member_id)
                .where(
                    Membership.payment_id.is_not(None),
                    Membership.valid_from <= today,
                    Membership.valid_until >= today,
                )
                .scalar_subquery()
            )
            stmt = stmt.where(Member.member_id.not_in(active_subquery))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        stmt = stmt.order_by(Member.member_id.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return result.scalars().all(), total

    async def lookup(self, query: str) -> tuple[Member, bool, datetime.date | None] | None:
        q = query.strip().lower()
        stmt = (
            select(Member)
            .where(or_(func.lower(Member.email) == q, Member.phone == query.strip()))
            .order_by(Member.member_id.desc())
        )
        result = await self.session.execute(stmt)
        member = result.scalars().first()
        if not member:
            return None

        today = datetime.date.today()
        membership_stmt = (
            select(Membership)
            .where(
                Membership.member_id == member.member_id,
                Membership.payment_id.is_not(None),
                Membership.valid_from <= today,
                Membership.valid_until >= today,
            )
            .order_by(Membership.valid_until.desc())
        )
        membership_res = await self.session.execute(membership_stmt)
        membership = membership_res.scalars().first()

        is_active = membership is not None
        valid_until = membership.valid_until if membership else None
        return member, is_active, valid_until

    async def get_roles_for_year(self, member_id: int, term_year: int) -> Sequence[str]:
        result = await self.session.execute(
            select(LeadershipRole.position).where(
                LeadershipRole.member_id == member_id,
                LeadershipRole.term_year == term_year,
            )
        )
        return result.scalars().all()

    async def has_active_membership(self, member_id: int, today: datetime.date) -> bool:
        result = await self.session.execute(
            select(Membership.membership_id).where(
                Membership.member_id == member_id,
                Membership.payment_id.is_not(None),
                Membership.valid_from <= today,
                Membership.valid_until >= today,
            )
        )
        return result.scalars().first() is not None

    async def get_latest_valid_until(self, member_id: int) -> datetime.date | None:
        result = await self.session.execute(
            select(Membership.valid_until)
            .where(Membership.member_id == member_id, Membership.payment_id.is_not(None))
            .order_by(Membership.valid_until.desc())
        )
        return result.scalars().first()

    # Memberships
    async def create_membership(
        self, member_id: int, valid_from: datetime.date, valid_until: datetime.date, dues_amount: Decimal
    ) -> Membership:
        membership = Membership(
            member_id=member_id,
            valid_from=valid_from,
            valid_until=valid_until,
            dues_amount=dues_amount,
        )
        self.session.add(membership)
        await self.session.flush()
        await self.session.refresh(membership)
        return membership

    async def get_memberships_for_member(self, member_id: int) -> Sequence[Membership]:
        result = await self.session.execute(
            select(Membership).where(Membership.member_id == member_id).order_by(Membership.valid_from.desc())
        )
        return result.scalars().all()

    async def get_membership_by_id(self, membership_id: int) -> Membership | None:
        result = await self.session.execute(select(Membership).where(Membership.membership_id == membership_id))
        return result.scalars().first()

    async def get_expiring_memberships(self, days: int = 30) -> Sequence[Membership]:
        today = datetime.date.today()
        target = today + datetime.timedelta(days=days)
        result = await self.session.execute(
            select(Membership).where(
                Membership.renewal_reminder_sent_at.is_(None),
                Membership.valid_until >= today,
                Membership.valid_until <= target,
            )
        )
        return result.scalars().all()

    # Leadership Roles
    async def get_leadership_roles(self, term_year: int | None = None) -> Sequence[tuple[LeadershipRole, str]]:
        stmt = (
            select(LeadershipRole, Member.full_name)
            .join(Member, Member.member_id == LeadershipRole.member_id)
            .order_by(LeadershipRole.term_year.desc(), LeadershipRole.position.asc())
        )
        if term_year:
            stmt = stmt.where(LeadershipRole.term_year == term_year)
        result = await self.session.execute(stmt)
        return result.all()  # type: ignore[return-value]

    async def add_leadership_role(self, member_id: int, position: str, term_year: int) -> LeadershipRole:
        role = LeadershipRole(member_id=member_id, position=position.strip(), term_year=term_year)
        self.session.add(role)
        await self.session.flush()
        await self.session.refresh(role)
        return role

    async def delete_leadership_role(self, leadership_role_id: int) -> bool:
        role = await self.session.get(LeadershipRole, leadership_role_id)
        if not role:
            return False
        await self.session.delete(role)
        await self.session.flush()
        return True
