from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer, get_current_member
from app.core.database import get_db
from app.schemas.auth import MemberInfo
from app.schemas.shop import (
    OrderCancelResponse,
    OrderCreate,
    OrderResponse,
    ProductCreate,
    ProductResponse,
    VariantCreate,
    VariantResponse,
)
from app.services.shop_service import ShopService

router = APIRouter(tags=["Merchandise & Shop"])


@router.get("/products", response_model=list[ProductResponse])
async def list_products(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ProductResponse]:
    """Public merchandise list with sizes and non-member limits."""
    service = ShopService(db)
    return await service.list_products()


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductResponse:
    """Officer creates a goodie product."""
    service = ShopService(db)
    return await service.create_product(payload)


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProductResponse:
    """Public product detail."""
    service = ShopService(db)
    return await service.get_product(product_id)


@router.post("/products/{product_id}/variants", response_model=VariantResponse, status_code=status.HTTP_201_CREATED)
async def add_variant(
    product_id: int,
    payload: VariantCreate,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VariantResponse:
    """Officer adds or updates stock for a size variant."""
    service = ShopService(db)
    return await service.add_variant(product_id, payload)


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def place_order(
    payload: OrderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """
    Place a goodie order for members or non-members.
    Enforces non-member quota and atomically decrements variant stock.
    Held for 15 minutes while paying.
    """
    service = ShopService(db)
    return await service.place_order(payload)


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Get order detail."""
    service = ShopService(db)
    return await service.get_order(order_id)


@router.post("/orders/{order_id}/cancel", response_model=OrderCancelResponse)
async def cancel_order(
    order_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderCancelResponse:
    """Cancel a placed order and return stock."""
    service = ShopService(db)
    return await service.cancel_order(order_id)


@router.get("/orders", response_model=list[OrderResponse])
async def list_orders(
    member_id: Annotated[Optional[int], Query(description="Filter by member")] = None,
    order_status: Annotated[Optional[str], Query(alias="status", description="Filter by status")] = None,
    _: Annotated[MemberInfo, Depends(RequireOfficer)] = None,  # type: ignore[assignment]
    db: Annotated[AsyncSession, Depends(get_db)] = None,  # type: ignore[assignment]
) -> list[OrderResponse]:
    """Officer list orders."""
    service = ShopService(db)
    return await service.list_orders(member_id=member_id, status=order_status)


@router.get("/me/orders", response_model=list[OrderResponse])
async def get_my_orders(
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OrderResponse]:
    """List orders placed by the current member."""
    service = ShopService(db)
    return await service.list_orders(member_id=current_user.member_id)
