from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer, get_current_member
from app.core.database import get_db
from app.schemas.auth import MemberInfo
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
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
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
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TicketTypeResponse:
    """Officer adds a ticket type with total and non-member seat limits."""
    service = EventService(db)
    return await service.add_ticket_type(event_id, payload)


@router.post("/tickets/purchase", response_model=TicketPurchaseResponse, status_code=status.HTTP_201_CREATED)
async def purchase_tickets(
    payload: TicketPurchaseRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TicketPurchaseResponse:
    """
    Buy or hold tickets for members and non-members.
    Zero-oversell guaranteed by DB locks and triggers.
    Holds seat for 15 minutes while paying.
    """
    service = EventService(db)
    return await service.purchase_tickets(payload)


@router.post("/checkin", response_model=CheckInResponse)
async def check_in(
    payload: CheckInRequest,
    current_officer: Annotated[MemberInfo, Depends(RequireOfficer)],
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
    return await service.get_my_tickets(current_user.member_id)
