import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.helpers import format_money, to_decimal
from app.repositories.member_repo import MemberRepository
from app.schemas.members import (
    LeadershipRoleCreate,
    LeadershipRoleResponse,
    MemberCreate,
    MemberLookupResponse,
    MemberResponse,
    MembershipCreate,
    MembershipResponse,
    MembershipTypeCreate,
    MembershipTypeResponse,
    MemberUpdate,
    PaginatedMembers,
    SemesterCreate,
    SemesterResponse,
)


class MemberService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MemberRepository(session)

    async def create_member(self, data: MemberCreate) -> MemberResponse:
        member = await self.repo.create(data.full_name, data.email, data.phone)
        await self.session.commit()
        return MemberResponse(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            phone=member.phone,
            joined_on=member.joined_on,
            is_active=False,
            valid_until=None,
        )

    async def get_member(self, member_id: int) -> MemberResponse:
        member = await self.repo.get_by_id(member_id)
        if not member:
            raise NotFoundError("Member not found.")

        is_active, valid_until, sem_name, mtype_name = await self.repo.get_membership_info(member_id)

        return MemberResponse(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            phone=member.phone,
            joined_on=member.joined_on,
            is_active=is_active,
            valid_until=valid_until,
            semester_name=sem_name,
            membership_type=mtype_name,
            student_id=member.student_id,
        )

    async def update_member(self, member_id: int, data: MemberUpdate) -> MemberResponse:
        member = await self.repo.update(member_id, data.full_name, data.phone)
        await self.session.commit()

        is_active, valid_until, sem_name, mtype_name = await self.repo.get_membership_info(member_id)

        return MemberResponse(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            phone=member.phone,
            joined_on=member.joined_on,
            is_active=is_active,
            valid_until=valid_until,
            semester_name=sem_name,
            membership_type=mtype_name,
            student_id=member.student_id,
        )

    async def search_members(
        self, query: Optional[str], active: Optional[bool], limit: int, offset: int
    ) -> PaginatedMembers:
        members, total = await self.repo.search(query, active, limit, offset)
        items: list[MemberResponse] = []
        for m in members:
            is_active, valid_until, sem_name, mtype_name = await self.repo.get_membership_info(m.member_id)
            items.append(
                MemberResponse(
                    member_id=m.member_id,
                    full_name=m.full_name,
                    email=m.email,
                    phone=m.phone,
                    joined_on=m.joined_on,
                    is_active=is_active,
                    valid_until=valid_until,
                    semester_name=sem_name,
                    membership_type=mtype_name,
                    student_id=m.student_id,
                )
            )
        return PaginatedMembers(items=items, total=total, limit=limit, offset=offset)

    async def lookup_member(self, query: str) -> MemberLookupResponse:
        res = await self.repo.lookup(query)
        if not res:
            raise NotFoundError("Member not found.")
        member, is_active, valid_until, sem_name, mtype_name = res
        return MemberLookupResponse(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            is_active=is_active,
            valid_until=valid_until,
            semester_name=sem_name,
            membership_type=mtype_name,
        )

    # -----------------------------------------------------------------
    # Semesters (D-024)
    # -----------------------------------------------------------------
    async def create_semester(self, data: SemesterCreate) -> SemesterResponse:
        semester = await self.repo.create_semester(data.name, data.starts_on, data.ends_on)
        await self.session.commit()
        return SemesterResponse(
            semester_id=semester.semester_id,
            name=semester.name,
            starts_on=semester.starts_on,
            ends_on=semester.ends_on,
        )

    async def list_semesters(self) -> list[SemesterResponse]:
        semesters = await self.repo.get_semesters()
        return [
            SemesterResponse(
                semester_id=s.semester_id,
                name=s.name,
                starts_on=s.starts_on,
                ends_on=s.ends_on,
            )
            for s in semesters
        ]

    # -----------------------------------------------------------------
    # Membership Types (D-024)
    # -----------------------------------------------------------------
    async def create_membership_type(self, data: MembershipTypeCreate) -> MembershipTypeResponse:
        dues = to_decimal(data.dues_amount)
        mtype = await self.repo.create_membership_type(data.name, dues, data.is_offered)
        await self.session.commit()
        return MembershipTypeResponse(
            membership_type_id=mtype.membership_type_id,
            name=mtype.name,
            dues_amount=format_money(mtype.dues_amount),
            is_offered=mtype.is_offered,
        )

    async def list_membership_types(self, active_only: bool = False) -> list[MembershipTypeResponse]:
        types = await self.repo.get_membership_types(active_only=active_only)
        return [
            MembershipTypeResponse(
                membership_type_id=t.membership_type_id,
                name=t.name,
                dues_amount=format_money(t.dues_amount),
                is_offered=t.is_offered,
            )
            for t in types
        ]

    async def update_membership_type(
        self,
        membership_type_id: int,
        name: Optional[str] = None,
        dues_amount: Optional[str] = None,
        is_offered: Optional[bool] = None,
    ) -> MembershipTypeResponse:
        dues_dec: Optional[Decimal] = to_decimal(dues_amount) if dues_amount else None
        mtype = await self.repo.update_membership_type(membership_type_id, name, dues_dec, is_offered)
        await self.session.commit()
        return MembershipTypeResponse(
            membership_type_id=mtype.membership_type_id,
            name=mtype.name,
            dues_amount=format_money(mtype.dues_amount),
            is_offered=mtype.is_offered,
        )

    # -----------------------------------------------------------------
    # Memberships
    # -----------------------------------------------------------------
    async def create_membership(self, data: MembershipCreate) -> MembershipResponse:
        member = await self.repo.get_by_id(data.member_id)
        if not member:
            raise NotFoundError("Member not found.")

        membership = await self.repo.create_membership(
            member_id=data.member_id,
            semester_id=data.semester_id,
            membership_type_id=data.membership_type_id,
        )
        await self.session.commit()

        semester = await self.repo.get_semester_by_id(data.semester_id)
        mtype = await self.repo.get_membership_type_by_id(data.membership_type_id)

        return MembershipResponse(
            membership_id=membership.membership_id,
            member_id=membership.member_id,
            semester_id=membership.semester_id,
            membership_type_id=membership.membership_type_id,
            dues_amount=format_money(membership.dues_amount),
            payment_id=membership.payment_id,
            renewal_reminder_sent_at=membership.renewal_reminder_sent_at,
            semester_name=semester.name if semester else None,
            membership_type_name=mtype.name if mtype else None,
            valid_until=semester.ends_on if semester else None,
        )

    async def get_memberships(self, member_id: int) -> list[MembershipResponse]:
        rows = await self.repo.get_memberships_for_member(member_id)
        return [
            MembershipResponse(
                membership_id=ms.membership_id,
                member_id=ms.member_id,
                semester_id=ms.semester_id,
                membership_type_id=ms.membership_type_id,
                dues_amount=format_money(ms.dues_amount),
                payment_id=ms.payment_id,
                renewal_reminder_sent_at=ms.renewal_reminder_sent_at,
                semester_name=sem.name,
                membership_type_name=mtype.name,
                valid_until=sem.ends_on,
            )
            for ms, sem, mtype in rows
        ]

    # -----------------------------------------------------------------
    # Leadership
    # -----------------------------------------------------------------
    async def list_leadership(self, term_year: Optional[int] = None) -> list[LeadershipRoleResponse]:
        roles = await self.repo.get_leadership_roles(term_year)
        return [
            LeadershipRoleResponse(
                leadership_role_id=r.leadership_role_id,
                member_id=r.member_id,
                position=r.position,
                term_year=r.term_year,
                member_name=name,
            )
            for r, name in roles
        ]

    async def add_leadership(self, data: LeadershipRoleCreate) -> LeadershipRoleResponse:
        member = await self.repo.get_by_id(data.member_id)
        if not member:
            raise NotFoundError("Member not found.")

        role = await self.repo.add_leadership_role(data.member_id, data.position, data.term_year)
        await self.session.commit()
        return LeadershipRoleResponse(
            leadership_role_id=role.leadership_role_id,
            member_id=role.member_id,
            position=role.position,
            term_year=role.term_year,
            member_name=member.full_name,
        )

    async def remove_leadership(self, leadership_role_id: int) -> None:
        from sqlalchemy import text

        row = (
            await self.session.execute(
                text("SELECT position, term_year FROM leadership_roles WHERE leadership_role_id=:i"), {"i": leadership_role_id}
            )
        ).first()
        if row and row[0].lower() == "admin":
            admins = (
                await self.session.execute(
                    text("SELECT COUNT(*) FROM leadership_roles WHERE LOWER(position)='admin' AND term_year=:y"), {"y": row[1]}
                )
            ).scalar_one()
            if admins <= 1:
                from app.core.errors import ValidationError

                raise ValidationError("You cannot remove the last Admin.")
        deleted = await self.repo.delete_leadership_role(leadership_role_id)
        if not deleted:
            raise NotFoundError("Leadership role not found.")
        await self.session.commit()
