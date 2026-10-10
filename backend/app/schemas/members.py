import datetime

from pydantic import BaseModel, EmailStr, Field


class MemberCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=20)


class MemberUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)


class MemberResponse(BaseModel):
    member_id: int
    full_name: str
    email: str
    phone: str | None
    joined_on: datetime.date
    is_active: bool = False
    valid_until: datetime.date | None = None


class MemberLookupResponse(BaseModel):
    member_id: int
    full_name: str
    is_active: bool
    valid_until: datetime.date | None = None


class PaginatedMembers(BaseModel):
    items: list[MemberResponse]
    total: int
    limit: int
    offset: int


class MembershipCreate(BaseModel):
    member_id: int
    valid_from: datetime.date = Field(default_factory=datetime.date.today)
    valid_until: datetime.date | None = None
    dues_amount: str = "500.00"


class MembershipResponse(BaseModel):
    membership_id: int
    member_id: int
    valid_from: datetime.date
    valid_until: datetime.date
    dues_amount: str
    payment_id: int | None
    renewal_reminder_sent_at: datetime.datetime | None


class LeadershipRoleCreate(BaseModel):
    member_id: int
    position: str
    term_year: int


class LeadershipRoleResponse(BaseModel):
    leadership_role_id: int
    member_id: int
    position: str
    term_year: int
    member_name: str | None = None
