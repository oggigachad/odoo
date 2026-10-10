import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class MemberCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)


class MemberUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)


class MemberResponse(BaseModel):
    member_id: int
    full_name: str
    email: str
    phone: Optional[str]
    joined_on: datetime.date
    is_active: bool = False
    valid_until: Optional[datetime.date] = None
    semester_name: Optional[str] = None
    membership_type: Optional[str] = None
    student_id: Optional[str] = None


class MemberLookupResponse(BaseModel):
    member_id: int
    full_name: str
    email: Optional[str] = None
    is_active: bool
    valid_until: Optional[datetime.date] = None
    semester_name: Optional[str] = None
    membership_type: Optional[str] = None


class PaginatedMembers(BaseModel):
    items: list[MemberResponse]
    total: int
    limit: int
    offset: int


class SemesterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    starts_on: datetime.date
    ends_on: datetime.date


class SemesterResponse(BaseModel):
    semester_id: int
    name: str
    starts_on: datetime.date
    ends_on: datetime.date


class MembershipTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    dues_amount: str = "500.00"
    is_offered: bool = True


class MembershipTypeResponse(BaseModel):
    membership_type_id: int
    name: str
    dues_amount: str
    is_offered: bool


class MembershipCreate(BaseModel):
    member_id: int
    semester_id: int
    membership_type_id: int


class MembershipResponse(BaseModel):
    membership_id: int
    member_id: int
    semester_id: int
    membership_type_id: int
    dues_amount: str
    payment_id: Optional[int] = None
    renewal_reminder_sent_at: Optional[datetime.datetime] = None
    semester_name: Optional[str] = None
    membership_type_name: Optional[str] = None
    valid_until: Optional[datetime.date] = None


class LeadershipRoleCreate(BaseModel):
    member_id: int
    position: str
    term_year: int

    @field_validator("position")
    @classmethod
    def _known_position(cls, v: str) -> str:
        from app.api.deps import ASSIGNABLE_POSITIONS

        match = next((p for p in ASSIGNABLE_POSITIONS if p.lower() == v.strip().lower()), None)
        if not match:
            raise ValueError("Position must be one of: " + ", ".join(ASSIGNABLE_POSITIONS))
        return match


class LeadershipRoleResponse(BaseModel):
    leadership_role_id: int
    member_id: int
    position: str
    term_year: int
    member_name: Optional[str] = None
