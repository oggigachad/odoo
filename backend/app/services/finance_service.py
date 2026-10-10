from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.helpers import format_money, to_decimal
from app.core.redis import get_report_cache, invalidate_report_caches, set_report_cache
from app.models.schema_models import Expense
from app.repositories.finance_repo import FinanceRepository
from app.schemas.finance import (
    CashPaymentCreate,
    ClubBalanceResponse,
    ExpenseCreate,
    ExpenseResponse,
    PaymentResponse,
    PaymentWebhookPayload,
    TreasurerSummaryItem,
)


class FinanceService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = FinanceRepository(session)

    async def record_cash_payment(self, data: CashPaymentCreate) -> PaymentResponse:
        amount = to_decimal(data.amount)
        payment = await self.repo.create_payment(
            category=data.category,
            amount=amount,
            method="cash",
            member_id=data.member_id,
            fundraiser_id=data.fundraiser_id,
        )
        await self.repo.link_payment(
            payment_id=payment.payment_id,
            membership_id=data.membership_id,
            order_id=data.order_id,
            ticket_ids=data.ticket_ids,
        )
        await self.session.commit()
        await invalidate_report_caches()

        return PaymentResponse(
            payment_id=payment.payment_id,
            member_id=payment.member_id,
            category=payment.category,
            amount=format_money(payment.amount),
            method=payment.method,
            paid_at=payment.paid_at,
            fundraiser_id=payment.fundraiser_id,
            external_ref=payment.external_ref,
        )

    async def process_payment_webhook(self, data: PaymentWebhookPayload) -> dict[str, str]:
        """
        Idempotent webhook handler (D-020, P-03).
        Duplicate deliveries with the same external_ref are safe no-ops.
        """
        existing = await self.repo.get_payment_by_external_ref(data.external_ref)
        if existing:
            return {"status": "already_processed", "payment_id": str(existing.payment_id)}

        amount = to_decimal(data.amount)
        payment = await self.repo.create_payment(
            category=data.category,
            amount=amount,
            method="online",
            member_id=data.member_id,
            fundraiser_id=data.fundraiser_id,
            external_ref=data.external_ref,
        )
        await self.repo.link_payment(
            payment_id=payment.payment_id,
            membership_id=data.membership_id,
            order_id=data.order_id,
            ticket_ids=data.ticket_ids,
        )
        await self.session.commit()
        await invalidate_report_caches()

        return {"status": "processed", "payment_id": str(payment.payment_id)}

    async def submit_expense(self, data: ExpenseCreate, member_id: int) -> ExpenseResponse:
        amount = to_decimal(data.amount)
        exp = await self.repo.create_expense(
            member_id=member_id,
            description=data.description,
            amount=amount,
            receipt_url=data.receipt_url,
            event_id=data.event_id,
            fundraiser_id=data.fundraiser_id,
            incurred_on=data.incurred_on,
        )
        await self.session.commit()
        loaded = await self.repo.get_expense_by_id(exp.expense_id)
        return self._format_expense(loaded if loaded else exp)

    async def update_expense_status(
        self,
        expense_id: int,
        new_status: str,
        actor_member_id: int,
    ) -> ExpenseResponse:
        exp = await self.repo.update_expense_status(
            expense_id=expense_id,
            new_status=new_status,
            actor_member_id=actor_member_id,
        )
        await self.session.commit()
        if new_status == "reimbursed":
            await invalidate_report_caches()
        loaded = await self.repo.get_expense_by_id(exp.expense_id)
        return self._format_expense(loaded if loaded else exp)

    async def list_expenses(
        self,
        member_id: Optional[int] = None,
        status: Optional[str] = None,
    ) -> list[ExpenseResponse]:
        items = await self.repo.list_expenses(member_id=member_id, status=status)
        return [self._format_expense(e) for e in items]

    async def get_treasurer_summary(self) -> list[TreasurerSummaryItem]:
        cached = await get_report_cache("treasurer_summary")
        if cached:
            return [TreasurerSummaryItem(**item) for item in cached]

        rows = await self.repo.get_treasurer_summary()
        result = [
            TreasurerSummaryItem(
                direction=direction,
                item=item,
                total=format_money(total),
            )
            for direction, item, total in rows
        ]
        await set_report_cache("treasurer_summary", [r.model_dump() for r in result], ttl=60)
        return result

    async def get_club_balance(self) -> ClubBalanceResponse:
        cached = await get_report_cache("club_balance")
        if cached:
            return ClubBalanceResponse(**cached)

        tot_in, tot_out, bal = await self.repo.get_club_balance()
        resp = ClubBalanceResponse(
            total_in=format_money(tot_in),
            total_out=format_money(tot_out),
            balance=format_money(bal),
        )
        await set_report_cache("club_balance", resp.model_dump(), ttl=60)
        return resp

    def _format_expense(self, exp: Expense) -> ExpenseResponse:
        volunteer_name = None
        if "member" in exp.__dict__ and exp.member:
            volunteer_name = exp.member.full_name

        return ExpenseResponse(
            expense_id=exp.expense_id,
            member_id=exp.member_id,
            volunteer_name=volunteer_name,
            description=exp.description,
            amount=format_money(exp.amount),
            receipt_url=exp.receipt_url,
            event_id=exp.event_id,
            fundraiser_id=exp.fundraiser_id,
            incurred_on=exp.incurred_on,
            submitted_at=exp.submitted_at,
            status=exp.status,
            reimbursed_at=exp.reimbursed_at,
        )
