import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class VariantCreate(BaseModel):
    size: str = Field(..., min_length=1, max_length=20)
    stock_quantity: int = Field(default=0, ge=0)


class VariantResponse(BaseModel):
    variant_id: int
    product_id: int
    size: str
    stock_quantity: int


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    price: str = "500.00"  # non-member price
    member_price: str = "400.00"
    non_member_limit: int = Field(default=0, ge=0)
    max_per_member: Optional[int] = Field(default=None, gt=0)
    max_per_guest: Optional[int] = Field(default=None, gt=0)
    image_url: Optional[str] = Field(default=None, max_length=300)
    variants: Optional[list[VariantCreate]] = None


class ProductResponse(BaseModel):
    product_id: int
    name: str
    description: Optional[str]
    price: str
    member_price: str
    non_member_limit: int
    non_member_units_taken: int = 0
    non_member_units_left: int = 0
    max_per_member: Optional[int] = None
    max_per_guest: Optional[int] = None
    image_url: Optional[str] = None
    variants: list[VariantResponse] = []


class OrderItemInput(BaseModel):
    variant_id: int
    quantity: int = Field(..., gt=0)


class OrderCreate(BaseModel):
    member_id: Optional[int] = None
    buyer_name: Optional[str] = None
    buyer_email: Optional[EmailStr] = None
    items: list[OrderItemInput] = Field(..., min_length=1)


class OrderItemResponse(BaseModel):
    variant_id: int
    product_name: str
    size: str
    quantity: int
    unit_price: str


class OrderResponse(BaseModel):
    order_id: int
    member_id: Optional[int]
    buyer_name: Optional[str]
    buyer_email: Optional[str]
    status: str
    total_amount: str
    ordered_at: datetime.datetime
    items: list[OrderItemResponse] = []
    payment_id: Optional[int] = None


class OrderCancelResponse(BaseModel):
    order_id: int
    status: str
    message: str
