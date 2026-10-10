from app.core.errors import ServiceUnavailableError
import json
import hashlib
import hmac
from decimal import Decimal
from typing import Optional
import uuid

import razorpay
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import PaymentSignatureInvalidError, ValidationError
from app.core.helpers import format_money, to_decimal
from app.core.redis import get_redis_client, get_report_cache, invalidate_report_caches, set_report_cache
from app.models.schema_models import Expense, Membership, Order, Ticket
from app.repositories.finance_repo import FinanceRepository
from app.schemas.finance import (
    CashPaymentCreate,
    ClubBalanceResponse,
    ExpenseCreate,
    ExpenseResponse,
    PaymentResponse,
    PaymentWebhookPayload,
    RazorpayOrderCreate,
    RazorpayOrderResponse,
    RazorpayVerifyRequest,
    RazorpayVerifyResponse,
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

    async def _order_total(self, order_id: int) -> Decimal:
        """Orders have no stored total: it is always the sum of their lines."""
        from sqlalchemy import text

        total = (await self.session.execute(
            text("SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_items WHERE order_id = :o"), {"o": order_id})).scalar_one()
        return to_decimal(total)

    async def create_razorpay_order(self, data: RazorpayOrderCreate, member_id: int) -> RazorpayOrderResponse:
        """Secure server-side creation of Razorpay order with strict database price verification."""
        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
            raise ValidationError("Razorpay payment gateway keys are not configured in environment.")

        # Cryptographic & database price integrity verification
        verified_amount = to_decimal(data.amount)
        if data.category == "dues" and data.membership_id:
            m = await self.session.get(Membership, data.membership_id)
            if not m:
                raise ValidationError("Membership record not found.")
            if m.dues_amount != verified_amount:
                raise ValidationError(f"Price mismatch: Expected dues ₹{m.dues_amount}, got ₹{data.amount}")
        elif data.category == "ticket" and data.ticket_ids:
            res = await self.session.execute(select(Ticket).where(Ticket.ticket_id.in_(data.ticket_ids)))
            tickets = res.scalars().all()
            if not tickets:
                raise ValidationError("Ticket records not found.")
            expected_total = sum((t.price_paid for t in tickets), Decimal("0.00"))
            if expected_total != verified_amount:
                raise ValidationError(f"Price mismatch: Expected tickets ₹{expected_total}, got ₹{data.amount}")
        elif data.category == "merchandise" and data.order_id:
            o = await self.session.get(Order, data.order_id)
            if not o:
                raise ValidationError("Order not found.")
            if o.status != "placed":
                raise ValidationError("This order is already paid, cancelled or expired. Place it again from the shop.")
            order_total = await self._order_total(data.order_id)
            if order_total != verified_amount:
                raise ValidationError(f"Price mismatch: Expected order ₹{order_total}, got ₹{data.amount}")

        amount_paise = int(verified_amount * 100)
        if amount_paise <= 0:
            raise ValidationError("Payment amount must be greater than zero.")

        # Create Razorpay order via Razorpay SDK
        client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
        order_receipt = f"rcpt_{data.category}_{member_id}_{uuid.uuid4().hex[:6]}"
        rp_order = client.order.create({
            "amount": amount_paise,
            "currency": "INR",
            "receipt": order_receipt,
            "notes": {
                "category": data.category,
                "member_id": str(member_id),
                "membership_id": str(data.membership_id or ""),
                "ticket_ids": ",".join(str(tid) for tid in (data.ticket_ids or [])),
                "order_id": str(data.order_id or ""),
            },
        })

        # Remember what this order was for, so verify() can refuse a signature from a cheaper order being
        # replayed against a different membership / ticket / order.
        try:
            await get_redis_client().set(
                f"oddo:v1:rzp:{rp_order['id']}",
                json.dumps(
                    {
                        "member_id": member_id,
                        "category": data.category,
                        "membership_id": data.membership_id,
                        "ticket_ids": sorted(data.ticket_ids or []),
                        "order_id": data.order_id,
                        "fundraiser_id": data.fundraiser_id,
                        "amount_paise": amount_paise,
                    }
                ),
                ex=3600,
            )
        except Exception as exc:  # noqa: BLE001
            raise ServiceUnavailableError("Payments are temporarily unavailable. Please try again.") from exc

        return RazorpayOrderResponse(
            order_id=rp_order["id"],
            amount=rp_order["amount"],
            currency="INR",
            key_id=settings.RAZORPAY_KEY_ID,
        )

    async def verify_razorpay_payment(self, data: RazorpayVerifyRequest, member_id: int) -> RazorpayVerifyResponse:
        """Cryptographically verify Razorpay signature and commit payment to database."""
        if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
            raise ValidationError("Razorpay payment gateway keys are not configured in environment.")

        # 1. Cryptographically verify signature using HMAC-SHA256
        msg = f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8")
        expected_sig = hmac.new(settings.RAZORPAY_KEY_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, data.razorpay_signature):
            raise PaymentSignatureInvalidError("Invalid Razorpay payment signature.")

        # 1b. The order must have been created by this member for exactly these items
        raw = await get_redis_client().get(f"oddo:v1:rzp:{data.razorpay_order_id}")
        if not raw:
            raise ValidationError("This payment session expired or is unknown. If money was deducted it is matched automatically by the webhook.")
        bound = json.loads(raw)
        if (
            bound["member_id"] != member_id
            or bound["category"] != data.category
            or bound["membership_id"] != data.membership_id
            or bound["ticket_ids"] != sorted(data.ticket_ids or [])
            or bound["order_id"] != data.order_id
        ):
            raise PaymentSignatureInvalidError("This payment does not match the order it was created for.")

        # 2. Check for duplicate processing (idempotency)
        existing = await self.repo.get_payment_by_external_ref(data.razorpay_payment_id)
        if existing:
            from app.services.auth_service import AuthService

            cur = await AuthService(self.session).get_current_user_info(member_id)
            return RazorpayVerifyResponse(
                status="already_processed",
                payment_id=existing.payment_id,
                is_active=cur.is_active,
                role=cur.role,
                message="Payment was already recorded.",
            )

        # 3. Determine verified amount from database entity
        amount = Decimal("0.00")
        if data.membership_id:
            m = await self.session.get(Membership, data.membership_id)
            if m:
                amount = m.dues_amount
        elif data.ticket_ids:
            res = await self.session.execute(select(Ticket).where(Ticket.ticket_id.in_(data.ticket_ids)))
            tickets = res.scalars().all()
            amount = sum((t.price_paid for t in tickets), Decimal("0.00"))
        elif data.order_id:
            o = await self.session.get(Order, data.order_id)
            if o:
                amount = await self._order_total(data.order_id)

        if amount <= Decimal("0.00"):
            # fundraiser donations have no database price: use what was actually charged for this order
            amount = to_decimal(Decimal(bound["amount_paise"]) / 100)
        if amount <= Decimal("0.00"):
            raise ValidationError("Could not determine the amount for this payment.")


        # 4. Record payment in database and link to membership/tickets/order
        payment = await self.repo.create_payment(
            category=data.category,
            amount=amount,
            method="online",
            member_id=member_id,
            fundraiser_id=data.fundraiser_id,
            external_ref=data.razorpay_payment_id,
        )
        await self.repo.link_payment(
            payment_id=payment.payment_id,
            membership_id=data.membership_id,
            order_id=data.order_id,
            ticket_ids=data.ticket_ids,
        )
        await self.session.commit()
        await invalidate_report_caches()

        from app.services.auth_service import AuthService

        info = await AuthService(self.session).get_current_user_info(member_id)
        messages = {
            "dues": "Payment received. Your membership is now active.",
            "ticket": "Payment received. Your ticket is now valid.",
            "merchandise": "Payment received. Your order is paid.",
            "fundraiser": "Thank you. Your donation was received.",
        }
        return RazorpayVerifyResponse(
            status="success",
            payment_id=payment.payment_id,
            is_active=info.is_active,
            role=info.role,
            message=messages.get(data.category, "Payment received."),
        )

