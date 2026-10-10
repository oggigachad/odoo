from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import (
    InsufficientStockError,
    InvalidStateTransitionError,
    NonMemberLimitReachedError,
    NotFoundError,
    ValidationError,
)
from app.models.schema_models import Order, OrderItem, Product, ProductVariant


class ShopRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_product(
        self,
        name: str,
        description: Optional[str],
        price: Decimal,
        member_price: Decimal,
        non_member_limit: int = 0,
        max_per_member: Optional[int] = None,
        max_per_guest: Optional[int] = None,
        image_url: Optional[str] = None,
    ) -> Product:
        prod = Product(
            name=name.strip(),
            description=description.strip() if description else None,
            price=price,
            member_price=member_price,
            non_member_limit=non_member_limit,
            max_per_member=max_per_member,
            max_per_guest=max_per_guest,
            image_url=image_url,
        )
        self.session.add(prod)
        await self.session.flush()
        await self.session.refresh(prod)
        return prod

    async def get_products(self) -> Sequence[Product]:
        result = await self.session.execute(
            select(Product).options(selectinload(Product.variants)).where(Product.is_active.is_(True)).order_by(Product.product_id.asc())
        )
        return result.scalars().all()

    async def get_product_by_id(self, product_id: int) -> Optional[Product]:
        result = await self.session.execute(
            select(Product).options(selectinload(Product.variants)).where(Product.product_id == product_id)
        )
        return result.scalars().first()

    async def add_or_update_variant(self, product_id: int, size: str, stock_quantity: int) -> ProductVariant:
        stmt = select(ProductVariant).where(
            ProductVariant.product_id == product_id,
            func.lower(ProductVariant.size) == size.strip().lower(),
        )
        res = await self.session.execute(stmt)
        variant = res.scalars().first()
        if variant:
            variant.stock_quantity = stock_quantity
        else:
            variant = ProductVariant(
                product_id=product_id,
                size=size.strip(),
                stock_quantity=stock_quantity,
            )
            self.session.add(variant)
        await self.session.flush()
        await self.session.refresh(variant)
        return variant

    async def get_non_member_units_taken_all(self) -> dict[int, int]:
        """One grouped query for every product (avoids one query per product when listing the shop)."""
        stmt = (
            select(ProductVariant.product_id, func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(OrderItem, OrderItem.variant_id == ProductVariant.variant_id)
            .join(Order, Order.order_id == OrderItem.order_id)
            .where(Order.member_id.is_(None), Order.status.in_(["placed", "paid"]))
            .group_by(ProductVariant.product_id)
        )
        return {pid: int(n) for pid, n in (await self.session.execute(stmt)).all()}

    async def get_non_member_units_taken(self, product_id: int) -> int:
        stmt = (
            select(func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(Order, Order.order_id == OrderItem.order_id)
            .join(ProductVariant, ProductVariant.variant_id == OrderItem.variant_id)
            .where(
                ProductVariant.product_id == product_id,
                Order.member_id.is_(None),
                Order.status.in_(["placed", "paid"]),
            )
        )
        res = await self.session.execute(stmt)
        return res.scalar_one()

    async def place_order(
        self,
        member_id: Optional[int],
        buyer_name: Optional[str],
        buyer_email: Optional[str],
        items_input: list[tuple[int, int]],  # list of (variant_id, quantity)
        is_active_member: bool,
    ) -> Order:
        """
        Atomic order placement:
        1. Validates buyer identity.
        2. Locks affected products and variants (FOR UPDATE).
        3. Enforces stock availability.
        4. Enforces non-member goodie limits (D-026).
        5. Decrements stock and inserts order & order_items.
        """
        if not member_id and (not buyer_name or not buyer_email):
            raise ValidationError("Non-member orders require buyer name and email.")

        variant_ids = [vid for vid, _ in items_input]

        # Lock variants
        v_stmt = (
            select(ProductVariant, Product)
            .join(Product, Product.product_id == ProductVariant.product_id)
            .where(ProductVariant.variant_id.in_(variant_ids))
            .with_for_update(of=ProductVariant)
        )
        v_res = await self.session.execute(v_stmt)
        variant_rows = {row[0].variant_id: (row[0], row[1]) for row in v_res.all()}

        # Verify all variants exist
        for vid, _ in items_input:
            if vid not in variant_rows:
                raise NotFoundError(f"Product variant {vid} not found.")

        # Check non-member limit per product if buyer is non-member
        if not member_id or not is_active_member:
            product_quantities: dict[int, int] = {}
            for vid, qty in items_input:
                variant, product = variant_rows[vid]
                product_quantities[product.product_id] = product_quantities.get(product.product_id, 0) + qty

            for pid, added_qty in product_quantities.items():
                # Lock product
                p_lock = select(Product).where(Product.product_id == pid).with_for_update()
                p_res = await self.session.execute(p_lock)
                product_obj = p_res.scalars().first()
                if not product_obj:
                    raise NotFoundError("Product not found.")
                product = product_obj

                current_taken = await self.get_non_member_units_taken(pid)
                if current_taken + added_qty > product.non_member_limit:
                    raise NonMemberLimitReachedError()

        # Check stock and create order items
        order = Order(
            member_id=member_id if is_active_member else None,
            buyer_name=buyer_name.strip() if buyer_name else None,
            buyer_email=buyer_email.strip().lower() if buyer_email else None,
            status="placed",
        )
        self.session.add(order)
        await self.session.flush()

        order_items: list[OrderItem] = []
        for vid, qty in items_input:
            variant, product = variant_rows[vid]
            if variant.stock_quantity < qty:
                raise InsufficientStockError(f"Insufficient stock for size {variant.size}.")

            # Decrement stock
            variant.stock_quantity -= qty

            unit_price = product.member_price if (member_id and is_active_member) else product.price
            item = OrderItem(
                order_id=order.order_id,
                variant_id=vid,
                quantity=qty,
                unit_price=unit_price,
            )
            order_items.append(item)

        self.session.add_all(order_items)
        await self.session.flush()
        await self.session.refresh(order)
        return order

    async def cancel_order(self, order_id: int) -> Order:
        """Cancels a placed order and restores stock."""
        stmt = (
            select(Order)
            .options(selectinload(Order.items).selectinload(OrderItem.variant))
            .where(Order.order_id == order_id)
            .with_for_update()
        )
        res = await self.session.execute(stmt)
        order = res.scalars().first()
        if not order:
            raise NotFoundError("Order not found.")

        if order.status != "placed":
            raise InvalidStateTransitionError("Only orders in 'placed' status can be cancelled.")

        # Restore stock
        for item in order.items:
            variant_stmt = select(ProductVariant).where(ProductVariant.variant_id == item.variant_id).with_for_update()
            v_res = await self.session.execute(variant_stmt)
            v = v_res.scalars().first()
            if v:
                v.stock_quantity += item.quantity

        order.status = "cancelled"
        await self.session.flush()
        await self.session.refresh(order)
        return order

    async def get_order_by_id(self, order_id: int) -> Optional[Order]:
        stmt = (
            select(Order)
            .options(selectinload(Order.items).selectinload(OrderItem.variant).selectinload(ProductVariant.product))
            .where(Order.order_id == order_id)
        )
        res = await self.session.execute(stmt)
        return res.scalars().first()

    async def list_orders(
        self,
        member_id: Optional[int] = None,
        status: Optional[str] = None,
        buyer_email: Optional[str] = None,
    ) -> Sequence[Order]:
        stmt = (
            select(Order)
            .options(selectinload(Order.items).selectinload(OrderItem.variant).selectinload(ProductVariant.product))
            .order_by(Order.ordered_at.desc())
        )
        if member_id and buyer_email:
            stmt = stmt.where((Order.member_id == member_id) | (func.lower(Order.buyer_email) == buyer_email.lower()))
        elif member_id:
            stmt = stmt.where(Order.member_id == member_id)
        if status:
            stmt = stmt.where(Order.status == status)
        res = await self.session.execute(stmt)
        return res.scalars().all()
