import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class TicketTypeCreate(BaseModel):
    name: str = Field(default="General", min_length=1, max_length=50)
    description: Optional[str] = Field(default=None, max_length=300)
    member_price: str = "0.00"
    non_member_price: str = "100.00"
    seat_limit: int = Field(..., gt=0)
    non_member_seat_limit: int = Field(..., ge=0)
    # Per-person caps set by an admin/officer (None = no cap)
    max_per_member: Optional[int] = Field(default=None, gt=0)
    max_per_guest: Optional[int] = Field(default=None, gt=0)


class TicketTypeResponse(BaseModel):
    ticket_type_id: int
    event_id: int
    name: str
    description: Optional[str] = None
    member_price: str
    non_member_price: str
    seat_limit: int
    non_member_seat_limit: int
    sold: int = 0
    seats_left: int = 0
    non_member_sold: int = 0
    non_member_seats_left: int = 0
    max_per_member: Optional[int] = None
    max_per_guest: Optional[int] = None


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    venue: Optional[str] = None
    starts_at: datetime.datetime
    ticket_types: Optional[list[TicketTypeCreate]] = None
    form_url: Optional[str] = Field(default=None, max_length=500)


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
    # Signed QR payload ("SKYLINE1.<code>.<sig>") - only the Skyline site/app can verify it
    qr_payload: str = ""
    manual_code: str = ""
    event_id: Optional[int] = None
    event_title: Optional[str] = None
    event_starts_at: Optional[datetime.datetime] = None
    venue: Optional[str] = None
    ticket_type_name: Optional[str] = None


class TicketPurchaseResponse(BaseModel):
    tickets: list[TicketResponse]
    total_amount: str
    requires_payment: bool
    order_id: Optional[str] = None


class CheckInRequest(BaseModel):
    ticket_code: str
    event_id: int


class CheckInBatchItem(BaseModel):
    ticket_code: str
    scanned_at: Optional[datetime.datetime] = None


class CheckInBatchRequest(BaseModel):
    event_id: int
    scans: list[CheckInBatchItem] = Field(..., min_length=1, max_length=500)


class CheckInBatchResult(BaseModel):
    ticket_code: str
    ok: bool
    holder_name: Optional[str] = None
    is_member: bool = False
    error_code: Optional[str] = None
    message: Optional[str] = None


class CheckInBatchResponse(BaseModel):
    results: list[CheckInBatchResult]


class ManifestTicket(BaseModel):
    ticket_code: str
    qr_payload: str
    manual_code: str
    holder_name: str
    ticket_type_name: str
    checked_in: bool
    is_member: bool = False
    membership_type: Optional[str] = None


class EventManifestResponse(BaseModel):
    event_id: int
    title: str
    generated_at: datetime.datetime
    tickets: list[ManifestTicket]


class CheckInResponse(BaseModel):
    status: str
    ticket_code: str
    holder_name: str
    event_title: str
    checked_in_at: datetime.datetime
    # is the person at the door a paid-up member right now?
    is_member: bool = False
    membership_type: Optional[str] = None
    member_valid_until: Optional[datetime.date] = None


class EventSummaryResponse(BaseModel):
    event_id: int
    title: str
    tickets_sold: int
    attended: int
    ticket_revenue: str


class LimitsUpdate(BaseModel):
    max_per_member: Optional[int] = Field(default=None, gt=0)
    max_per_guest: Optional[int] = Field(default=None, gt=0)


class TicketTypeUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=300)
    member_price: Optional[str] = None
    non_member_price: Optional[str] = None


class EventFormUpdate(BaseModel):
    form_url: Optional[str] = Field(default=None, max_length=500)
