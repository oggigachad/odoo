from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer, RequireOperator, get_current_member, is_officer
from app.core.database import get_db
from app.schemas.auth import MemberInfo
from app.schemas.fundraisers import (
    FundraiserCreate,
    FundraiserProgressResponse,
    FundraiserResponse,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)
from app.services.fundraiser_service import FundraiserService

router = APIRouter(tags=["Fundraisers"])

check_is_officer = is_officer


@router.get("/fundraisers", response_model=list[FundraiserResponse])
async def list_fundraisers(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[FundraiserResponse]:
    """Public list of fundraisers."""
    service = FundraiserService(db)
    return await service.list_fundraisers()


@router.post("/fundraisers", response_model=FundraiserResponse, status_code=status.HTTP_201_CREATED)
async def create_fundraiser(
    payload: FundraiserCreate,
    _: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FundraiserResponse:
    """Officer creates a fundraiser event/campaign."""
    service = FundraiserService(db)
    return await service.create_fundraiser(payload)


@router.get("/fundraisers/{fundraiser_id}", response_model=FundraiserResponse)
async def get_fundraiser(
    fundraiser_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FundraiserResponse:
    """Get fundraiser details."""
    service = FundraiserService(db)
    return await service.get_fundraiser(fundraiser_id)


@router.get("/fundraisers/{fundraiser_id}/progress", response_model=FundraiserProgressResponse)
async def get_fundraiser_progress(
    fundraiser_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FundraiserProgressResponse:
    """Tasks done vs total, money raised vs goal."""
    service = FundraiserService(db)
    return await service.get_progress(fundraiser_id)


@router.post("/fundraisers/{fundraiser_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    fundraiser_id: int,
    payload: TaskCreate,
    _: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    """Officer creates a volunteer task."""
    service = FundraiserService(db)
    return await service.create_task(fundraiser_id, payload)


@router.get("/fundraisers/{fundraiser_id}/tasks", response_model=list[TaskResponse])
async def list_tasks(
    fundraiser_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TaskResponse]:
    """List volunteer tasks for a fundraiser."""
    service = FundraiserService(db)
    return await service.list_tasks(fundraiser_id)


@router.patch("/fundraisers/{fundraiser_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    fundraiser_id: int,
    task_id: int,
    payload: TaskUpdate,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    """Assignee updates task status; officer can update all task fields."""
    is_officer = check_is_officer(current_user)
    service = FundraiserService(db)
    return await service.update_task(
        task_id=task_id,
        data=payload,
        caller_member_id=current_user.member_id,
        is_officer=is_officer,
    )
