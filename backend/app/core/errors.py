from typing import Any


class APIException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class ValidationError(APIException):
    def __init__(
        self,
        message: str = "Please check the highlighted fields.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="VALIDATION_ERROR", message=message, status_code=422, details=details)


class UnauthenticatedError(APIException):
    def __init__(
        self,
        message: str = "Please sign in again.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="UNAUTHENTICATED", message=message, status_code=401, details=details)


class ForbiddenError(APIException):
    def __init__(
        self,
        message: str = "You don't have access to this.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="FORBIDDEN", message=message, status_code=403, details=details)


class NotFoundError(APIException):
    def __init__(
        self,
        message: str = "We couldn't find that.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="NOT_FOUND", message=message, status_code=404, details=details)


class DuplicateEmailError(APIException):
    def __init__(
        self,
        message: str = "This email is already registered. Try signing in.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="DUPLICATE_EMAIL", message=message, status_code=409, details=details)


class SoldOutError(APIException):
    def __init__(
        self,
        message: str = "Sorry, this event is sold out.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="SOLD_OUT", message=message, status_code=409, details=details)


class InsufficientStockError(APIException):
    def __init__(
        self,
        message: str = "That size is no longer available in this quantity.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="INSUFFICIENT_STOCK", message=message, status_code=409, details=details)


class TicketNotFoundError(APIException):
    def __init__(
        self,
        message: str = "Ticket not found.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="TICKET_NOT_FOUND", message=message, status_code=404, details=details)


class TicketAlreadyCheckedInError(APIException):
    def __init__(
        self,
        message: str = "Already checked in.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="TICKET_ALREADY_CHECKED_IN", message=message, status_code=409, details=details)


class TicketUnpaidError(APIException):
    def __init__(
        self,
        message: str = "This ticket has not been paid for.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="TICKET_UNPAID", message=message, status_code=409, details=details)


class TicketWrongEventError(APIException):
    def __init__(
        self,
        message: str = "This ticket is for a different event.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="TICKET_WRONG_EVENT", message=message, status_code=409, details=details)


class OrderNotPayableError(APIException):
    def __init__(
        self,
        message: str = "This order can no longer be paid. Please place it again.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="ORDER_NOT_PAYABLE", message=message, status_code=409, details=details)


class ReservationExpiredError(APIException):
    def __init__(
        self,
        message: str = "Your hold expired. Please try again.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="RESERVATION_EXPIRED", message=message, status_code=409, details=details)


class PaymentFailedError(APIException):
    def __init__(
        self,
        message: str = "Payment didn't go through. You have not been charged.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="PAYMENT_FAILED", message=message, status_code=402, details=details)


class PaymentSignatureInvalidError(APIException):
    def __init__(
        self,
        message: str = "Invalid webhook signature.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="PAYMENT_SIGNATURE_INVALID", message=message, status_code=400, details=details)


class InvalidStateTransitionError(APIException):
    def __init__(
        self,
        message: str = "That action isn't possible in the current status.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="INVALID_STATE_TRANSITION", message=message, status_code=409, details=details)


class SelfApprovalNotAllowedError(APIException):
    def __init__(
        self,
        message: str = "Another officer needs to review your own expense.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="SELF_APPROVAL_NOT_ALLOWED", message=message, status_code=403, details=details)


class IdempotencyConflictError(APIException):
    def __init__(
        self,
        message: str = "Duplicate request detected.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="IDEMPOTENCY_CONFLICT", message=message, status_code=409, details=details)


class RateLimitedError(APIException):
    def __init__(
        self,
        message: str = "Too many attempts. Try practical limits.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="RATE_LIMITED", message=message, status_code=429, details=details)


class ServiceUnavailableError(APIException):
    def __init__(
        self,
        message: str = "Something is wrong on our side. Please try again shortly.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="SERVICE_UNAVAILABLE", message=message, status_code=503, details=details)


class InternalError(APIException):
    def __init__(
        self,
        message: str = "Something went wrong.",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(code="INTERNAL_ERROR", message=message, status_code=500, details=details)
