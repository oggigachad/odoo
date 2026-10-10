import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class TicketTypeCreate(BaseModel):
    name: str = Field(default="General", min_length=1, max_length=50)
    member_price: str = "0.00"
    non_member_price: str = "100.00"
    seat_limit: int = Field(..., gt=0)
    non_member_seat_limit: int = Field(..., ge=0)


class TicketTypeResponse(BaseModel):
    ticket_type_id: int
    event_id: int
    name: str
    member_price: str
    non_member_price: str
    seat_limit: int
    non_member_seat_limit: int
    sold: int = 0
    seats_left: int = 0
    non_member_sold: int = 0
    non_member_seats_left: int = 0


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    venue: Optional[str] = None
    starts_at: datetime.datetime
    ticket_types: Optional[list[TicketTypeCreate]] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    venue: Optional[str] = None
    starts_at: Optional[datetime.datetime] = None


class EventResponse(BaseModel):
    event_id: int
    title: str
    description: Optional[str]
    venue: Optional[str]
    starts_at: datetime.datetime
    ticket_types: list[TicketTypeResponse] = []


class TicketHolderInput(BaseModel):
    holder_name: str = Field(..., min_length=1, max_length=100)
    holder_email: Optional[EmailStr] = None


class TicketPurchaseRequest(BaseModel):
    ticket_type_id: int
    holders: list[TicketHolderInput] = Field(..., min_length=1, max_length=10)


class TicketResponse(BaseModel):
    ticket_id: int
    ticket_type_id: int
    member_id: Optional[int]
    holder_name: str
    holder_email: Optional[str]
    price_paid: str
    ticket_code: str
    purchased_at: datetime.datetime
    checked_in_at: Optional[datetime.datetime]
    payment_id: Optional[int] = None
    is_valid: bool = False


class TicketPurchaseResponse(BaseModel):
    tickets: list[TicketResponse]
    total_amount: str
    requires_payment: bool
    order_id: Optional[str] = None


class CheckInRequest(BaseModel):
    ticket_code: str
    event_id: int


class CheckInResponse(BaseModel):
    status: str
    ticket_code: str
    holder_name: str
    event_title: str
    checked_in_at: datetime.datetime


class EventSummaryResponse(BaseModel):
    event_id: int
    title: str
    tickets_sold: int
    attended: int
    ticket_revenue: str
