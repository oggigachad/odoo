from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireAdmin, RequireOfficer, get_current_member, is_officer
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
    MembershipTypeCreate,
    MembershipTypeResponse,
    MemberUpdate,
    PaginatedMembers,
    SemesterCreate,
    SemesterResponse,
)
from app.services.member_service import MemberService

router = APIRouter(tags=["Members"])

check_is_officer = is_officer


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
    q: Annotated[Optional[str], Query(description="Search by name or email")] = None,
    active: Annotated[Optional[bool], Query(description="Filter by active dues")] = None,
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


# ---------------------------------------------------------------------
# Semesters (D-024, M-09)
# ---------------------------------------------------------------------
@router.get("/semesters", response_model=list[SemesterResponse])
async def list_semesters(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[SemesterResponse]:
    """List all semesters."""
    service = MemberService(db)
    return await service.list_semesters()


@router.post("/semesters", response_model=SemesterResponse, status_code=status.HTTP_201_CREATED)
async def create_semester(
    payload: SemesterCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SemesterResponse:
    """Officer creates a new semester."""
    service = MemberService(db)
    return await service.create_semester(payload)


# ---------------------------------------------------------------------
# Membership Types (D-024, M-09)
# ---------------------------------------------------------------------
@router.get("/membership-types", response_model=list[MembershipTypeResponse])
async def list_membership_types(
    all_types: Annotated[bool, Query(description="Include unoffered types")] = False,
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[MembershipTypeResponse]:
    """List membership types."""
    service = MemberService(db)
    return await service.list_membership_types(active_only=not all_types)


@router.post("/membership-types", response_model=MembershipTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_membership_type(
    payload: MembershipTypeCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MembershipTypeResponse:
    """Officer creates a new membership type."""
    service = MemberService(db)
    return await service.create_membership_type(payload)


@router.patch("/membership-types/{type_id}", response_model=MembershipTypeResponse)
async def update_membership_type(
    type_id: int,
    payload: MembershipTypeCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MembershipTypeResponse:
    """Officer updates a membership type."""
    service = MemberService(db)
    return await service.update_membership_type(
        type_id,
        name=payload.name,
        dues_amount=payload.dues_amount,
        is_offered=payload.is_offered,
    )


# ---------------------------------------------------------------------
# Memberships (D-024)
# ---------------------------------------------------------------------
@router.post("/memberships", response_model=MembershipResponse, status_code=status.HTTP_201_CREATED)
async def create_membership(
    payload: MembershipCreate,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MembershipResponse:
    """Member selects semester and type to buy (or officer creates for them)."""
    if current_user.member_id != payload.member_id and not check_is_officer(current_user):
        raise ForbiddenError("You can only purchase membership for yourself.")
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


# ---------------------------------------------------------------------
# Leadership
# ---------------------------------------------------------------------
@router.get("/leadership", response_model=list[LeadershipRoleResponse])
async def list_leadership_roles(
    term_year: Annotated[Optional[int], Query(description="Filter by term year")] = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[LeadershipRoleResponse]:
    """List leadership roles for the year."""
    service = MemberService(db)
    return await service.list_leadership(term_year)


@router.post("/leadership", response_model=LeadershipRoleResponse, status_code=status.HTTP_201_CREATED)
async def add_leadership_role(
    payload: LeadershipRoleCreate,
    _: Annotated[MemberInfo, Depends(RequireAdmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadershipRoleResponse:
    """Admin assigns a position (Officer, Treasurer, ...) to a member."""
    service = MemberService(db)
    return await service.add_leadership(payload)


@router.delete("/leadership/{leadership_role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_leadership_role(
    leadership_role_id: int,
    _: Annotated[MemberInfo, Depends(RequireAdmin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Admin removes a position."""
    service = MemberService(db)
    await service.remove_leadership(leadership_role_id)
