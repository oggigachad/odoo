import datetime
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import (
    InvalidStateTransitionError,
    NotFoundError,
    SelfApprovalNotAllowedError,
)
from app.models.schema_models import Expense, Membership, Order, Payment, Ticket


class FinanceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_payment(
        self,
        category: str,
        amount: Decimal,
        method: str,
        member_id: Optional[int] = None,
        fundraiser_id: Optional[int] = None,
        external_ref: Optional[str] = None,
    ) -> Payment:
        payment = Payment(
            category=category,
            amount=amount,
            method=method,
            member_id=member_id,
            fundraiser_id=fundraiser_id if category == "fundraiser" else None,
            external_ref=external_ref,
        )
        self.session.add(payment)
        await self.session.flush()
        await self.session.refresh(payment)
        return payment

    async def get_payment_by_external_ref(self, external_ref: str) -> Optional[Payment]:
        result = await self.session.execute(select(Payment).where(Payment.external_ref == external_ref))
        return result.scalars().first()

    async def link_payment(
        self,
        payment_id: int,
        membership_id: Optional[int] = None,
        order_id: Optional[int] = None,
        ticket_ids: Optional[list[int]] = None,
    ) -> None:
        if membership_id:
            m = await self.session.get(Membership, membership_id)
            if m:
                m.payment_id = payment_id

        if order_id:
            o = await self.session.get(Order, order_id)
            if o:
                o.payment_id = payment_id
                o.status = "paid"

        if ticket_ids:
            res = await self.session.execute(select(Ticket).where(Ticket.ticket_id.in_(ticket_ids)))
            for t in res.scalars().all():
                t.payment_id = payment_id

        await self.session.flush()

    # -----------------------------------------------------------------
    # Expenses (TRS-2, TRS-3)
    # -----------------------------------------------------------------
    async def create_expense(
        self,
        member_id: int,
        description: str,
        amount: Decimal,
        receipt_url: Optional[str] = None,
        event_id: Optional[int] = None,
        fundraiser_id: Optional[int] = None,
        incurred_on: Optional[datetime.date] = None,
    ) -> Expense:
        exp = Expense(
            member_id=member_id,
            description=description.strip(),
            amount=amount,
            receipt_url=receipt_url,
            event_id=event_id,
            fundraiser_id=fundraiser_id,
            incurred_on=incurred_on or datetime.date.today(),
            status="submitted",
        )
        self.session.add(exp)
        await self.session.flush()
        await self.session.refresh(exp)
        return exp

    async def get_expense_by_id(self, expense_id: int) -> Optional[Expense]:
        result = await self.session.execute(
            select(Expense).options(selectinload(Expense.member)).where(Expense.expense_id == expense_id)
        )
        return result.scalars().first()

    async def update_expense_status(
        self,
        expense_id: int,
        new_status: str,
        actor_member_id: int,
    ) -> Expense:
        exp = await self.get_expense_by_id(expense_id)
        if not exp:
            raise NotFoundError("Expense not found.")

        # Safeguard D-017: Nobody approves or reimburses their own expense!
        if exp.member_id == actor_member_id:
            raise SelfApprovalNotAllowedError()

        # State transition rules
        if exp.status == "submitted":
            if new_status not in ["approved", "rejected"]:
                raise InvalidStateTransitionError("Submitted expenses can only be approved or rejected.")
        elif exp.status == "approved":
            if new_status != "reimbursed":
                raise InvalidStateTransitionError("Approved expenses can only transition to reimbursed.")
        else:
            raise InvalidStateTransitionError(f"Cannot change status from {exp.status}.")

        exp.status = new_status
        if new_status == "reimbursed":
            exp.reimbursed_at = datetime.datetime.now(datetime.timezone.utc)

        await self.session.flush()
        await self.session.refresh(exp)
        return exp

    async def list_expenses(
        self,
        member_id: Optional[int] = None,
        status: Optional[str] = None,
    ) -> Sequence[Expense]:
        stmt = select(Expense).options(selectinload(Expense.member)).order_by(Expense.submitted_at.desc())
        if member_id:
            stmt = stmt.where(Expense.member_id == member_id)
        if status:
            stmt = stmt.where(Expense.status == status)
        res = await self.session.execute(stmt)
        return res.scalars().all()

    # -----------------------------------------------------------------
    # Views / Reports (TRS-1, TRS-4)
    # -----------------------------------------------------------------
    async def get_treasurer_summary(self) -> Sequence[tuple[str, str, Decimal]]:
        sql = text("SELECT direction, item, total FROM treasurer_summary;")
        res = await self.session.execute(sql)
        rows = res.all()
        return [(row[0], row[1], Decimal(str(row[2]))) for row in rows]

    async def get_club_balance(self) -> tuple[Decimal, Decimal, Decimal]:
        in_sql = text("SELECT COALESCE(SUM(amount), 0) FROM payments;")
        out_sql = text("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'reimbursed';")
        in_res = await self.session.execute(in_sql)
        out_res = await self.session.execute(out_sql)
        tot_in = Decimal(str(in_res.scalar_one()))
        tot_out = Decimal(str(out_res.scalar_one()))
        return tot_in, tot_out, (tot_in - tot_out)
