import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FundraiserCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    event_date: Optional[datetime.date] = None
    goal_amount: Optional[str] = None


class FundraiserResponse(BaseModel):
    fundraiser_id: int
    title: str
    description: Optional[str]
    event_date: Optional[datetime.date]
    goal_amount: Optional[str]


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    due_date: Optional[datetime.date] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    status: Optional[str] = None  # todo, in_progress, done
    due_date: Optional[datetime.date] = None


class TaskResponse(BaseModel):
    task_id: int
    fundraiser_id: int
    title: str
    description: Optional[str]
    assigned_to: Optional[int]
    assignee_name: Optional[str] = None
    status: str
    due_date: Optional[datetime.date]


class FundraiserProgressResponse(BaseModel):
    fundraiser_id: int
    title: str
    goal_amount: Optional[str]
    tasks_total: int
    tasks_done: int
    amount_raised: str
