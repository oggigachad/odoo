import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.helpers import format_money, to_decimal
from app.models.schema_models import Order
from app.repositories.member_repo import MemberRepository
from app.repositories.shop_repo import ShopRepository
from app.schemas.shop import (
    OrderCancelResponse,
    OrderCreate,
    OrderItemResponse,
    OrderResponse,
    ProductCreate,
    ProductResponse,
    VariantCreate,
    VariantResponse,
)


class ShopService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.shop_repo = ShopRepository(session)
        self.member_repo = MemberRepository(session)

    async def create_product(self, data: ProductCreate) -> ProductResponse:
        price = to_decimal(data.price)
        member_price = to_decimal(data.member_price)
        prod = await self.shop_repo.create_product(
            name=data.name,
            description=data.description,
            price=price,
            member_price=member_price,
            non_member_limit=data.non_member_limit,
        )

        variants: list[VariantResponse] = []
        if data.variants:
            for v in data.variants:
                var = await self.shop_repo.add_or_update_variant(
                    product_id=prod.product_id,
                    size=v.size,
                    stock_quantity=v.stock_quantity,
                )
                variants.append(
                    VariantResponse(
                        variant_id=var.variant_id,
                        product_id=var.product_id,
                        size=var.size,
                        stock_quantity=var.stock_quantity,
                    )
                )

        await self.session.commit()
        return ProductResponse(
            product_id=prod.product_id,
            name=prod.name,
            description=prod.description,
            price=format_money(prod.price),
            member_price=format_money(prod.member_price),
            non_member_limit=prod.non_member_limit,
            non_member_units_taken=0,
            non_member_units_left=prod.non_member_limit,
            variants=variants,
        )

    async def list_products(self) -> list[ProductResponse]:
        products = await self.shop_repo.get_products()
        result: list[ProductResponse] = []
        for p in products:
            taken = await self.shop_repo.get_non_member_units_taken(p.product_id)
            left = max(0, p.non_member_limit - taken)
            variants = [
                VariantResponse(
                    variant_id=v.variant_id,
                    product_id=v.product_id,
                    size=v.size,
                    stock_quantity=v.stock_quantity,
                )
                for v in p.variants
            ]
            result.append(
                ProductResponse(
                    product_id=p.product_id,
                    name=p.name,
                    description=p.description,
                    price=format_money(p.price),
                    member_price=format_money(p.member_price),
                    non_member_limit=p.non_member_limit,
                    non_member_units_taken=taken,
                    non_member_units_left=left,
                    variants=variants,
                )
            )
        return result

    async def get_product(self, product_id: int) -> ProductResponse:
        p = await self.shop_repo.get_product_by_id(product_id)
        if not p:
            raise NotFoundError("Product not found.")
        taken = await self.shop_repo.get_non_member_units_taken(p.product_id)
        left = max(0, p.non_member_limit - taken)
        variants = [
            VariantResponse(
                variant_id=v.variant_id,
                product_id=v.product_id,
                size=v.size,
                stock_quantity=v.stock_quantity,
            )
            for v in p.variants
        ]
        return ProductResponse(
            product_id=p.product_id,
            name=p.name,
            description=p.description,
            price=format_money(p.price),
            member_price=format_money(p.member_price),
            non_member_limit=p.non_member_limit,
            non_member_units_taken=taken,
            non_member_units_left=left,
            variants=variants,
        )

    async def add_variant(self, product_id: int, data: VariantCreate) -> VariantResponse:
        v = await self.shop_repo.add_or_update_variant(
            product_id=product_id,
            size=data.size,
            stock_quantity=data.stock_quantity,
        )
        await self.session.commit()
        return VariantResponse(
            variant_id=v.variant_id,
            product_id=v.product_id,
            size=v.size,
            stock_quantity=v.stock_quantity,
        )

    async def place_order(self, data: OrderCreate) -> OrderResponse:
        today = datetime.date.today()
        is_active = False

        if data.member_id:
            is_active = await self.member_repo.has_active_membership(data.member_id, today)

        items_input = [(it.variant_id, it.quantity) for it in data.items]
        order = await self.shop_repo.place_order(
            member_id=data.member_id,
            buyer_name=data.buyer_name,
            buyer_email=data.buyer_email,
            items_input=items_input,
            is_active_member=is_active,
        )
        await self.session.commit()
        return await self.get_order(order.order_id)

    async def cancel_order(self, order_id: int) -> OrderCancelResponse:
        order = await self.shop_repo.cancel_order(order_id)
        await self.session.commit()
        return OrderCancelResponse(
            order_id=order.order_id,
            status=order.status,
            message="Order cancelled and stock restored.",
        )

    async def get_order(self, order_id: int) -> OrderResponse:
        order = await self.shop_repo.get_order_by_id(order_id)
        if not order:
            raise NotFoundError("Order not found.")
        return self._format_order(order)

    async def list_orders(
        self,
        member_id: Optional[int] = None,
        status: Optional[str] = None,
    ) -> list[OrderResponse]:
        orders = await self.shop_repo.list_orders(member_id=member_id, status=status)
        return [self._format_order(o) for o in orders]

    def _format_order(self, order: Order) -> OrderResponse:
        items: list[OrderItemResponse] = []
        total = Decimal("0.00")
        for it in order.items:
            items.append(
                OrderItemResponse(
                    variant_id=it.variant_id,
                    product_name=it.variant.product.name if it.variant and it.variant.product else "",
                    size=it.variant.size if it.variant else "",
                    quantity=it.quantity,
                    unit_price=format_money(it.unit_price),
                )
            )
            total += it.unit_price * it.quantity

        return OrderResponse(
            order_id=order.order_id,
            member_id=order.member_id,
            buyer_name=order.buyer_name,
            buyer_email=order.buyer_email,
            status=order.status,
            total_amount=format_money(total),
            ordered_at=order.ordered_at,
            items=items,
            payment_id=order.payment_id,
        )
