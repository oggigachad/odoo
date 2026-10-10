import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.core.helpers import format_money, to_decimal
from app.core.redis import invalidate_report_caches
from app.models.schema_models import Member
from app.repositories.event_repo import EventRepository
from app.repositories.member_repo import MemberRepository
from app.schemas.events import (
    CheckInRequest,
    CheckInResponse,
    EventCreate,
    EventResponse,
    EventSummaryResponse,
    TicketPurchaseRequest,
    TicketPurchaseResponse,
    TicketResponse,
    TicketTypeCreate,
    TicketTypeResponse,
)


class EventService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.event_repo = EventRepository(session)
        self.member_repo = MemberRepository(session)

    async def create_event(self, data: EventCreate) -> EventResponse:
        event = await self.event_repo.create_event(
            title=data.title,
            description=data.description,
            venue=data.venue,
            starts_at=data.starts_at,
        )

        ttype_responses: list[TicketTypeResponse] = []
        if data.ticket_types:
            for tt in data.ticket_types:
                m_price = to_decimal(tt.member_price)
                nm_price = to_decimal(tt.non_member_price)
                if tt.non_member_seat_limit > tt.seat_limit:
                    raise ValidationError("non_member_seat_limit cannot exceed seat_limit.")
                created_tt = await self.event_repo.create_ticket_type(
                    event_id=event.event_id,
                    name=tt.name,
                    member_price=m_price,
                    non_member_price=nm_price,
                    seat_limit=tt.seat_limit,
                    non_member_seat_limit=tt.non_member_seat_limit,
                )
                ttype_responses.append(
                    TicketTypeResponse(
                        ticket_type_id=created_tt.ticket_type_id,
                        event_id=created_tt.event_id,
                        name=created_tt.name,
                        member_price=format_money(created_tt.member_price),
                        non_member_price=format_money(created_tt.non_member_price),
                        seat_limit=created_tt.seat_limit,
                        non_member_seat_limit=created_tt.non_member_seat_limit,
                        sold=0,
                        seats_left=created_tt.seat_limit,
                        non_member_sold=0,
                        non_member_seats_left=created_tt.non_member_seat_limit,
                    )
                )

        await self.session.commit()
        return EventResponse(
            event_id=event.event_id,
            title=event.title,
            description=event.description,
            venue=event.venue,
            starts_at=event.starts_at,
            ticket_types=ttype_responses,
        )

    async def list_events(self) -> list[EventResponse]:
        events = await self.event_repo.get_events()
        items: list[EventResponse] = []
        for e in events:
            tt_items: list[TicketTypeResponse] = []
            for tt in e.ticket_types:
                avail = await self.event_repo.get_ticket_availability(tt.ticket_type_id)
                tt_items.append(
                    TicketTypeResponse(
                        ticket_type_id=tt.ticket_type_id,
                        event_id=tt.event_id,
                        name=tt.name,
                        member_price=format_money(tt.member_price),
                        non_member_price=format_money(tt.non_member_price),
                        seat_limit=tt.seat_limit,
                        non_member_seat_limit=tt.non_member_seat_limit,
                        sold=avail["sold"],
                        seats_left=avail["seats_left"],
                        non_member_sold=avail["non_member_sold"],
                        non_member_seats_left=avail["non_member_seats_left"],
                    )
                )
            items.append(
                EventResponse(
                    event_id=e.event_id,
                    title=e.title,
                    description=e.description,
                    venue=e.venue,
                    starts_at=e.starts_at,
                    ticket_types=tt_items,
                )
            )
        return items

    async def get_event(self, event_id: int) -> EventResponse:
        event = await self.event_repo.get_event_by_id(event_id)
        if not event:
            raise NotFoundError("Event not found.")

        tt_items: list[TicketTypeResponse] = []
        for tt in event.ticket_types:
            avail = await self.event_repo.get_ticket_availability(tt.ticket_type_id)
            tt_items.append(
                TicketTypeResponse(
                    ticket_type_id=tt.ticket_type_id,
                    event_id=tt.event_id,
                    name=tt.name,
                    member_price=format_money(tt.member_price),
                    non_member_price=format_money(tt.non_member_price),
                    seat_limit=tt.seat_limit,
                    non_member_seat_limit=tt.non_member_seat_limit,
                    sold=avail["sold"],
                    seats_left=avail["seats_left"],
                    non_member_sold=avail["non_member_sold"],
                    non_member_seats_left=avail["non_member_seats_left"],
                )
            )

        return EventResponse(
            event_id=event.event_id,
            title=event.title,
            description=event.description,
            venue=event.venue,
            starts_at=event.starts_at,
            ticket_types=tt_items,
        )

    async def add_ticket_type(self, event_id: int, data: TicketTypeCreate) -> TicketTypeResponse:
        event = await self.event_repo.get_event_by_id(event_id)
        if not event:
            raise NotFoundError("Event not found.")
        if data.non_member_seat_limit > data.seat_limit:
            raise ValidationError("non_member_seat_limit cannot exceed seat_limit.")

        m_price = to_decimal(data.member_price)
        nm_price = to_decimal(data.non_member_price)
        tt = await self.event_repo.create_ticket_type(
            event_id=event_id,
            name=data.name,
            member_price=m_price,
            non_member_price=nm_price,
            seat_limit=data.seat_limit,
            non_member_seat_limit=data.non_member_seat_limit,
        )
        await self.session.commit()
        return TicketTypeResponse(
            ticket_type_id=tt.ticket_type_id,
            event_id=tt.event_id,
            name=tt.name,
            member_price=format_money(tt.member_price),
            non_member_price=format_money(tt.non_member_price),
            seat_limit=tt.seat_limit,
            non_member_seat_limit=tt.non_member_seat_limit,
            sold=0,
            seats_left=tt.seat_limit,
            non_member_sold=0,
            non_member_seats_left=tt.non_member_seat_limit,
        )

    async def purchase_tickets(self, data: TicketPurchaseRequest) -> TicketPurchaseResponse:
        """
        Concurrency-safe ticket purchase.
        Prices each ticket based on active membership status of the holder email (D-022).
        Holds seat in PostgreSQL for 15 minutes (D-008, D-028).
        """
        today = datetime.date.today()
        member_map: dict[str, Optional[Member]] = {}

        # 1. Look up membership status for each holder email
        for h in data.holders:
            email = (h.holder_email or "").strip().lower()
            if email and email not in member_map:
                m = await self.member_repo.get_by_email(email)
                if m:
                    is_active = await self.member_repo.has_active_membership(m.member_id, today)
                    member_map[email] = m if is_active else None
                else:
                    member_map[email] = None

        # 2. Reserve tickets under row-level lock
        holders_dict = [h.model_dump() for h in data.holders]
        tickets = await self.event_repo.reserve_tickets(
            ticket_type_id=data.ticket_type_id,
            holders=holders_dict,
            member_lookup_map=member_map,
        )
        await self.session.commit()

        # Invalidate report caches (seats left changed)
        await invalidate_report_caches()

        total = sum((t.price_paid for t in tickets), Decimal("0.00"))
        requires_payment = total > Decimal("0.00")

        ticket_responses = [
            TicketResponse(
                ticket_id=t.ticket_id,
                ticket_type_id=t.ticket_type_id,
                member_id=t.member_id,
                holder_name=t.holder_name,
                holder_email=t.holder_email,
                price_paid=format_money(t.price_paid),
                ticket_code=str(t.ticket_code),
                purchased_at=t.purchased_at,
                checked_in_at=t.checked_in_at,
                payment_id=t.payment_id,
                is_valid=(t.payment_id is not None or t.price_paid == 0),
            )
            for t in tickets
        ]

        return TicketPurchaseResponse(
            tickets=ticket_responses,
            total_amount=format_money(total),
            requires_payment=requires_payment,
            order_id=None,
        )

    async def check_in(self, data: CheckInRequest, officer_id: int) -> CheckInResponse:
        """Atomic door check-in with exact failure codes."""
        ticket, event = await self.event_repo.check_in_ticket(
            ticket_code_str=data.ticket_code,
            event_id=data.event_id,
            officer_id=officer_id,
        )
        await self.session.commit()
        await invalidate_report_caches()

        return CheckInResponse(
            status="ADMITTED",
            ticket_code=str(ticket.ticket_code),
            holder_name=ticket.holder_name,
            event_title=event.title,
            checked_in_at=ticket.checked_in_at or datetime.datetime.now(datetime.timezone.utc),
        )

    async def get_event_summary(self, event_id: int) -> EventSummaryResponse:
        summary = await self.event_repo.get_event_summary(event_id)
        if not summary:
            raise NotFoundError("Event not found.")
        event, sold, attended, rev = summary
        return EventSummaryResponse(
            event_id=event.event_id,
            title=event.title,
            tickets_sold=sold,
            attended=attended,
            ticket_revenue=format_money(rev),
        )

    async def get_my_tickets(self, member_id: int) -> list[TicketResponse]:
        tickets = await self.event_repo.get_tickets_by_member(member_id)
        return [
            TicketResponse(
                ticket_id=t.ticket_id,
                ticket_type_id=t.ticket_type_id,
                member_id=t.member_id,
                holder_name=t.holder_name,
                holder_email=t.holder_email,
                price_paid=format_money(t.price_paid),
                ticket_code=str(t.ticket_code),
                purchased_at=t.purchased_at,
                checked_in_at=t.checked_in_at,
                payment_id=t.payment_id,
                is_valid=(t.payment_id is not None or t.price_paid == 0),
            )
            for t in tickets
        ]
