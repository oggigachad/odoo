from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireAnnouncer, RequireOfficer, RequireOperator, get_current_member, get_optional_member, is_officer
from app.core.database import get_db
from app.schemas.auth import MemberInfo
from app.core.errors import ForbiddenError, NotFoundError
from app.core.security import parse_ticket_qr_payload, build_ticket_qr_payload
from app.services.ticket_pdf import render_qr_png, render_ticket_pdf
from app.schemas.events import (
    EventFormUpdate,
    TicketTypeUpdate,
    LimitsUpdate,
    CheckInBatchRequest,
    CheckInBatchResponse,
    EventManifestResponse,
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
from app.services.event_service import EventService

router = APIRouter(tags=["Events & Tickets"])


@router.get("/events", response_model=list[EventResponse])
async def list_events(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[EventResponse]:
    """Public list of events and ticket availability."""
    service = EventService(db)
    return await service.list_events()


@router.post("/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    _: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventResponse:
    """Officer creates an event with ticket types."""
    service = EventService(db)
    return await service.create_event(payload)


@router.get("/events/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventResponse:
    """Public event detail and seats remaining."""
    service = EventService(db)
    return await service.get_event(event_id)


@router.post("/events/{event_id}/ticket-types", response_model=TicketTypeResponse, status_code=status.HTTP_201_CREATED)
async def add_ticket_type(
    event_id: int,
    payload: TicketTypeCreate,
    _: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TicketTypeResponse:
    """Officer adds a ticket type with total and non-member seat limits."""
    service = EventService(db)
    return await service.add_ticket_type(event_id, payload)


@router.post("/tickets/purchase", response_model=TicketPurchaseResponse, status_code=status.HTTP_201_CREATED)
async def purchase_tickets(
    payload: TicketPurchaseRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    buyer: Annotated[MemberInfo | None, Depends(get_optional_member)] = None,
) -> TicketPurchaseResponse:
    """
    Buy or hold tickets for members and non-members.
    Zero-oversell guaranteed by DB locks and triggers.
    Holds seat for 15 minutes while paying.

    Member prices are only given to the signed-in buyer's own ticket (blank holder e-mail = the buyer). Typing someone
    else's e-mail never unlocks a member price, and an e-mail is needed per holder where a per-person cap applies.
    """
    service = EventService(db)
    return await service.purchase_tickets(payload, buyer)


@router.post("/checkin", response_model=CheckInResponse)
async def check_in(
    payload: CheckInRequest,
    current_officer: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CheckInResponse:
    """
    Door check-in: scan QR or manual code entry.
    Atomic check for duplicate scans, wrong event, or unpaid status.
    """
    service = EventService(db)
    return await service.check_in(payload, current_officer.member_id)


@router.get("/events/{event_id}/summary", response_model=EventSummaryResponse)
async def get_event_summary(
    event_id: int,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventSummaryResponse:
    """Officer summary of tickets sold, attendees, and revenue."""
    service = EventService(db)
    return await service.get_event_summary(event_id)


@router.get("/me/tickets", response_model=list[TicketResponse])
async def get_my_tickets(
    current_user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TicketResponse]:
    """Return all tickets held by the logged-in member."""
    service = EventService(db)
    return await service.get_my_tickets(current_user.member_id, current_user.email)


@router.get("/events/{event_id}/manifest", response_model=EventManifestResponse)
async def get_event_manifest(
    event_id: int,
    _: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EventManifestResponse:
    """Signed attendee manifest so door staff can keep checking people in while offline."""
    return await EventService(db).get_manifest(event_id)


@router.post("/checkin/batch", response_model=CheckInBatchResponse)
async def check_in_batch(
    payload: CheckInBatchRequest,
    current_officer: Annotated[MemberInfo, Depends(RequireOperator)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CheckInBatchResponse:
    """Replay scans that were captured offline; each is validated independently."""
    return await EventService(db).check_in_batch(payload, current_officer.member_id)


async def _authorized_ticket(
    ticket_code: str,
    sig: str | None,
    user: MemberInfo | None,
    db: AsyncSession,
):  # type: ignore[no-untyped-def]
    """A ticket file may be fetched by its holder, by staff, or by anyone who holds the signed QR token."""
    service = EventService(db)
    row = await service.event_repo.get_ticket_with_event(ticket_code)
    if not row:
        raise NotFoundError("Ticket not found.")
    ticket, ttype, event = row
    token_ok = bool(sig) and parse_ticket_qr_payload(f"SKYLINE1.{ticket_code}.{sig}") is not None
    holder_ok = bool(user) and (
        ticket.member_id == user.member_id
        or (ticket.holder_email and ticket.holder_email.lower() == user.email.lower())
    )
    staff_ok = bool(user) and is_officer(user)
    if not (token_ok or holder_ok or staff_ok):
        raise ForbiddenError("You can only download your own tickets.")
    return service._format_ticket(ticket, (ttype, event))


@router.get("/tickets/{ticket_code}/pdf")
async def download_ticket_pdf(
    ticket_code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[MemberInfo | None, Depends(get_optional_member)] = None,
    sig: Annotated[str | None, Query()] = None,
) -> Response:
    """Printable PDF ticket containing the signed Skyline QR code."""
    ticket = await _authorized_ticket(ticket_code, sig, user, db)
    pdf_bytes = render_ticket_pdf(ticket)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="skyline-ticket-{ticket.manual_code}.pdf"'},
    )


@router.get("/tickets/{ticket_code}/qr.png")
async def ticket_qr_png(
    ticket_code: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[MemberInfo | None, Depends(get_optional_member)] = None,
    sig: Annotated[str | None, Query()] = None,
) -> Response:
    ticket = await _authorized_ticket(ticket_code, sig, user, db)
    return Response(
        content=render_qr_png(build_ticket_qr_payload(ticket.ticket_code)),
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.patch("/ticket-types/{ticket_type_id}")
async def update_ticket_type(
    ticket_type_id: int,
    payload: TicketTypeUpdate,
    _: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Admin/officer edits a ticket type's description and prices after creation."""
    await EventService(db).update_ticket_type(ticket_type_id, payload.description, payload.member_price, payload.non_member_price)
    return {"status": "ok"}


@router.patch("/ticket-types/{ticket_type_id}/limits")
async def set_ticket_limits(
    ticket_type_id: int,
    payload: LimitsUpdate,
    _: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Admin/officer sets how many tickets one member / one non-member may hold (null removes the cap)."""
    await EventService(db).update_limits(ticket_type_id, payload.max_per_member, payload.max_per_guest)
    return {"status": "ok"}


def _clean_form_url(raw: str | None) -> str | None:
    from app.core.errors import ValidationError

    url = (raw or "").strip()
    if not url:
        return None
    if not url.lower().startswith(("https://", "http://")):
        raise ValidationError("The link must start with https://")
    return url


@router.patch("/events/{event_id}/form")
async def set_event_form(
    event_id: int,
    payload: EventFormUpdate,
    _: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str | None]:
    """Admin/officer pastes a Google Form (or any) link that ticket holders see, as a QR and a button, after paying."""
    from app.models.schema_models import Event

    ev = await db.get(Event, event_id)
    if not ev:
        raise NotFoundError("Event not found.")
    ev.form_url = _clean_form_url(payload.form_url)
    await db.commit()
    return {"form_url": ev.form_url}


async def _form_for(event_id: int, user: MemberInfo, db: AsyncSession) -> str:
    from sqlalchemy import text

    from app.models.schema_models import Event

    ev = await db.get(Event, event_id)
    if not ev or not ev.form_url:
        raise NotFoundError("This event has no form link.")
    if not is_officer(user):
        row = (await db.execute(text(
            "SELECT 1 FROM tickets t JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id "
            "WHERE tt.event_id = :e AND (t.member_id = :m OR lower(t.holder_email) = lower(:em)) "
            "AND (t.payment_id IS NOT NULL OR t.price_paid = 0) LIMIT 1"),
            {"e": event_id, "m": user.member_id, "em": user.email})).first()
        if not row:
            raise ForbiddenError("Buy and pay for a ticket to see the registration form.")
    return ev.form_url


@router.get("/events/{event_id}/form")
async def event_form(
    event_id: int,
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    return {"url": await _form_for(event_id, user, db)}


@router.get("/events/{event_id}/form-qr.png")
async def event_form_qr(
    event_id: int,
    user: Annotated[MemberInfo, Depends(get_current_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    return Response(content=render_qr_png(await _form_for(event_id, user, db), box_size=10), media_type="image/png", headers={"Cache-Control": "private, max-age=600"})


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: int,
    user: Annotated[MemberInfo, Depends(RequireAnnouncer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    force: bool = False,
) -> dict[str, str]:
    """Remove an event. Refused while paid tickets exist unless an Admin passes force=true (paid tickets are then voided)."""
    from sqlalchemy import text

    from app.core.errors import ValidationError
    from app.core.realtime import publish_event
    from app.models.schema_models import Event

    ev = await db.get(Event, event_id)
    if not ev:
        raise NotFoundError("Event not found.")
    paid = (await db.execute(text(
        "SELECT COUNT(*) FROM tickets t JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id "
        "WHERE tt.event_id = :e AND (t.payment_id IS NOT NULL OR t.price_paid = 0)"), {"e": event_id})).scalar_one()
    if paid and not (force and user.role == "Admin"):
        raise ValidationError(f"This event has {paid} issued ticket(s). Only an Admin can delete it, and that voids those tickets.")
    await db.execute(text("DELETE FROM tickets WHERE ticket_type_id IN (SELECT ticket_type_id FROM ticket_types WHERE event_id = :e)"), {"e": event_id})
    await db.execute(text("DELETE FROM ticket_types WHERE event_id = :e"), {"e": event_id})
    await db.execute(text("UPDATE expenses SET event_id = NULL WHERE event_id = :e"), {"e": event_id})
    await db.execute(text("DELETE FROM events WHERE event_id = :e"), {"e": event_id})
    await db.commit()
    try:
        await publish_event("events", {"action": "deleted", "event_id": event_id})
    except Exception:  # noqa: BLE001
        pass
    return {"status": "deleted"}


@router.get("/events/{event_id}/qr.png")
async def event_qr_png(
    event_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    origin: Annotated[str | None, Query()] = None,
) -> Response:
    """Poster QR for an event. Scanning it on a phone opens the event page on the website, where tickets can be booked."""
    from urllib.parse import urlparse
    from app.core.config import settings

    await EventService(db).get_event(event_id)  # 404 if the event does not exist

    raw_base = origin or request.headers.get("origin") or request.headers.get("referer")
    if raw_base and raw_base.startswith(("http://", "https://")):
        parsed = urlparse(raw_base)
        base = f"{parsed.scheme}://{parsed.netloc}"
    else:
        base = settings.FRONTEND_URL.rstrip("/")

    url = f"{base}/event/{event_id}"
    return Response(content=render_qr_png(url, box_size=12), media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})
