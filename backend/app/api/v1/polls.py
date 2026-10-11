from typing import Annotated, Optional

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_member, get_optional_member
from app.core.database import get_db
from app.core.errors import ForbiddenError, NotFoundError
from app.schemas.auth import MemberInfo
from app.schemas.polls import PollResponse, PollVoteRequest
from app.services.poll_service import PollService

router = APIRouter(tags=["Polls"])


@router.get("/polls/active", response_model=Optional[PollResponse])
async def get_active_poll(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[Optional[MemberInfo], Depends(get_optional_member)] = None,
) -> Optional[PollResponse]:
    """Retrieve the currently active governance poll, vote tallies, and user's voted option."""
    service = PollService(db)
    member_id = user.member_id if user else None
    return await service.get_active_poll(member_id)


@router.post("/polls/{poll_id}/vote", response_model=PollResponse)
async def cast_poll_vote(
    poll_id: int,
    payload: PollVoteRequest,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PollResponse:
    """Active verified members can cast their ballot vote, securely persisted in PostgreSQL."""
    # Ensure voter is an official member
    if not (current_user.is_active or current_user.role != "Guest"):
        raise ForbiddenError("Only verified active club members can cast governance votes.")

    service = PollService(db)
    return await service.cast_vote(poll_id, payload.option_id, current_user.member_id)
