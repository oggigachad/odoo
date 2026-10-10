import datetime
import uuid
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import (
    NotFoundError,
    SoldOutError,
    SoldOutNonMemberError,
    TicketAlreadyCheckedInError,
    TicketNotFoundError,
    TicketUnpaidError,
    TicketWrongEventError,
)
from app.models.schema_models import Event, Member, Ticket, TicketType


class EventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_event(
        self,
        title: str,
        description: Optional[str],
        venue: Optional[str],
        starts_at: datetime.datetime,
    ) -> Event:
        event = Event(
            title=title.strip(),
            description=description.strip() if description else None,
            venue=venue.strip() if venue else None,
            starts_at=starts_at,
        )
        self.session.add(event)
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def get_events(self) -> Sequence[Event]:
        result = await self.session.execute(
            select(Event).options(selectinload(Event.ticket_types)).order_by(Event.starts_at.asc())
        )
        return result.scalars().all()

    async def get_event_by_id(self, event_id: int) -> Optional[Event]:
        result = await self.session.execute(
            select(Event).options(selectinload(Event.ticket_types)).where(Event.event_id == event_id)
        )
        return result.scalars().first()

    async def update_event(
        self,
        event_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        venue: Optional[str] = None,
        starts_at: Optional[datetime.datetime] = None,
    ) -> Event:
        event = await self.get_event_by_id(event_id)
        if not event:
            raise NotFoundError("Event not found.")
        if title is not None:
            event.title = title.strip()
        if description is not None:
            event.description = description.strip()
        if venue is not None:
            event.venue = venue.strip()
        if starts_at is not None:
            event.starts_at = starts_at
        await self.session.flush()
        await self.session.refresh(event)
        return event

    async def create_ticket_type(
        self,
        event_id: int,
        name: str,
        member_price: Decimal,
        non_member_price: Decimal,
        seat_limit: int,
        non_member_seat_limit: int,
    ) -> TicketType:
        ttype = TicketType(
            event_id=event_id,
            name=name.strip(),
            member_price=member_price,
            non_member_price=non_member_price,
            seat_limit=seat_limit,
            non_member_seat_limit=non_member_seat_limit,
        )
        self.session.add(ttype)
        await self.session.flush()
        await self.session.refresh(ttype)
        return ttype

    async def get_ticket_type_by_id(self, ticket_type_id: int) -> Optional[TicketType]:
        return await self.session.get(TicketType, ticket_type_id)

    async def release_expired_tickets(self, ticket_type_id: Optional[int] = None) -> int:
        """Lazy cleanup of unpaid ticket holds older than 15 minutes."""
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=15)
        stmt = delete(Ticket).where(
            Ticket.payment_id.is_(None),
            Ticket.price_paid > 0,
            Ticket.purchased_at < cutoff,
        )
        if ticket_type_id:
            stmt = stmt.where(Ticket.ticket_type_id == ticket_type_id)
        res = await self.session.execute(stmt)
        return int(getattr(res, "rowcount", 0))

    async def get_ticket_availability(self, ticket_type_id: int) -> dict[str, int]:
        """Calculates current availability (counting active holds)."""
        ttype = await self.get_ticket_type_by_id(ticket_type_id)
        if not ttype:
            raise NotFoundError("Ticket type not found.")

        # Clean expired holds first
        await self.release_expired_tickets(ticket_type_id)

        count_stmt = select(
            func.count(Ticket.ticket_id),
            func.count(func.nullif(Ticket.member_id.is_not(None), True)),
        ).where(Ticket.ticket_type_id == ticket_type_id)

        res = await self.session.execute(count_stmt)
        row = res.one()
        total_sold = row[0] or 0
        non_member_sold = row[1] or 0

        seats_left = max(0, ttype.seat_limit - total_sold)
        non_member_seats_left = max(0, ttype.non_member_seat_limit - non_member_sold)

        return {
            "seat_limit": ttype.seat_limit,
            "sold": total_sold,
            "seats_left": seats_left,
            "non_member_seat_limit": ttype.non_member_seat_limit,
            "non_member_sold": non_member_sold,
            "non_member_seats_left": non_member_seats_left,
        }

    async def reserve_tickets(
        self,
        ticket_type_id: int,
        holders: list[dict[str, Optional[str]]],
        member_lookup_map: dict[str, Optional[Member]],
    ) -> list[Ticket]:
        """
        Concurrency-safe ticket purchase with zero oversell.
        1. Lazily purge expired holds.
        2. Row lock (FOR UPDATE) on ticket_type.
        3. Atomically check total and non-member seat limits.
        4. Insert Ticket rows.
        """
        await self.release_expired_tickets(ticket_type_id)

        # 1. Acquire row lock
        lock_stmt = select(TicketType).where(TicketType.ticket_type_id == ticket_type_id).with_for_update()
        lock_res = await self.session.execute(lock_stmt)
        ttype = lock_res.scalars().first()
        if not ttype:
            raise NotFoundError("Ticket type not found.")

        # 2. Count current sold tickets
        counts_res = await self.session.execute(
            select(
                func.count(Ticket.ticket_id),
                func.count(func.nullif(Ticket.member_id.is_not(None), True)),
            ).where(Ticket.ticket_type_id == ticket_type_id)
        )
        row = counts_res.one()
        current_sold = row[0] or 0
        current_non_member_sold = row[1] or 0

        # Calculate requested tickets
        num_requested = len(holders)
        new_tickets: list[Ticket] = []
        num_requested_non_member = 0

        for h in holders:
            email = (h.get("holder_email") or "").strip().lower()
            name = (h.get("holder_name") or "").strip()
            member = member_lookup_map.get(email)

            if member:
                price = ttype.member_price
                member_id = member.member_id
            else:
                price = ttype.non_member_price
                member_id = None
                num_requested_non_member += 1

            ticket = Ticket(
                ticket_type_id=ticket_type_id,
                member_id=member_id,
                holder_name=name,
                holder_email=email if email else None,
                price_paid=price,
                ticket_code=uuid.uuid4(),
            )
            new_tickets.append(ticket)

        # 3. Check seat limits
        if current_sold + num_requested > ttype.seat_limit:
            raise SoldOutError()

        if current_non_member_sold + num_requested_non_member > ttype.non_member_seat_limit:
            raise SoldOutNonMemberError()

        # 4. Insert tickets
        self.session.add_all(new_tickets)
        await self.session.flush()
        for t in new_tickets:
            await self.session.refresh(t)

        return new_tickets

    async def check_in_ticket(
        self,
        ticket_code_str: str,
        event_id: int,
        officer_id: int,
    ) -> tuple[Ticket, Event]:
        """
        Atomic door check-in with exact failure codes.
        Checks:
        1. TICKET_NOT_FOUND
        2. TICKET_WRONG_EVENT
        3. TICKET_UNPAID
        4. TICKET_ALREADY_CHECKED_IN
        """
        try:
            code_uuid = uuid.UUID(ticket_code_str.strip())
        except ValueError:
            raise TicketNotFoundError() from None

        # Lock ticket row FOR UPDATE to prevent double-scan race
        stmt = (
            select(Ticket, TicketType, Event)
            .join(TicketType, TicketType.ticket_type_id == Ticket.ticket_type_id)
            .join(Event, Event.event_id == TicketType.event_id)
            .where(Ticket.ticket_code == code_uuid)
            .with_for_update(of=Ticket)
        )
        result = await self.session.execute(stmt)
        row = result.first()
        if not row:
            raise TicketNotFoundError()

        ticket, ttype, event = row

        if event.event_id != event_id:
            raise TicketWrongEventError()

        # Free ticket (price_paid == 0) is valid immediately without payment_id
        if ticket.payment_id is None and ticket.price_paid > 0:
            raise TicketUnpaidError()

        if ticket.checked_in_at is not None:
            raise TicketAlreadyCheckedInError()

        ticket.checked_in_at = datetime.datetime.now(datetime.timezone.utc)
        ticket.checked_in_by = officer_id
        await self.session.flush()
        await self.session.refresh(ticket)

        return ticket, event

    async def get_ticket_by_code(self, ticket_code_str: str) -> Optional[Ticket]:
        try:
            code_uuid = uuid.UUID(ticket_code_str.strip())
        except ValueError:
            return None
        result = await self.session.execute(select(Ticket).where(Ticket.ticket_code == code_uuid))
        return result.scalars().first()

    async def get_tickets_by_member(self, member_id: int) -> Sequence[Ticket]:
        result = await self.session.execute(
            select(Ticket)
            .options(selectinload(Ticket.ticket_type).selectinload(TicketType.event))
            .where(Ticket.member_id == member_id)
            .order_by(Ticket.purchased_at.desc())
        )
        return result.scalars().all()

    async def get_event_summary(self, event_id: int) -> Optional[tuple[Event, int, int, Decimal]]:
        stmt = (
            select(
                Event,
                func.count(Ticket.ticket_id),
                func.count(Ticket.checked_in_at),
                func.coalesce(func.sum(Ticket.price_paid), 0),
            )
            .outerjoin(TicketType, TicketType.event_id == Event.event_id)
            .outerjoin(
                Ticket,
                (Ticket.ticket_type_id == TicketType.ticket_type_id)
                & ((Ticket.payment_id.is_not(None)) | (Ticket.price_paid == 0)),
            )
            .where(Event.event_id == event_id)
            .group_by(Event.event_id)
        )
        result = await self.session.execute(stmt)
        row = result.first()
        if not row:
            return None
        ev, sold, attended, rev = row
        return ev, sold or 0, attended or 0, Decimal(str(rev))
