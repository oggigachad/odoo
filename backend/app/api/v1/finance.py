from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer, RequireTreasurer, get_current_member
from app.core.database import get_db
from app.schemas.auth import MemberInfo
from app.schemas.finance import (
    CashPaymentCreate,
    ClubBalanceResponse,
    ExpenseCreate,
    ExpenseResponse,
    PaymentResponse,
    TreasurerSummaryItem,
)
from app.services.finance_service import FinanceService

router = APIRouter(tags=["Finance & Treasurer"])


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
    is_officer = any(r.lower() in ["treasurer", "president", "officer"] for r in current_user.roles)
    filter_member_id = member_id if is_officer else current_user.member_id
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
