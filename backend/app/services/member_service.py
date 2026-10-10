import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
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
    MemberUpdate,
    PaginatedMembers,
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

        today = datetime.date.today()
        is_active = await self.repo.has_active_membership(member_id, today)
        valid_until = await self.repo.get_latest_valid_until(member_id)

        return MemberResponse(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            phone=member.phone,
            joined_on=member.joined_on,
            is_active=is_active,
            valid_until=valid_until,
        )

    async def update_member(self, member_id: int, data: MemberUpdate) -> MemberResponse:
        member = await self.repo.update(member_id, data.full_name, data.phone)
        await self.session.commit()

        today = datetime.date.today()
        is_active = await self.repo.has_active_membership(member_id, today)
        valid_until = await self.repo.get_latest_valid_until(member_id)

        return MemberResponse(
            member_id=member.member_id,
            full_name=member.full_name,
            email=member.email,
            phone=member.phone,
            joined_on=member.joined_on,
            is_active=is_active,
            valid_until=valid_until,
        )

    async def search_members(self, query: str | None, active: bool | None, limit: int, offset: int) -> PaginatedMembers:
        members, total = await self.repo.search(query, active, limit, offset)
        today = datetime.date.today()
        items: list[MemberResponse] = []
        for m in members:
            is_active = await self.repo.has_active_membership(m.member_id, today)
            valid_until = await self.repo.get_latest_valid_until(m.member_id)
            items.append(
                MemberResponse(
                    member_id=m.member_id,
                    full_name=m.full_name,
                    email=m.email,
                    phone=m.phone,
                    joined_on=m.joined_on,
                    is_active=is_active,
                    valid_until=valid_until,
                )
            )
        return PaginatedMembers(items=items, total=total, limit=limit, offset=offset)

    async def lookup_member(self, query: str) -> MemberLookupResponse:
        res = await self.repo.lookup(query)
        if not res:
            raise NotFoundError("Member not found.")
        member, is_active, valid_until = res
        return MemberLookupResponse(
            member_id=member.member_id,
            full_name=member.full_name,
            is_active=is_active,
            valid_until=valid_until,
        )

    # Memberships
    async def create_membership(self, data: MembershipCreate) -> MembershipResponse:
        member = await self.repo.get_by_id(data.member_id)
        if not member:
            raise NotFoundError("Member not found.")

        valid_from = data.valid_from or datetime.date.today()
        # Default expiry to Dec 31 of valid_from year per PRD
        valid_until = data.valid_until or datetime.date(valid_from.year, 12, 31)

        if valid_until <= valid_from:
            raise ValidationError("valid_until must be strictly after valid_from.")

        dues_amount = to_decimal(data.dues_amount)
        membership = await self.repo.create_membership(data.member_id, valid_from, valid_until, dues_amount)
        await self.session.commit()

        return MembershipResponse(
            membership_id=membership.membership_id,
            member_id=membership.member_id,
            valid_from=membership.valid_from,
            valid_until=membership.valid_until,
            dues_amount=format_money(membership.dues_amount),
            payment_id=membership.payment_id,
            renewal_reminder_sent_at=membership.renewal_reminder_sent_at,
        )

    async def get_memberships(self, member_id: int) -> list[MembershipResponse]:
        memberships = await self.repo.get_memberships_for_member(member_id)
        return [
            MembershipResponse(
                membership_id=m.membership_id,
                member_id=m.member_id,
                valid_from=m.valid_from,
                valid_until=m.valid_until,
                dues_amount=format_money(m.dues_amount),
                payment_id=m.payment_id,
                renewal_reminder_sent_at=m.renewal_reminder_sent_at,
            )
            for m in memberships
        ]

    # Leadership
    async def list_leadership(self, term_year: int | None = None) -> list[LeadershipRoleResponse]:
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
        deleted = await self.repo.delete_leadership_role(leadership_role_id)
        if not deleted:
            raise NotFoundError("Leadership role not found.")
        await self.session.commit()
