import datetime
import uuid
from decimal import Decimal

import pytest

from app.core.database import async_session_factory
from app.core.redis import enqueue_email
from app.jobs.email_worker import run_email_worker
from app.jobs.hold_cleanup import release_unpaid_holds
from app.models.schema_models import Event, Order, OrderItem, Product, ProductVariant, Ticket, TicketType


@pytest.mark.asyncio
async def test_email_worker_job() -> None:
    # Enqueue mock email
    await enqueue_email(
        {
            "type": "welcome",
            "to": "student@skyline.edu",
            "subject": "Welcome to Skyline Student Association",
        }
    )
    # Run email worker for 1 iteration
    await run_email_worker(max_iterations=1)


@pytest.mark.asyncio
async def test_release_unpaid_holds_job() -> None:
    uid = uuid.uuid4().hex[:6]
    past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=20)

    async with async_session_factory() as session:
        # Create event & ticket type
        ev = Event(title=f"Expired Ev {uid}", starts_at=datetime.datetime.now(datetime.timezone.utc))
        session.add(ev)
        await session.flush()

        tt = TicketType(
            event_id=ev.event_id,
            name="Gen",
            member_price="100.00",
            non_member_price="100.00",
            seat_limit=10,
            non_member_seat_limit=10,
        )
        session.add(tt)
        await session.flush()

        # Create expired unpaid ticket
        t = Ticket(
            ticket_type_id=tt.ticket_type_id,
            holder_name="Late Student",
            price_paid=100.00,
            purchased_at=past_time,
            payment_id=None,
        )
        session.add(t)

        # Create product & variant
        prod = Product(name=f"Hoodie {uid}", price="500.00", member_price="400.00", non_member_limit=10)
        session.add(prod)
        await session.flush()

        var = ProductVariant(product_id=prod.product_id, size="L", stock_quantity=10)
        session.add(var)
        await session.flush()

        # Create expired placed order
        ord_rec = Order(
            buyer_name="Expired Buyer",
            buyer_email="expired@skyline.edu",
            status="placed",
            ordered_at=past_time,
        )
        session.add(ord_rec)
        await session.flush()

        item = OrderItem(order_id=ord_rec.order_id, variant_id=var.variant_id, quantity=2, unit_price=Decimal("500.00"))
        session.add(item)
        await session.commit()

    # Run cleanup
    res = await release_unpaid_holds()
    assert res["released_tickets"] >= 1
    assert res["cancelled_orders"] >= 1
