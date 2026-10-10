from typing import Annotated, Optional

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireAnnouncer, RequireOfficer, RequireOperator, get_current_member, get_optional_member, is_officer
from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.database import get_db
from app.schemas.auth import MemberInfo
from app.schemas.events import LimitsUpdate
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


PRODUCT_IMG_DIR = Path(__file__).resolve().parents[3] / "uploads" / "products"
PRODUCT_IMG_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


@router.post("/products/image")
async def upload_product_image(
    _: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    file: Annotated[UploadFile, File(description="Product or design image (PNG, JPEG, WebP, up to 5 MB)")],
    design: bool = False,
) -> dict[str, str]:
    """Admin/officer uploads a merchandise picture or an exported design; the URL goes into the product form."""
    ext = PRODUCT_IMG_TYPES.get(file.content_type or "")
    if not ext:
        raise ValidationError("Images must be PNG, JPEG or WebP.")
    data = await file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise ValidationError("Image is larger than 5 MB.")
    from app.services.storage import make_thumbnail, save_media

    try:
        thumb = make_thumbnail(data, design=design)
    except Exception as exc:  # noqa: BLE001
        raise ValidationError("That file is not a readable image.") from exc
    name = uuid.uuid4().hex
    url = await save_media(f"products/{name}{ext}", data, file.content_type or "image/png")
    await save_media(f"products/t_{name}.webp", thumb, "image/webp")  # auto thumbnail for shop cards
    return {"url": url, "thumb_url": f"/api/v1/media/products/t_{name}.webp"}


@router.get("/media/{folder}/{name}", include_in_schema=False)
async def media(folder: str, name: str) -> Response:
    """Public read of stored pictures (MinIO or local disk)."""
    from app.services.storage import load_media

    if folder not in ("products",) or "/" in name or ".." in name:
        raise NotFoundError("Not found.")
    found = await load_media(f"{folder}/{name}")
    if not found and name.startswith("t_") and name.endswith(".webp"):
        # older pictures have no thumbnail yet: build it from the original on first request
        from app.services.storage import make_thumbnail, save_media

        stem = name[2:-5]
        for ext in (".png", ".jpg", ".webp"):
            orig = await load_media(f"{folder}/{stem}{ext}")
            if orig:
                thumb = make_thumbnail(orig[0], design=True)
                await save_media(f"{folder}/{name}", thumb, "image/webp")
                found = (thumb, "image/webp")
                break
    if not found:
        raise NotFoundError("Not found.")
    return Response(content=found[0], media_type=found[1], headers={"Cache-Control": "public, max-age=86400"})


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: int,
    _: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Admin/officer removes a product. With no orders it is deleted; otherwise it is hidden so order history stays intact."""
    from sqlalchemy import text

    from app.core.realtime import publish_event
    from app.models.schema_models import Product

    prod = await db.get(Product, product_id)
    if not prod:
        raise NotFoundError("Product not found.")
    used = (await db.execute(text(
        "SELECT COUNT(*) FROM order_items oi JOIN product_variants v ON v.variant_id = oi.variant_id WHERE v.product_id = :p"), {"p": product_id})).scalar_one()
    if used:
        prod.is_active = False
        result = "hidden"
    else:
        await db.execute(text("DELETE FROM product_variants WHERE product_id = :p"), {"p": product_id})
        await db.execute(text("DELETE FROM products WHERE product_id = :p"), {"p": product_id})
        result = "deleted"
    await db.commit()
    try:
        await publish_event("shop", {"action": "product_removed", "product_id": product_id})
    except Exception:  # noqa: BLE001
        pass
    return {"status": result}


@router.patch("/products/{product_id}/image")
async def set_product_image(
    product_id: int,
    payload: dict[str, str | None],
    _: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str | None]:
    """Admin/officer attaches or replaces a product picture (URL returned by /products/image)."""
    from app.models.schema_models import Product

    url = payload.get("image_url")
    if url and not url.startswith("/api/v1/media/products/"):
        raise ValidationError("Upload the picture first, then attach the returned link.")
    prod = await db.get(Product, product_id)
    if not prod:
        raise NotFoundError("Product not found.")
    prod.image_url = url or None
    await db.commit()
    return {"image_url": prod.image_url}


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate,
    _: Annotated[MemberInfo, Depends(RequireOperator)],
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
    _: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VariantResponse:
    """Officer adds or updates stock for a size variant."""
    service = ShopService(db)
    return await service.add_variant(product_id, payload)


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def place_order(
    payload: OrderCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[MemberInfo | None, Depends(get_optional_member)] = None,
) -> OrderResponse:
    """
    Place a goodie order for members or non-members.
    Enforces non-member quota and atomically decrements variant stock (row-level locks).
    Held for 15 minutes while paying.

    A signed-in buyer is always priced from their own account: the member_id in the body is only
    honoured for staff placing an order on someone's behalf, so member pricing cannot be spoofed.
    """
    if user is None:
        payload = payload.model_copy(update={"member_id": None})
    elif is_officer(user) and payload.member_id is not None and payload.member_id != user.member_id:
        # Staff ordering on someone's behalf: record that person's name and email (non-members are stored by them)
        from app.repositories.member_repo import MemberRepository

        target = await MemberRepository(db).get_by_id(payload.member_id)
        if not target:
            raise NotFoundError("Member not found.")
        payload = payload.model_copy(update={"buyer_name": target.full_name, "buyer_email": target.email})
    else:
        # Signed-in buyer: priced from their own account; non-members are recorded by name + email.
        payload = payload.model_copy(
            update={"member_id": user.member_id, "buyer_name": user.full_name, "buyer_email": user.email}
        )
    service = ShopService(db)
    return await service.place_order(payload)


async def _owned_order(order_id: int, user: MemberInfo, db: AsyncSession) -> OrderResponse:
    order = await ShopService(db).get_order(order_id)
    owner = order.member_id == user.member_id or (order.buyer_email or "").lower() == user.email.lower()
    if not (owner or is_officer(user)):
        raise ForbiddenError("You can only access your own orders.")
    return order


@router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: int,
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderResponse:
    """Order detail (buyer or staff only)."""
    return await _owned_order(order_id, user, db)


@router.post("/orders/{order_id}/cancel", response_model=OrderCancelResponse)
async def cancel_order(
    order_id: int,
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OrderCancelResponse:
    """Cancel a placed order and return stock (buyer or staff only)."""
    await _owned_order(order_id, user, db)
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
    return await service.list_orders(member_id=current_user.member_id, buyer_email=current_user.email)


@router.patch("/products/{product_id}/limits")
async def set_product_limits(
    product_id: int,
    payload: LimitsUpdate,
    _: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Admin/officer sets how many units one member / one non-member may order (null removes the cap)."""
    await ShopService(db).update_limits(product_id, payload.max_per_member, payload.max_per_guest)
    return {"status": "ok"}
