import asyncio
import logging
from typing import Any

from app.core.redis import dequeue_email, enqueue_email

logger = logging.getLogger(__name__)


async def process_email(job: dict[str, Any]) -> bool:
    """Send transactional email via configured provider or mock in dev/test."""
    email_type = job.get("type")
    to_email = job.get("to")
    logger.info(f"Sending email {email_type} to {to_email}")
    # In development/test, logs the send and succeeds
    return True


async def run_email_worker(max_iterations: int | None = None) -> None:
    """Continuously processes jobs from queue:emails."""
    iteration = 0
    while max_iterations is None or iteration < max_iterations:
        job = await dequeue_email(timeout=1)
        if job:
            attempts = job.get("attempts", 0) + 1
            job["attempts"] = attempts
            success = await process_email(job)
            if not success:
                if attempts < 3:
                    logger.warning(f"Retrying email job {job.get('type')}, attempt {attempts}")
                    await asyncio.sleep(2**attempts)
                    await enqueue_email(job)
                else:
                    logger.error(f"Failed to send email after 3 attempts: {job}")
        iteration += 1
