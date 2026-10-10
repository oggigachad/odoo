import datetime
import uuid
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Member(Base):
    __tablename__ = "members"

    member_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    joined_on: Mapped[datetime.date] = mapped_column(Date, nullable=False, default=datetime.date.today)

    # Relationships
    leadership_roles: Mapped[List["LeadershipRole"]] = relationship(back_populates="member")
    memberships: Mapped[List["Membership"]] = relationship(back_populates="member")
    payments: Mapped[List["Payment"]] = relationship(back_populates="member")
    orders: Mapped[List["Order"]] = relationship(back_populates="member")
    expenses: Mapped[List["Expense"]] = relationship(back_populates="member")


class LeadershipRole(Base):
    __tablename__ = "leadership_roles"

    leadership_role_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=False)
    position: Mapped[str] = mapped_column(Text, nullable=False)
    term_year: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    member: Mapped["Member"] = relationship(back_populates="leadership_roles")

    __table_args__ = (UniqueConstraint("member_id", "position", "term_year", name="uq_member_position_year"),)


class Fundraiser(Base):
    __tablename__ = "fundraisers"

    fundraiser_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)
    goal_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)

    payments: Mapped[List["Payment"]] = relationship(back_populates="fundraiser")
    tasks: Mapped[List["FundraiserTask"]] = relationship(back_populates="fundraiser")
    expenses: Mapped[List["Expense"]] = relationship(back_populates="fundraiser")

    __table_args__ = (CheckConstraint("goal_amount IS NULL OR goal_amount >= 0", name="chk_fundraiser_goal"),)


class Payment(Base):
    __tablename__ = "payments"

    payment_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)  # dues, ticket, merchandise, fundraiser
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)  # cash, online
    paid_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())
    fundraiser_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("fundraisers.fundraiser_id"), nullable=True
    )

    member: Mapped[Optional["Member"]] = relationship(back_populates="payments")
    fundraiser: Mapped[Optional["Fundraiser"]] = relationship(back_populates="payments")

    __table_args__ = (
        CheckConstraint("category IN ('dues', 'ticket', 'merchandise', 'fundraiser')", name="chk_payment_category"),
        CheckConstraint("amount > 0", name="chk_payment_amount"),
        CheckConstraint("method IN ('cash', 'online')", name="chk_payment_method"),
        CheckConstraint("(category = 'fundraiser') = (fundraiser_id IS NOT NULL)", name="chk_payment_fundraiser_link"),
        Index("payments_category_idx", "category"),
    )


class Membership(Base):
    __tablename__ = "memberships"

    membership_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=False)
    valid_from: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    dues_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("payments.payment_id"), nullable=True)
    renewal_reminder_sent_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    member: Mapped["Member"] = relationship(back_populates="memberships")
    payment: Mapped[Optional["Payment"]] = relationship()

    __table_args__ = (
        CheckConstraint("dues_amount >= 0", name="chk_dues_amount"),
        CheckConstraint("valid_until > valid_from", name="chk_membership_dates"),
        Index("memberships_member_idx", "member_id", "valid_until"),
    )


class Event(Base):
    __tablename__ = "events"

    event_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    venue: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    ticket_types: Mapped[List["TicketType"]] = relationship(back_populates="event")
    expenses: Mapped[List["Expense"]] = relationship(back_populates="event")


class TicketType(Base):
    __tablename__ = "ticket_types"

    ticket_type_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("events.event_id"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False, default="General")
    member_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    non_member_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    seat_limit: Mapped[int] = mapped_column(Integer, nullable=False)

    event: Mapped["Event"] = relationship(back_populates="ticket_types")
    tickets: Mapped[List["Ticket"]] = relationship(back_populates="ticket_type")

    __table_args__ = (
        CheckConstraint("member_price >= 0", name="chk_ticket_member_price"),
        CheckConstraint("non_member_price >= 0", name="chk_ticket_non_member_price"),
        CheckConstraint("seat_limit > 0", name="chk_ticket_seat_limit"),
        UniqueConstraint("event_id", "name", name="uq_event_ticket_name"),
    )


