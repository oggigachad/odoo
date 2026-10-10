import datetime
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    DuplicateEmailError,
    MembershipExistsError,
    MembershipTypeNotOfferedError,
    NotFoundError,
    SemesterOverlapError,
)
from app.models.schema_models import LeadershipRole, Member, Membership, MembershipType, Semester


class MemberRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_id(self, member_id: int) -> Optional[Member]:
        result = await self.session.execute(select(Member).where(Member.member_id == member_id))
        return result.scalars().first()

    async def get_by_email(self, email: str) -> Optional[Member]:
        result = await self.session.execute(select(Member).where(func.lower(Member.email) == email.lower()))
        return result.scalars().first()

    async def create(self, full_name: str, email: str, phone: Optional[str]) -> Member:
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

    async def update(self, member_id: int, full_name: Optional[str], phone: Optional[str]) -> Member:
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
        self, query: Optional[str], active: Optional[bool], limit: int = 20, offset: int = 0
    ) -> tuple[Sequence[Member], int]:
        stmt = select(Member)
        if query:
            q = f"%{query.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(Member.full_name).like(q), func.lower(Member.email).like(q)))

        today = datetime.date.today()
        if active is True:
            stmt = (
                stmt.join(Membership, Membership.member_id == Member.member_id)
                .join(Semester, Semester.semester_id == Membership.semester_id)
                .where(
                    Membership.payment_id.is_not(None),
                    Semester.starts_on <= today,
                    Semester.ends_on >= today,
                )
            )
        elif active is False:
            active_subquery = (
                select(Membership.member_id)
                .join(Semester, Semester.semester_id == Membership.semester_id)
                .where(
                    Membership.payment_id.is_not(None),
                    Semester.starts_on <= today,
                    Semester.ends_on >= today,
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

    async def lookup(
        self, query: str
    ) -> Optional[tuple[Member, bool, Optional[datetime.date], Optional[str], Optional[str]]]:
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
        # Find active or latest paid membership with semester and type
        membership_stmt = (
            select(Membership, Semester, MembershipType)
            .join(Semester, Semester.semester_id == Membership.semester_id)
            .join(MembershipType, MembershipType.membership_type_id == Membership.membership_type_id)
            .where(
                Membership.member_id == member.member_id,
                Membership.payment_id.is_not(None),
            )
            .order_by(Semester.ends_on.desc())
        )
        membership_res = await self.session.execute(membership_stmt)
        row = membership_res.first()

        if row:
            ms, sem, mt = row
            is_active = sem.starts_on <= today <= sem.ends_on
            return member, is_active, sem.ends_on, sem.name, mt.name
        return member, False, None, None, None

    async def get_membership_info(
        self, member_id: int
    ) -> tuple[bool, Optional[datetime.date], Optional[str], Optional[str]]:
        today = datetime.date.today()
        stmt = (
            select(Membership, Semester, MembershipType)
            .join(Semester, Semester.semester_id == Membership.semester_id)
            .join(MembershipType, MembershipType.membership_type_id == Membership.membership_type_id)
            .where(
                Membership.member_id == member_id,
                Membership.payment_id.is_not(None),
            )
            .order_by(Semester.ends_on.desc())
        )
        res = await self.session.execute(stmt)
        row = res.first()
        if row:
            ms, sem, mt = row
            is_active = sem.starts_on <= today <= sem.ends_on
            return is_active, sem.ends_on, sem.name, mt.name
        return False, None, None, None

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
            select(Membership.membership_id)
            .join(Semester, Semester.semester_id == Membership.semester_id)
            .where(
                Membership.member_id == member_id,
                Membership.payment_id.is_not(None),
                Semester.starts_on <= today,
                Semester.ends_on >= today,
            )
        )
        return result.scalars().first() is not None

    async def get_latest_valid_until(self, member_id: int) -> Optional[datetime.date]:
        result = await self.session.execute(
            select(Semester.ends_on)
            .join(Membership, Membership.semester_id == Semester.semester_id)
            .where(Membership.member_id == member_id, Membership.payment_id.is_not(None))
            .order_by(Semester.ends_on.desc())
        )
        return result.scalars().first()

    # -----------------------------------------------------------------
    # Semesters (D-024)
    # -----------------------------------------------------------------
    async def create_semester(self, name: str, starts_on: datetime.date, ends_on: datetime.date) -> Semester:
        if ends_on <= starts_on:
            raise SemesterOverlapError("Semester end date must be after start date.")
        semester = Semester(name=name.strip(), starts_on=starts_on, ends_on=ends_on)
        self.session.add(semester)
        try:
            await self.session.flush()
            await self.session.refresh(semester)
            return semester
        except IntegrityError as err:
            await self.session.rollback()
            raise SemesterOverlapError("Semester name already exists or dates overlap an existing semester.") from err

    async def get_semesters(self) -> Sequence[Semester]:
        result = await self.session.execute(select(Semester).order_by(Semester.starts_on.desc()))
        return result.scalars().all()

    async def get_semester_by_id(self, semester_id: int) -> Optional[Semester]:
        return await self.session.get(Semester, semester_id)

    # -----------------------------------------------------------------
    # Membership Types (D-024)
    # -----------------------------------------------------------------
    async def create_membership_type(self, name: str, dues_amount: Decimal, is_offered: bool = True) -> MembershipType:
        mtype = MembershipType(name=name.strip(), dues_amount=dues_amount, is_offered=is_offered)
        self.session.add(mtype)
        try:
            await self.session.flush()
            await self.session.refresh(mtype)
            return mtype
        except IntegrityError as err:
            await self.session.rollback()
            raise NotFoundError("Membership type with this name already exists.") from err

    async def get_membership_types(self, active_only: bool = False) -> Sequence[MembershipType]:
        stmt = select(MembershipType)
        if active_only:
            stmt = stmt.where(MembershipType.is_offered.is_(True))
        stmt = stmt.order_by(MembershipType.dues_amount.asc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_membership_type_by_id(self, membership_type_id: int) -> Optional[MembershipType]:
        return await self.session.get(MembershipType, membership_type_id)

    async def update_membership_type(
        self,
        membership_type_id: int,
        name: Optional[str] = None,
        dues_amount: Optional[Decimal] = None,
        is_offered: Optional[bool] = None,
    ) -> MembershipType:
        mtype = await self.get_membership_type_by_id(membership_type_id)
        if not mtype:
            raise NotFoundError("Membership type not found.")
        if name is not None:
            mtype.name = name.strip()
        if dues_amount is not None:
            mtype.dues_amount = dues_amount
        if is_offered is not None:
            mtype.is_offered = is_offered
        await self.session.flush()
        await self.session.refresh(mtype)
        return mtype

    # -----------------------------------------------------------------
    # Memberships (D-024)
    # -----------------------------------------------------------------
    async def create_membership(
        self,
        member_id: int,
        semester_id: int,
        membership_type_id: int,
    ) -> Membership:
        # Check type is offered
        mtype = await self.get_membership_type_by_id(membership_type_id)
        if not mtype or not mtype.is_offered:
            raise MembershipTypeNotOfferedError()

        # Check semester exists
        semester = await self.get_semester_by_id(semester_id)
        if not semester:
            raise NotFoundError("Semester not found.")

        # Check if already exists for member and semester
        existing = await self.session.execute(
            select(Membership).where(
                Membership.member_id == member_id,
                Membership.semester_id == semester_id,
            )
        )
        prior = existing.scalars().first()
        if prior and prior.payment_id is not None:
            raise MembershipExistsError()
        if prior:
            # an earlier attempt was never paid (cancelled/failed): reuse it with the current choice and price
            prior.membership_type_id = membership_type_id
            prior.dues_amount = mtype.dues_amount
            await self.session.flush()
            await self.session.refresh(prior)
            return prior

        membership = Membership(
            member_id=member_id,
            semester_id=semester_id,
            membership_type_id=membership_type_id,
            dues_amount=mtype.dues_amount,  # Snapshot price at purchase
        )
        self.session.add(membership)
        try:
            await self.session.flush()
            await self.session.refresh(membership)
            return membership
        except IntegrityError as err:
            await self.session.rollback()
            raise MembershipExistsError() from err

    async def get_memberships_for_member(self, member_id: int) -> Sequence[tuple[Membership, Semester, MembershipType]]:
        stmt = (
            select(Membership, Semester, MembershipType)
            .join(Semester, Semester.semester_id == Membership.semester_id)
            .join(MembershipType, MembershipType.membership_type_id == Membership.membership_type_id)
            .where(Membership.member_id == member_id)
            .order_by(Semester.starts_on.desc())
        )
        result = await self.session.execute(stmt)
        return result.all()

    async def get_membership_by_id(self, membership_id: int) -> Optional[Membership]:
        return await self.session.get(Membership, membership_id)

    async def get_expiring_memberships(self, days: int = 30) -> Sequence[Membership]:
        today = datetime.date.today()
        target = today + datetime.timedelta(days=days)
        # Paid, renewal reminder not sent, ends within 30 days, and no paid later semester
        stmt = (
            select(Membership)
            .join(Semester, Semester.semester_id == Membership.semester_id)
            .where(
                Membership.payment_id.is_not(None),
                Membership.renewal_reminder_sent_at.is_(None),
                Semester.ends_on >= today,
                Semester.ends_on <= target,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    # -----------------------------------------------------------------
    # Leadership Roles
    # -----------------------------------------------------------------
    async def get_leadership_roles(self, term_year: Optional[int] = None) -> Sequence[tuple[LeadershipRole, str]]:
        stmt = (
            select(LeadershipRole, Member.full_name)
            .join(Member, Member.member_id == LeadershipRole.member_id)
            .order_by(LeadershipRole.term_year.desc(), LeadershipRole.position.asc())
        )
        if term_year:
            stmt = stmt.where(LeadershipRole.term_year == term_year)
        result = await self.session.execute(stmt)
        return result.all()

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
