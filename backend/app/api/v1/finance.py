from typing import Annotated, Optional

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer, RequireTreasurer, get_current_member, is_officer
from app.core.database import get_db
from app.core.errors import ValidationError
from app.core.helpers import format_money
from app.core.config import settings
from app.schemas.auth import MemberInfo
from app.schemas.finance import (
    CashPaymentCreate,
    ClubBalanceResponse,
    ExpenseCreate,
    ExpenseResponse,
    PaymentResponse,
    RazorpayConfigResponse,
    RazorpayOrderCreate,
    RazorpayOrderResponse,
    RazorpayVerifyRequest,
    RazorpayVerifyResponse,
    TreasurerSummaryItem,
)
from app.services.finance_service import FinanceService

router = APIRouter(tags=["Finance & Treasurer"])


@router.get("/payments/razorpay/config", response_model=RazorpayConfigResponse)
async def get_razorpay_config() -> RazorpayConfigResponse:
    """Returns the Razorpay public Key ID loaded strictly from server environment."""
    return RazorpayConfigResponse(key_id=settings.RAZORPAY_KEY_ID)


@router.post("/payments/razorpay/order", response_model=RazorpayOrderResponse)
async def create_razorpay_order(
    payload: RazorpayOrderCreate,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RazorpayOrderResponse:
    """Creates a cryptographic Razorpay Order after verifying ticket/membership amount in DB."""
    service = FinanceService(db)
    return await service.create_razorpay_order(payload, current_user.member_id)


@router.post("/payments/razorpay/verify", response_model=RazorpayVerifyResponse)
async def verify_razorpay_payment(
    payload: RazorpayVerifyRequest,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RazorpayVerifyResponse:
    """Verifies HMAC SHA256 payment signature and activates membership/tickets immediately."""
    service = FinanceService(db)
    return await service.verify_razorpay_payment(payload, current_user.member_id)


@router.post("/payments/cash", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def record_cash_payment(
    payload: CashPaymentCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PaymentResponse:
    """Officer records cash payment for dues, tickets, merchandise, or fundraisers."""
    service = FinanceService(db)
    return await service.record_cash_payment(payload)


@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def submit_expense(
    payload: ExpenseCreate,
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExpenseResponse:
    """Volunteer submits receipt for reimbursement."""
    service = FinanceService(db)
    return await service.submit_expense(payload, current_user.member_id)


@router.patch("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense_status(
    expense_id: int,
    new_status: Annotated[str, Query(alias="status", pattern="^(approved|rejected|reimbursed)$")],
    current_officer: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExpenseResponse:
    """Officer or Treasurer reviews and approves/reimburses expense. Nobody approves their own."""
    service = FinanceService(db)
    return await service.update_expense_status(
        expense_id=expense_id,
        new_status=new_status,
        actor_member_id=current_officer.member_id,
    )


@router.get("/expenses", response_model=list[ExpenseResponse])
async def list_expenses(
    member_id: Annotated[Optional[int], Query(description="Filter by member")] = None,
    expense_status: Annotated[Optional[str], Query(alias="status", description="Filter by status")] = None,
    current_user: Annotated[MemberInfo, Depends(get_current_member)] = None,  # type: ignore[assignment]
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[ExpenseResponse]:
    """List expenses (filtered by user if not officer)."""
    service = FinanceService(db)
    filter_member_id = member_id if is_officer(current_user) else current_user.member_id
    return await service.list_expenses(member_id=filter_member_id, status=expense_status)


@router.get("/treasurer/summary", response_model=list[TreasurerSummaryItem])
async def get_treasurer_summary(
    _: Annotated[MemberInfo, Depends(RequireTreasurer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TreasurerSummaryItem]:
    """Treasurer report: Money in by category and reimbursed expenses out."""
    service = FinanceService(db)
    return await service.get_treasurer_summary()


@router.get("/treasurer/balance", response_model=ClubBalanceResponse)
async def get_club_balance(
    _: Annotated[MemberInfo, Depends(RequireTreasurer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClubBalanceResponse:
    """Treasurer report: Total in, total out, and balance."""
    service = FinanceService(db)
    return await service.get_club_balance()


@router.get("/payments/pending")
async def list_pending_payments(
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """Everything that has been requested but not paid yet (memberships, shop orders, tickets).

    Staff settle an item with POST /payments/cash, which links the payment and activates it.
    """
    items: list[dict] = []
    rows = await db.execute(
        text(
            """
            SELECT ms.membership_id, ms.member_id, m.full_name, mt.name || ' - ' || s.name AS label,
                   ms.dues_amount, s.starts_on
              FROM memberships ms
              JOIN members m ON m.member_id = ms.member_id
              JOIN membership_types mt ON mt.membership_type_id = ms.membership_type_id
              JOIN semesters s ON s.semester_id = ms.semester_id
             WHERE ms.payment_id IS NULL
             ORDER BY ms.membership_id DESC
            """
        )
    )
    for r in rows.all():
        items.append(
            {"kind": "membership", "category": "dues", "ref_id": r[0], "member_id": r[1], "buyer": r[2],
             "label": r[3], "amount": format_money(r[4])}
        )
    rows = await db.execute(
        text(
            """
            SELECT o.order_id, o.member_id, COALESCE(m.full_name, o.buyer_name) AS buyer,
                   SUM(oi.quantity * oi.unit_price) AS amount, o.ordered_at,
                   string_agg(p.name || ' (' || v.size || ') x' || oi.quantity, ', ') AS label
              FROM orders o
              LEFT JOIN members m ON m.member_id = o.member_id
              JOIN order_items oi ON oi.order_id = o.order_id
              JOIN product_variants v ON v.variant_id = oi.variant_id
              JOIN products p ON p.product_id = v.product_id
             WHERE o.status = 'placed'
             GROUP BY o.order_id, o.member_id, m.full_name, o.buyer_name, o.ordered_at
             ORDER BY o.ordered_at DESC
            """
        )
    )
    for r in rows.all():
        items.append(
            {"kind": "order", "category": "merchandise", "ref_id": r[0], "member_id": r[1], "buyer": r[2],
             "label": r[5], "amount": format_money(r[3])}
        )
    rows = await db.execute(
        text(
            """
            SELECT t.ticket_id, t.member_id, t.holder_name, e.title || ' - ' || tt.name AS label, t.price_paid
              FROM tickets t
              JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
              JOIN events e ON e.event_id = tt.event_id
             WHERE t.payment_id IS NULL AND t.price_paid > 0
             ORDER BY t.ticket_id DESC
            """
        )
    )
    for r in rows.all():
        items.append(
            {"kind": "ticket", "category": "ticket", "ref_id": r[0], "member_id": r[1], "buyer": r[2],
             "label": r[3], "amount": format_money(r[4])}
        )
    return items


UPLOAD_DIR = Path(__file__).resolve().parents[3] / "uploads" / "receipts"
ALLOWED_RECEIPT_TYPES = {
    "image/webp": ".webp",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf",
}
MAX_RECEIPT_BYTES = 6 * 1024 * 1024


@router.post("/expenses/receipt")
async def upload_receipt(
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    file: Annotated[UploadFile, File(description="Receipt image (client downscales to WebP) or PDF")],
) -> dict[str, str]:
    """Store a receipt and return its URL for the expense form. Server-side size and type limits apply."""
    ext = ALLOWED_RECEIPT_TYPES.get(file.content_type or "")
    if not ext:
        raise ValidationError("Receipts must be WebP, JPEG, PNG or PDF files.")
    data = await file.read(MAX_RECEIPT_BYTES + 1)
    if len(data) > MAX_RECEIPT_BYTES:
        raise ValidationError("Receipt is larger than 6 MB. Please compress it and try again.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{current_user.member_id}-{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"url": f"/uploads/receipts/{name}"}