class Ticket(Base):
    __tablename__ = "tickets"

    ticket_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ticket_type_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ticket_types.ticket_type_id"), nullable=False)
    member_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=True)
    holder_name: Mapped[str] = mapped_column(Text, nullable=False)
    holder_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("payments.payment_id"), nullable=True)
    ticket_code: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, unique=True, nullable=False)
    purchased_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())
    checked_in_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_in_by: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=True)

    ticket_type: Mapped["TicketType"] = relationship(back_populates="tickets")
    payment: Mapped[Optional["Payment"]] = relationship()

    __table_args__ = (
        CheckConstraint("price_paid >= 0", name="chk_ticket_price_paid"),
        Index("tickets_type_idx", "ticket_type_id"),
    )


class Announcement(Base):
    __tablename__ = "announcements"

    announcement_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    posted_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=False)
    posted_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())

    author: Mapped["Member"] = relationship()


class Product(Base):
    __tablename__ = "products"

    product_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    member_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    variants: Mapped[List["ProductVariant"]] = relationship(back_populates="product")

    __table_args__ = (
        CheckConstraint("price >= 0", name="chk_product_price"),
        CheckConstraint("member_price >= 0", name="chk_product_member_price"),
    )


class ProductVariant(Base):
    __tablename__ = "product_variants"

    variant_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("products.product_id"), nullable=False)
    size: Mapped[str] = mapped_column(Text, nullable=False)
    stock_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    product: Mapped["Product"] = relationship(back_populates="variants")

    __table_args__ = (
        CheckConstraint("stock_quantity >= 0", name="chk_variant_stock"),
        UniqueConstraint("product_id", "size", name="uq_product_size"),
    )


class Order(Base):
    __tablename__ = "orders"

    order_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=False)
    ordered_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())
    status: Mapped[str] = mapped_column(Text, nullable=False, default="placed")
    payment_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("payments.payment_id"), nullable=True)

    member: Mapped["Member"] = relationship(back_populates="orders")
    items: Mapped[List["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payment: Mapped[Optional["Payment"]] = relationship()

    __table_args__ = (CheckConstraint("status IN ('placed', 'paid', 'cancelled')", name="chk_order_status"),)


class OrderItem(Base):
    __tablename__ = "order_items"

    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("orders.order_id", ondelete="CASCADE"), primary_key=True
    )
    variant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("product_variants.variant_id"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")
    variant: Mapped["ProductVariant"] = relationship()

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_item_quantity"),
        CheckConstraint("unit_price >= 0", name="chk_item_unit_price"),
    )


class FundraiserTask(Base):
    __tablename__ = "fundraiser_tasks"

    task_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    fundraiser_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("fundraisers.fundraiser_id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="todo")
    due_date: Mapped[Optional[datetime.date]] = mapped_column(Date, nullable=True)

    fundraiser: Mapped["Fundraiser"] = relationship(back_populates="tasks")
    assignee: Mapped[Optional["Member"]] = relationship()

    __table_args__ = (
        CheckConstraint("status IN ('todo', 'in_progress', 'done')", name="chk_task_status"),
        Index("fundraiser_tasks_idx", "fundraiser_id", "status"),
    )


class Expense(Base):
    __tablename__ = "expenses"

    expense_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("members.member_id"), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    receipt_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("events.event_id"), nullable=True)
    fundraiser_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("fundraisers.fundraiser_id"), nullable=True
    )
    incurred_on: Mapped[datetime.date] = mapped_column(Date, nullable=False, default=datetime.date.today)
    submitted_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())
    status: Mapped[str] = mapped_column(Text, nullable=False, default="submitted")
    reimbursed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    member: Mapped["Member"] = relationship(back_populates="expenses")
    event: Mapped[Optional["Event"]] = relationship(back_populates="expenses")
    fundraiser: Mapped[Optional["Fundraiser"]] = relationship(back_populates="expenses")

    __table_args__ = (
        CheckConstraint("amount > 0", name="chk_expense_amount"),
        CheckConstraint("status IN ('submitted', 'approved', 'reimbursed', 'rejected')", name="chk_expense_status"),
        CheckConstraint("(status = 'reimbursed') = (reimbursed_at IS NOT NULL)", name="chk_expense_reimbursed_at"),
    )
