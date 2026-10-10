"""Live dashboard analytics straight from PostgreSQL (no cached or placeholder numbers).

Staff (officers, treasurers, admins) get club-wide figures; members and guests get their own.
"""

import datetime as dt
from collections import defaultdict
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ValidationError
from app.core.redis import check_redis_health
from app.schemas.auth import MemberInfo

SALES_SERIES = [
    {"key": "ticket", "label": "Event Tickets"},
    {"key": "merchandise", "label": "Merchandise"},
    {"key": "dues", "label": "Membership Dues"},
    {"key": "fundraiser", "label": "Fundraisers"},
]
VISIT_SERIES = [
    {"key": "checkins", "label": "Check-ins"},
    {"key": "tickets", "label": "Tickets Issued"},
    {"key": "orders", "label": "Shop Orders"},
]


def _f(v: Any) -> float:
    return float(v) if isinstance(v, (Decimal, int, float)) else 0.0


def _pct_change(cur: float, prev: float) -> Optional[float]:
    if prev == 0:
        return None if cur == 0 else 100.0
    return round((cur - prev) / prev * 100, 1)


class _Buckets:
    """Time buckets in the viewer's local time, sized by how long the selected range is."""

    def __init__(self, start: dt.date, end: dt.date, tz_offset: int) -> None:
        self.tz = dt.timedelta(minutes=tz_offset)
        days = (end - start).days + 1
        if days <= 1:
            self.unit, self.step = "hour", dt.timedelta(hours=4)
        elif days <= 14:
            self.unit, self.step = "day", dt.timedelta(days=1)
        elif days <= 100:
            self.unit, self.step = "week", dt.timedelta(days=7)
        else:
            self.unit, self.step = "month", None
        self.starts: list[dt.datetime] = []
        cursor = dt.datetime.combine(start, dt.time())
        stop = dt.datetime.combine(end, dt.time()) + dt.timedelta(days=1)
        if self.unit == "month":
            cursor = cursor.replace(day=1)
            while cursor < stop:
                self.starts.append(cursor)
                cursor = (cursor.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        else:
            assert self.step is not None
            while cursor < stop:
                self.starts.append(cursor)
                cursor += self.step
        self.local_stop = stop

    def label(self, b: dt.datetime) -> str:
        if self.unit == "hour":
            return b.strftime("%I %p").lstrip("0")
        if self.unit == "day":
            return b.strftime("%a %d")
        if self.unit == "week":
            return b.strftime("%d %b")
        return b.strftime("%b %Y") if len(self.starts) > 12 else b.strftime("%b")

    def index(self, utc_dt: dt.datetime) -> Optional[int]:
        local = utc_dt.replace(tzinfo=None) if utc_dt.tzinfo is None else utc_dt.astimezone(dt.timezone.utc).replace(tzinfo=None)
        local = local + self.tz
        if local < self.starts[0] or local >= self.local_stop:
            return None
        idx = 0
        for i, s in enumerate(self.starts):
            if s <= local:
                idx = i
            else:
                break
        return idx


class DashboardService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _scalar(self, sql: str, params: dict[str, Any]) -> float:
        res = await self.session.execute(text(sql), params)
        return _f(res.scalar_one_or_none() or 0)

    async def _rows(self, sql: str, params: dict[str, Any]) -> list[Any]:
        res = await self.session.execute(text(sql), params)
        return list(res.all())

    async def get_summary(
        self, user: MemberInfo, start: dt.date, end: dt.date, tz_offset: int = 0
    ) -> dict[str, Any]:
        if end < start:
            raise ValidationError("End date must be on or after the start date.")
        if (end - start).days > 366 * 5:
            raise ValidationError("Date range cannot exceed five years.")

        staff = user.role in ("Admin", "Treasurer", "Officer")
        tz = dt.timedelta(minutes=tz_offset)
        # Convert the viewer's local day boundaries to UTC instants
        utc = dt.timezone.utc  # naive datetimes would be read in the server's local zone, so be explicit
        lo = (dt.datetime.combine(start, dt.time()) - tz).replace(tzinfo=utc)
        hi = (dt.datetime.combine(end, dt.time()) + dt.timedelta(days=1) - tz).replace(tzinfo=utc)
        now_local = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + tz
        today_lo = (dt.datetime.combine(now_local.date(), dt.time()) - tz).replace(tzinfo=utc)
        today_hi = today_lo + dt.timedelta(days=1)

        # Filters: club-wide vs. personal
        pay_f = "" if staff else "AND p.member_id = :mid"
        tick_f = "" if staff else "AND (t.member_id = :mid OR LOWER(t.holder_email) = LOWER(:email))"
        ord_f = "" if staff else "AND (o.member_id = :mid OR LOWER(o.buyer_email) = LOWER(:email))"
        base: dict[str, Any] = {"mid": user.member_id, "email": user.email}
        rng = {**base, "lo": lo, "hi": hi}

        pay_sum = f"SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.paid_at >= :lo AND p.paid_at < :hi {pay_f}"
        total_sales = await self._scalar(pay_sum, rng)
        day_sales = await self._scalar(pay_sum, {**base, "lo": today_lo, "hi": today_hi})
        yday_sales = await self._scalar(pay_sum, {**base, "lo": today_lo - dt.timedelta(days=1), "hi": today_lo})
        week_sales = await self._scalar(pay_sum, {**base, "lo": today_hi - dt.timedelta(days=7), "hi": today_hi})
        prev_week_sales = await self._scalar(
            pay_sum, {**base, "lo": today_hi - dt.timedelta(days=14), "hi": today_hi - dt.timedelta(days=7)}
        )

        visit_cnt = (
            "SELECT COUNT(*) FROM tickets t WHERE t.checked_in_at >= :lo AND t.checked_in_at < :hi " + tick_f
        )
        visits = await self._scalar(visit_cnt, rng)
        day_visits = await self._scalar(visit_cnt, {**base, "lo": today_lo, "hi": today_hi})

        online_sum = pay_sum + " AND p.method = 'online'"
        online_amount = await self._scalar(online_sum, rng)

        # Conversion: share of tickets + shop orders created in range that are paid
        issued_t = await self._scalar(
            "SELECT COUNT(*) FROM tickets t WHERE t.purchased_at >= :lo AND t.purchased_at < :hi " + tick_f, rng
        )
        paid_t = await self._scalar(
            "SELECT COUNT(*) FROM tickets t WHERE t.purchased_at >= :lo AND t.purchased_at < :hi "
            "AND (t.payment_id IS NOT NULL OR t.price_paid = 0) " + tick_f,
            rng,
        )
        issued_o = await self._scalar(
            "SELECT COUNT(*) FROM orders o WHERE o.ordered_at >= :lo AND o.ordered_at < :hi "
            "AND o.status <> 'cancelled' " + ord_f,
            rng,
        )
        paid_o = await self._scalar(
            "SELECT COUNT(*) FROM orders o WHERE o.ordered_at >= :lo AND o.ordered_at < :hi AND o.status = 'paid' "
            + ord_f,
            rng,
        )
        conversion = round((paid_t + paid_o) / (issued_t + issued_o) * 100) if (issued_t + issued_o) else 0

        attendance = round(visits / paid_t * 100) if paid_t else 0
        attendance = min(attendance, 100)

        # Pending (unpaid) money, used by the personal view
        pending_t = await self._scalar(
            "SELECT COALESCE(SUM(t.price_paid),0) FROM tickets t WHERE t.payment_id IS NULL AND t.price_paid > 0 "
            + tick_f,
            base,
        )
        pending_o = await self._scalar(
            "SELECT COALESCE(SUM(oi.quantity * oi.unit_price),0) FROM order_items oi "
            "JOIN orders o ON o.order_id = oi.order_id WHERE o.status = 'placed' " + ord_f,
            base,
        )

        # ---- time series ------------------------------------------------------------------
        buckets = _Buckets(start, end, tz_offset)
        n = len(buckets.starts)
        sales_vals = [defaultdict(float) for _ in range(n)]
        for r in await self._rows(
            f"SELECT p.paid_at, p.category, p.amount FROM payments p WHERE p.paid_at >= :lo AND p.paid_at < :hi {pay_f}",
            rng,
        ):
            i = buckets.index(r[0])
            if i is not None:
                key = "ticket" if r[1] == "ticket" else r[1]
                sales_vals[i][key] += _f(r[2])

        visit_vals = [defaultdict(float) for _ in range(n)]
        for col, key, table, alias, extra in (
            ("checked_in_at", "checkins", "tickets", "t", tick_f),
            ("purchased_at", "tickets", "tickets", "t", tick_f),
            ("ordered_at", "orders", "orders", "o", ord_f + " AND o.status <> 'cancelled'"),
        ):
            for r in await self._rows(
                f"SELECT {alias}.{col} FROM {table} {alias} WHERE {alias}.{col} >= :lo AND {alias}.{col} < :hi {extra}",
                rng,
            ):
                i = buckets.index(r[0])
                if i is not None:
                    visit_vals[i][key] += 1

        def pack(vals: list[dict[str, float]], series: list[dict[str, str]]) -> list[dict[str, Any]]:
            out = []
            for b, v in zip(buckets.starts, vals):
                row = {s["key"]: round(v.get(s["key"], 0.0), 2) for s in series}
                out.append({"label": buckets.label(b), "values": row, "total": round(sum(row.values()), 2)})
            return out

        sales_buckets = pack(sales_vals, SALES_SERIES)
        visit_buckets = pack(visit_vals, VISIT_SERIES)

        # ---- rankings ---------------------------------------------------------------------
        sales_rank_rows = await self._rows(
            f"""
            SELECT label, SUM(amt) AS amt FROM (
              SELECT e.title AS label, SUM(t.price_paid) AS amt
                FROM tickets t JOIN payments p ON p.payment_id = t.payment_id
                JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
                JOIN events e ON e.event_id = tt.event_id
               WHERE p.paid_at >= :lo AND p.paid_at < :hi {pay_f} GROUP BY e.title
              UNION ALL
              SELECT pr.name, SUM(oi.quantity * oi.unit_price)
                FROM orders o JOIN payments p ON p.payment_id = o.payment_id
                JOIN order_items oi ON oi.order_id = o.order_id
                JOIN product_variants v ON v.variant_id = oi.variant_id
                JOIN products pr ON pr.product_id = v.product_id
               WHERE p.paid_at >= :lo AND p.paid_at < :hi {pay_f} GROUP BY pr.name
              UNION ALL
              SELECT 'Membership Dues - ' || mt.name, SUM(ms.dues_amount)
                FROM memberships ms JOIN payments p ON p.payment_id = ms.payment_id
                JOIN membership_types mt ON mt.membership_type_id = ms.membership_type_id
               WHERE p.paid_at >= :lo AND p.paid_at < :hi {pay_f} GROUP BY mt.name
              UNION ALL
              SELECT f.title, SUM(p.amount)
                FROM payments p JOIN fundraisers f ON f.fundraiser_id = p.fundraiser_id
               WHERE p.paid_at >= :lo AND p.paid_at < :hi {pay_f} GROUP BY f.title
            ) x GROUP BY label ORDER BY amt DESC LIMIT 7
            """,
            rng,
        )
        visit_rank_rows = await self._rows(
            f"""
            SELECT e.title, COUNT(*) AS n FROM tickets t
              JOIN ticket_types tt ON tt.ticket_type_id = t.ticket_type_id
              JOIN events e ON e.event_id = tt.event_id
             WHERE t.checked_in_at >= :lo AND t.checked_in_at < :hi {tick_f}
             GROUP BY e.title ORDER BY n DESC LIMIT 7
            """,
            rng,
        )

        redis_ok = await check_redis_health()
        if staff:
            effect = {
                "label": "Attendance Rate",
                "percent": attendance,
                "text": f"{attendance}%",
                "footer_label": "System Status",
                "footer_value": "All Nominal" if redis_ok else "Live sync degraded",
                "footer_ok": redis_ok,
            }
        else:
            effect = {
                "label": "Membership",
                "percent": 100 if user.is_active else 0,
                "text": "Active" if user.is_active else "Not a member",
                "footer_label": "Valid until",
                "footer_value": user.valid_until or "-",
                "footer_ok": user.is_active,
            }

        return {
            "scope": "club" if staff else "personal",
            "range": {"start": start.isoformat(), "end": end.isoformat(), "bucket": buckets.unit},
            "cards": {
                "sales": {
                    "label": "Total Sales" if staff else "My Spending",
                    "value": total_sales,
                    "day_value": day_sales,
                    "day_ratio": _pct_change(day_sales, yday_sales),
                    "week_ratio": _pct_change(week_sales, prev_week_sales),
                    "footer_label": "Day Sales" if staff else "Spent today",
                },
                "visits": {
                    "label": "Visits" if staff else "Events Attended",
                    "value": visits,
                    "day_value": day_visits,
                    "footer_label": "Day visits" if staff else "Attended today",
                    "spark": [b["values"]["checkins"] for b in visit_buckets],
                },
                "payments": {
                    "label": "Payments" if staff else "Awaiting Payment",
                    "value": online_amount if staff else pending_t + pending_o,
                    "footer_label": "Conversion rate" if staff else "Open items",
                    "footer_value": f"{conversion}%" if staff else f"{int(issued_t - paid_t + issued_o - paid_o)}",
                    "bars": [b["total"] for b in sales_buckets][-6:],
                },
                "effect": effect,
            },
            "sales": {"series": SALES_SERIES, "buckets": sales_buckets, "ranking": [{"label": r[0], "amount": _f(r[1])} for r in sales_rank_rows]},
            "visits": {"series": VISIT_SERIES, "buckets": visit_buckets, "ranking": [{"label": r[0], "amount": int(r[1])} for r in visit_rank_rows]},
        }
