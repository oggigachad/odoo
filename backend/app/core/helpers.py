from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal


def format_money(amount: Decimal | int | float | str | None) -> str:
    """Format money as an exact two-decimal string, e.g. '500.00'."""
    if amount is None:
        return "0.00"
    dec = Decimal(str(amount))
    quantized = dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"{quantized:.2f}"


def to_decimal(amount: Decimal | int | float | str | None) -> Decimal:
    """Convert value to Decimal quantized to two decimal places."""
    if amount is None:
        return Decimal("0.00")
    dec = Decimal(str(amount))
    return dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def utc_now() -> datetime:
    """Return current timestamp in UTC with timezone attached."""
    return datetime.now(timezone.utc)


def format_iso(dt: datetime | None) -> str | None:
    """Format datetime as UTC ISO-8601 string ending in Z."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
