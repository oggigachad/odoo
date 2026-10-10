import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CashPaymentCreate(BaseModel):
    category: str = Field(..., pattern="^(dues|ticket|merchandise|fundraiser)$")
    amount: str
    member_id: Optional[int] = None
    fundraiser_id: Optional[int] = None
    membership_id: Optional[int] = None
    order_id: Optional[int] = None
    ticket_ids: Optional[list[int]] = None


class PaymentResponse(BaseModel):
    payment_id: int
    member_id: Optional[int]
    category: str
    amount: str
    method: str
    paid_at: datetime.datetime
    fundraiser_id: Optional[int]
    external_ref: Optional[str]


class PaymentWebhookPayload(BaseModel):
    external_ref: str
    category: str = Field(..., pattern="^(dues|ticket|merchandise|fundraiser)$")
    amount: str
    member_id: Optional[int] = None
    fundraiser_id: Optional[int] = None
    membership_id: Optional[int] = None
    order_id: Optional[int] = None
    ticket_ids: Optional[list[int]] = None


class ExpenseCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=200)
    amount: str
    receipt_url: Optional[str] = None
    event_id: Optional[int] = None
    fundraiser_id: Optional[int] = None
    incurred_on: Optional[datetime.date] = None


class ExpenseResponse(BaseModel):
    expense_id: int
    member_id: int
    volunteer_name: Optional[str] = None
    description: str
    amount: str
    receipt_url: Optional[str]
    event_id: Optional[int]
    fundraiser_id: Optional[int]
    incurred_on: datetime.date
    submitted_at: datetime.datetime
    status: str
    reimbursed_at: Optional[datetime.datetime]


class TreasurerSummaryItem(BaseModel):
    direction: str  # in, out
    item: str
    total: str


class ClubBalanceResponse(BaseModel):
    total_in: str
    total_out: str
    balance: str
