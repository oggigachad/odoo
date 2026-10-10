import datetime
import logging

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.database import async_session_factory
from app.core.redis import invalidate_report_caches
from app.models.schema_models import Order, OrderItem, ProductVariant, Ticket

logger = logging.getLogger(__name__)


async def release_unpaid_holds() -> dict[str, int]:
    """
    Background job:
    1. Releases unpaid ticket holds older than 15 minutes. Never touches paid tickets.
    2. Cancels placed orders older than 15 minutes and restores variant stock.
    """
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=15)
    released_tickets = 0
    cancelled_orders = 0

    async with async_session_factory() as session:
        # 1. Purge expired unpaid tickets
        stmt = delete(Ticket).where(
            Ticket.payment_id.is_(None),
            Ticket.price_paid > 0,
            Ticket.purchased_at < cutoff,
        )
        res = await session.execute(stmt)
        released_tickets = int(getattr(res, "rowcount", 0))

        # 2. Find and cancel expired placed orders
        orders_stmt = (
            select(Order)
            .options(selectinload(Order.items).selectinload(OrderItem.variant))
            .where(
                Order.status == "placed",
                Order.ordered_at < cutoff,
            )
            .with_for_update()
        )
        o_res = await session.execute(orders_stmt)
        expired_orders = o_res.scalars().all()

        for order in expired_orders:
            for item in order.items:
                v_stmt = select(ProductVariant).where(ProductVariant.variant_id == item.variant_id).with_for_update()
                v_res = await session.execute(v_stmt)
                variant = v_res.scalars().first()
                if variant:
                    variant.stock_quantity += item.quantity
            order.status = "cancelled"
            cancelled_orders += 1

        await session.commit()

        if released_tickets > 0 or cancelled_orders > 0:
            await invalidate_report_caches()

    logger.info(f"Released {released_tickets} tickets, cancelled {cancelled_orders} orders.")
    return {"released_tickets": released_tickets, "cancelled_orders": cancelled_orders}
