import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIException, NotFoundError, TicketNotFoundError, ValidationError
from app.core.security import build_ticket_qr_payload, parse_ticket_qr_payload
from app.core.helpers import format_money, to_decimal
from app.core.redis import invalidate_report_caches
from app.models.schema_models import Member
from app.repositories.event_repo import EventRepository
from app.repositories.member_repo import MemberRepository
from app.schemas.events import (
    CheckInBatchRequest,
    CheckInBatchResponse,
    CheckInBatchResult,
    EventManifestResponse,
    ManifestTicket,
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
        if data.form_url and data.form_url.strip().lower().startswith(("https://", "http://")):
            event.form_url = data.form_url.strip()

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
                    description=tt.description,
                    member_price=m_price,
                    non_member_price=nm_price,
                    seat_limit=tt.seat_limit,
                    non_member_seat_limit=tt.non_member_seat_limit,
                    max_per_member=tt.max_per_member,
                    max_per_guest=tt.max_per_guest,
                )
                ttype_responses.append(
                    TicketTypeResponse(
                        ticket_type_id=created_tt.ticket_type_id,
                        event_id=created_tt.event_id,
                        name=created_tt.name,
                        description=created_tt.description,
                        member_price=format_money(created_tt.member_price),
                        non_member_price=format_money(created_tt.non_member_price),
                        seat_limit=created_tt.seat_limit,
                        non_member_seat_limit=created_tt.non_member_seat_limit,
                        max_per_member=created_tt.max_per_member,
                        max_per_guest=created_tt.max_per_guest,
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
                        description=tt.description,
                        member_price=format_money(tt.member_price),
                        non_member_price=format_money(tt.non_member_price),
                        seat_limit=tt.seat_limit,
                        non_member_seat_limit=tt.non_member_seat_limit,
                        max_per_member=tt.max_per_member,
                        max_per_guest=tt.max_per_guest,
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
                    description=tt.description,
                    member_price=format_money(tt.member_price),
                    non_member_price=format_money(tt.non_member_price),
                    seat_limit=tt.seat_limit,
                    non_member_seat_limit=tt.non_member_seat_limit,
                    max_per_member=tt.max_per_member,
                    max_per_guest=tt.max_per_guest,
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
            description=data.description,
            member_price=m_price,
            non_member_price=nm_price,
            seat_limit=data.seat_limit,
            non_member_seat_limit=data.non_member_seat_limit,
            max_per_member=data.max_per_member,
            max_per_guest=data.max_per_guest,
        )
        await self.session.commit()
        return TicketTypeResponse(
            ticket_type_id=tt.ticket_type_id,
            event_id=tt.event_id,
            name=tt.name,
            description=tt.description,
            member_price=format_money(tt.member_price),
            non_member_price=format_money(tt.non_member_price),
            seat_limit=tt.seat_limit,
            non_member_seat_limit=tt.non_member_seat_limit,
            max_per_member=tt.max_per_member,
            max_per_guest=tt.max_per_guest,
            sold=0,
            seats_left=tt.seat_limit,
            non_member_sold=0,
            non_member_seats_left=tt.non_member_seat_limit,
        )

    async def purchase_tickets(self, data: TicketPurchaseRequest, buyer=None) -> TicketPurchaseResponse:  # type: ignore[no-untyped-def]
        """
        Concurrency-safe ticket purchase.
        Prices each ticket based on active membership status of the holder email (D-022).
        Holds seat in PostgreSQL for 15 minutes (D-008, D-028).
        """
        today = datetime.date.today()
        member_map: dict[str, Optional[Member]] = {}

        # 1. Who is a member? Only the signed-in buyer, and only for their own ticket. A blank holder e-mail means
        #    the buyer; every other e-mail is priced as a non-member (otherwise anyone could type a member's address).
        buyer_email = (buyer.email or "").strip().lower() if buyer else ""
        buyer_member = None
        if buyer and buyer.is_active:
            buyer_member = await self.member_repo.get_by_id(buyer.member_id)
        for h in data.holders:
            email = (h.holder_email or "").strip().lower()
            if not email and buyer_email:
                email = buyer_email
                h.holder_email = buyer_email
            if email and email not in member_map:
                member_map[email] = buyer_member if (email == buyer_email and buyer_member) else None

        # 1b. Per-person caps set by admin/officer (members and non-members can have different caps)
        await self._enforce_person_limits(data, member_map)

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

        ctx = await self.event_repo.get_ticket_context([t.ticket_type_id for t in tickets])
        ticket_responses = [self._format_ticket(t, ctx.get(t.ticket_type_id)) for t in tickets]

        return TicketPurchaseResponse(
            tickets=ticket_responses,
            total_amount=format_money(total),
            requires_payment=requires_payment,
            order_id=None,
        )

    async def _enforce_person_limits(self, data: TicketPurchaseRequest, member_map: dict) -> None:  # type: ignore[type-arg]
        from sqlalchemy import func, select

        from app.core.errors import PurchaseLimitError
        from app.models.schema_models import Ticket, TicketType

        tt = await self.session.get(TicketType, data.ticket_type_id)
        if not tt or (tt.max_per_member is None and tt.max_per_guest is None):
            return
        wanted: dict[str, int] = {}
        for h in data.holders:
            key = (h.holder_email or "").strip().lower()
            if not key:
                raise ValidationError("Enter an e-mail for every ticket holder: this ticket has a per-person limit.")
            wanted[key] = wanted.get(key, 0) + 1
        for email, count in wanted.items():
            is_member = member_map.get(email) is not None
            cap = tt.max_per_member if is_member else tt.max_per_guest
            if cap is None:
                continue
            held = 0
            if email:
                held = (
                    await self.session.execute(
                        select(func.count(Ticket.ticket_id)).where(
                            Ticket.ticket_type_id == tt.ticket_type_id, func.lower(Ticket.holder_email) == email
                        )
                    )
                ).scalar_one()
            if held + count > cap:
                who = "members" if is_member else "non-members"
                raise PurchaseLimitError(f"Limit reached: {who} can hold at most {cap} ticket(s) of this type per person.")

    async def update_ticket_type(self, ticket_type_id: int, description, member_price, non_member_price) -> None:
        from decimal import Decimal, InvalidOperation
        from app.models.schema_models import TicketType

        tt = await self.session.get(TicketType, ticket_type_id)
        if not tt:
            raise NotFoundError("Ticket type not found.")
        try:
            if member_price is not None:
                tt.member_price = Decimal(member_price)
            if non_member_price is not None:
                tt.non_member_price = Decimal(non_member_price)
        except InvalidOperation:
            raise ValidationError("Enter a valid price.")
        if (tt.member_price or 0) < 0 or (tt.non_member_price or 0) < 0:
            raise ValidationError("Prices cannot be negative.")
        if description is not None:
            tt.description = description.strip() or None
        await self.session.commit()

    async def update_limits(self, ticket_type_id: int, max_per_member: Optional[int], max_per_guest: Optional[int]) -> None:
        from app.models.schema_models import TicketType

        tt = await self.session.get(TicketType, ticket_type_id)
        if not tt:
            raise NotFoundError("Ticket type not found.")
        tt.max_per_member = max_per_member
        tt.max_per_guest = max_per_guest
        await self.session.commit()

    async def _membership_for_tickets(self, ticket_ids: list[int]) -> dict[int, tuple[str, datetime.date]]:
        """ticket_id -> (membership type, valid until) for holders with a paid membership covering today."""
        if not ticket_ids:
            return {}
        from sqlalchemy import text

        rows = (await self.session.execute(text(
            "SELECT DISTINCT ON (t.ticket_id) t.ticket_id, mt.name, s.ends_on "
            "FROM tickets t "
            "JOIN members m ON m.member_id = t.member_id OR (t.member_id IS NULL AND lower(m.email) = lower(t.holder_email)) "
            "JOIN memberships ms ON ms.member_id = m.member_id AND ms.payment_id IS NOT NULL "
            "JOIN semesters s ON s.semester_id = ms.semester_id AND CURRENT_DATE BETWEEN s.starts_on AND s.ends_on "
            "JOIN membership_types mt ON mt.membership_type_id = ms.membership_type_id "
            "WHERE t.ticket_id = ANY(:ids) ORDER BY t.ticket_id, s.ends_on DESC"), {"ids": ticket_ids})).all()
        return {r[0]: (r[1], r[2]) for r in rows}

    async def check_in(self, data: CheckInRequest, officer_id: int) -> CheckInResponse:
        """Atomic door check-in with exact failure codes.

        Accepts a signed QR payload, a full ticket code, or the 8-character manual code.
        """
        code = await self._resolve_ticket_input(data.ticket_code, data.event_id)
        ticket, event = await self.event_repo.check_in_ticket(
            ticket_code_str=code,
            event_id=data.event_id,
            officer_id=officer_id,
        )
        await self.session.commit()
        await invalidate_report_caches()
        badge = (await self._membership_for_tickets([ticket.ticket_id])).get(ticket.ticket_id)

        return CheckInResponse(
            status="ADMITTED",
            ticket_code=str(ticket.ticket_code),
            holder_name=ticket.holder_name,
            event_title=event.title,
            checked_in_at=ticket.checked_in_at or datetime.datetime.now(datetime.timezone.utc),
            is_member=badge is not None,
            membership_type=badge[0] if badge else None,
            member_valid_until=badge[1] if badge else None,
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

    async def get_my_tickets(self, member_id: int, email: Optional[str] = None) -> list[TicketResponse]:
        tickets = await self.event_repo.get_tickets_by_member(member_id, email)
        ctx = await self.event_repo.get_ticket_context([t.ticket_type_id for t in tickets])
        return [self._format_ticket(t, ctx.get(t.ticket_type_id)) for t in tickets]

    # ------------------------------------------------------------------
    # Ticket helpers, offline manifest and batch check-in
    # ------------------------------------------------------------------
    def _format_ticket(self, t, context=None) -> TicketResponse:  # type: ignore[no-untyped-def]
        code = str(t.ticket_code)
        tt, ev = context if context else (None, None)
        return TicketResponse(
            ticket_id=t.ticket_id,
            ticket_type_id=t.ticket_type_id,
            member_id=t.member_id,
            holder_name=t.holder_name,
            holder_email=t.holder_email,
            price_paid=format_money(t.price_paid),
            ticket_code=code,
            purchased_at=t.purchased_at,
            checked_in_at=t.checked_in_at,
            payment_id=t.payment_id,
            is_valid=(t.payment_id is not None or t.price_paid == 0),
            qr_payload=build_ticket_qr_payload(code),
            manual_code=code[:8].upper(),
            event_id=ev.event_id if ev else None,
            event_title=ev.title if ev else None,
            event_starts_at=ev.starts_at if ev else None,
            venue=ev.venue if ev else None,
            ticket_type_name=tt.name if tt else None,
        )

    async def _resolve_ticket_input(self, raw: str, event_id: int) -> str:
        value = raw.strip()
        if value.upper().startswith("SKYLINE1."):
            code = parse_ticket_qr_payload(value)
            if not code:
                raise TicketNotFoundError()  # forged or corrupted QR
            return code
        if len(value) == 36:
            return value
        if 6 <= len(value) <= 12 and all(c in "0123456789abcdefABCDEF" for c in value):
            resolved = await self.event_repo.resolve_manual_code(value, event_id)
            if resolved:
                return resolved
        raise TicketNotFoundError()

    async def get_manifest(self, event_id: int) -> EventManifestResponse:
        event = await self.event_repo.get_event_by_id(event_id)
        if not event:
            raise NotFoundError("Event not found.")
        rows = await self.event_repo.get_manifest_tickets(event_id)
        badges = await self._membership_for_tickets([t.ticket_id for t, _ in rows])
        return EventManifestResponse(
            event_id=event.event_id,
            title=event.title,
            generated_at=datetime.datetime.now(datetime.timezone.utc),
            tickets=[
                ManifestTicket(
                    ticket_code=str(t.ticket_code),
                    qr_payload=build_ticket_qr_payload(str(t.ticket_code)),
                    manual_code=str(t.ticket_code)[:8].upper(),
                    holder_name=t.holder_name,
                    ticket_type_name=tt.name,
                    checked_in=t.checked_in_at is not None,
                    is_member=t.ticket_id in badges,
                    membership_type=badges[t.ticket_id][0] if t.ticket_id in badges else None,
                )
                for t, tt in rows
            ],
        )

    async def check_in_batch(self, data: CheckInBatchRequest, officer_id: int) -> CheckInBatchResponse:
        """Sync scans that were captured offline. Each scan is validated independently."""
        results: list[CheckInBatchResult] = []
        for scan in data.scans:
            try:
                res = await self.check_in(CheckInRequest(ticket_code=scan.ticket_code, event_id=data.event_id), officer_id)
                results.append(CheckInBatchResult(ticket_code=scan.ticket_code, ok=True, holder_name=res.holder_name, is_member=res.is_member))
            except APIException as err:
                await self.session.rollback()
                results.append(
                    CheckInBatchResult(ticket_code=scan.ticket_code, ok=False, error_code=err.code, message=err.message)
                )
        return CheckInBatchResponse(results=results)
