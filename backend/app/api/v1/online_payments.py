"""Razorpay webhook: settles a payment even if the buyer closed the browser tab before verify() ran.

The browser flow (create order, Checkout, verify) lives in /payments/razorpay/* (services/finance_service.py).
Razorpay also calls POST /webhooks/razorpay when a payment is captured. We check its HMAC signature, read what the
order was for from the notes we attached when creating it, and record the payment exactly once (idempotent on
the Razorpay payment id, so verify() and the webhook can both fire safely).
"""

import hashlib
import hmac
import json
import logging
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import UnauthenticatedError
from app.core.helpers import format_money, to_decimal
from app.core.redis import invalidate_report_caches
from app.repositories.finance_repo import FinanceRepository
from app.services.notification_service import announce_notifications, notify

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Online payments"])


async def _price(db: AsyncSession, membership_id: int | None, order_id: int | None, ticket_ids: list[int]) -> tuple[Decimal, str, bool]:
    """Amount owed and category for the items named in the order notes, read from the database. Third value: already paid."""
    if membership_id:
        r = (await db.execute(text("SELECT dues_amount, payment_id FROM memberships WHERE membership_id=:i"), {"i": membership_id})).first()
        return (Decimal(str(r[0])), "dues", r[1] is not None) if r else (Decimal(0), "dues", True)
    if order_id:
        r = (
            await db.execute(
                text("SELECT COALESCE((SELECT SUM(quantity*unit_price) FROM order_items WHERE order_id=o.order_id),0), o.status FROM orders o WHERE o.order_id=:i"),
                {"i": order_id},
            )
        ).first()
        return (Decimal(str(r[0])), "merchandise", r[1] != "placed") if r else (Decimal(0), "merchandise", True)
    rows = (await db.execute(text("SELECT price_paid, payment_id FROM tickets WHERE ticket_id = ANY(:ids)"), {"ids": ticket_ids})).all()
    return (sum((Decimal(str(x[0])) for x in rows), Decimal(0)), "ticket", not rows or all(x[1] is not None for x in rows))


async def settle(db: AsyncSession, notes: dict[str, Any], external_ref: str) -> dict[str, Any]:
    """Record the payment once and activate the items. Safe to call repeatedly with the same external_ref."""
    repo = FinanceRepository(db)
    existing = await repo.get_payment_by_external_ref(external_ref)
    if existing:
        return {"status": "already_recorded", "payment_id": existing.payment_id}

    membership_id = int(notes["membership_id"]) if notes.get("membership_id") else None
    order_id = int(notes["order_id"]) if notes.get("order_id") else None
    ticket_ids = [int(x) for x in str(notes.get("ticket_ids") or "").split(",") if x.strip()]
    member_id = int(notes["member_id"]) if notes.get("member_id") else None
    if not (membership_id or order_id or ticket_ids):
        return {"status": "ignored"}  # e.g. fundraiser donations are recorded by verify()

    amount, category, paid = await _price(db, membership_id, order_id, ticket_ids)
    if paid or amount <= 0:
        return {"status": "already_paid"}
    payment = await repo.create_payment(
        category=category, amount=to_decimal(amount), method="online", member_id=member_id, fundraiser_id=None, external_ref=external_ref
    )
    await repo.link_payment(payment_id=payment.payment_id, membership_id=membership_id, order_id=order_id, ticket_ids=ticket_ids or None)
    if member_id:
        label = {"dues": "Membership", "merchandise": "Order", "ticket": "Ticket"}[category]
        await notify(
            db, [member_id], "payment", f"{label} payment received",
            f"{settings.CURRENCY_SYMBOL}{format_money(amount)} paid online. Thank you!", "#dashboard", f"pay:{external_ref}",
        )
    await db.commit()
    await invalidate_report_caches()
    await announce_notifications()
    return {"status": "paid", "payment_id": payment.payment_id, "amount": format_money(amount)}


@router.post("/webhooks/razorpay")
async def razorpay_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_razorpay_signature: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    secret = settings.RAZORPAY_WEBHOOK_SECRET
    body = await request.body()
    if not secret or not x_razorpay_signature:
        raise UnauthenticatedError("Webhook is not configured.")
    if not hmac.compare_digest(hmac.new(secret.encode(), body, hashlib.sha256).hexdigest(), x_razorpay_signature):
        raise UnauthenticatedError("Bad webhook signature.")
    event = json.loads(body)
    if event.get("event") in ("payment.captured", "order.paid"):
        ent = event.get("payload", {}).get("payment", {}).get("entity", {})
        if ent.get("id"):
            await settle(db, ent.get("notes") or {}, ent["id"])
    return {"status": "ok"}
