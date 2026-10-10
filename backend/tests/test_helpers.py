from datetime import timezone
from decimal import Decimal

from app.core.helpers import format_iso, format_money, to_decimal, utc_now


def test_format_money() -> None:
    assert format_money(500) == "500.00"
    assert format_money(Decimal("12.5")) == "12.50"
    assert format_money("99.999") == "100.00"
    assert format_money(None) == "0.00"


def test_to_decimal() -> None:
    assert to_decimal(10) == Decimal("10.00")
    assert to_decimal("45.67") == Decimal("45.67")
    assert to_decimal(None) == Decimal("0.00")


def test_time_helpers() -> None:
    now = utc_now()
    assert now.tzinfo == timezone.utc
    iso = format_iso(now)
    assert iso is not None
    assert iso.endswith("Z")
