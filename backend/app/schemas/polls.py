from typing import Optional
from pydantic import BaseModel, ConfigDict


class PollOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    option_id: int
    label: str
    display_order: int
    votes: int


class PollResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    poll_id: int
    title: str
    description: Optional[str] = None
    is_active: bool
    total_votes: int
    options: list[PollOptionResponse]
    user_voted_option_id: Optional[int] = None


class PollVoteRequest(BaseModel):
    option_id: int
