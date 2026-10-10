from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer, get_current_member
from app.core.database import get_db
from app.core.errors import ForbiddenError
from app.schemas.auth import MemberInfo
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
from app.services.member_service import MemberService

router = APIRouter(tags=["Members"])

OFFICER_ROLES = {"president", "vice president", "secretary", "treasurer", "officer"}


def check_is_officer(user: MemberInfo) -> bool:
    return any(r.lower() in OFFICER_ROLES for r in user.roles)


@router.post("/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def create_member(
    payload: MemberCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberResponse:
    """Self sign-up or officer creation of a new member."""
    service = MemberService(db)
    return await service.create_member(payload)


@router.get("/members", response_model=PaginatedMembers)
async def list_members(
    q: Annotated[str | None, Query(description="Search by name or email")] = None,
    active: Annotated[bool | None, Query(description="Filter by active dues")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    _: Annotated[MemberInfo, Depends(RequireOfficer)] = None,  # type: ignore[assignment]
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> PaginatedMembers:
    """Officer search for members."""
    service = MemberService(db)
    return await service.search_members(q, active, limit, offset)


@router.get("/members/lookup", response_model=MemberLookupResponse)
async def lookup_member(
    q: Annotated[str, Query(description="Email or phone to verify at the door")],
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberLookupResponse:
    """Fast door lookup to verify active membership."""
    service = MemberService(db)
    return await service.lookup_member(q)


@router.get("/members/{member_id}", response_model=MemberResponse)
async def get_member(
    member_id: int,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberResponse:
    """Self or Officer view member profile."""
    if current_user.member_id != member_id and not check_is_officer(current_user):
        raise ForbiddenError("You can only access your own profile.")
    service = MemberService(db)
    return await service.get_member(member_id)


@router.patch("/members/{member_id}", response_model=MemberResponse)
async def update_member(
    member_id: int,
    payload: MemberUpdate,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MemberResponse:
    """Self or Officer update name and phone."""
    if current_user.member_id != member_id and not check_is_officer(current_user):
        raise ForbiddenError("You can only edit your own profile.")
    service = MemberService(db)
    return await service.update_member(member_id, payload)


# Memberships
@router.post("/memberships", response_model=MembershipResponse, status_code=status.HTTP_201_CREATED)
async def create_membership(
    payload: MembershipCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MembershipResponse:
    """Officer creates an unpaid membership."""
    service = MemberService(db)
    return await service.create_membership(payload)


@router.get("/members/{member_id}/memberships", response_model=list[MembershipResponse])
async def list_member_memberships(
    member_id: int,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MembershipResponse]:
    """Self or Officer view membership history."""
    if current_user.member_id != member_id and not check_is_officer(current_user):
        raise ForbiddenError("You can only view your own memberships.")
    service = MemberService(db)
    return await service.get_memberships(member_id)


# Leadership
@router.get("/leadership", response_model=list[LeadershipRoleResponse])
async def list_leadership_roles(
    term_year: Annotated[int | None, Query(description="Filter by term year")] = None,
    _: Annotated[MemberInfo, Depends(RequireOfficer)] = None,  # type: ignore[assignment]
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[LeadershipRoleResponse]:
    """Officer list leadership roles."""
    service = MemberService(db)
    return await service.list_leadership(term_year)


@router.post("/leadership", response_model=LeadershipRoleResponse, status_code=status.HTTP_201_CREATED)
async def add_leadership_role(
    payload: LeadershipRoleCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadershipRoleResponse:
    """Officer add leadership role."""
    service = MemberService(db)
    return await service.add_leadership(payload)


@router.delete("/leadership/{leadership_role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_leadership_role(
    leadership_role_id: int,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Officer remove leadership role."""
    service = MemberService(db)
    await service.remove_leadership(leadership_role_id)
