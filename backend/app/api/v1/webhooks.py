from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas.finance import PaymentWebhookPayload
from app.services.finance_service import FinanceService

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/payment")
async def payment_webhook(
    payload: PaymentWebhookPayload,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """
    Payment gateway webhook (idempotent via external_ref).
    Links payments to memberships, tickets, and merchandise orders.
    """
    service = FinanceService(db)
    return await service.process_payment_webhook(payload)
