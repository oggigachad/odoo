"""Eight ready-made reports for staff. JSON for the dashboard, `?format=csv` for spreadsheets/audits."""

import csv
import datetime as dt
import io
from decimal import Decimal
from typing import Annotated, Any, Awaitable, Callable, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import RequireOfficer
from app.core.database import get_db
from app.core.errors import NotFoundError
from app.schemas.auth import MemberInfo

router = APIRouter(tags=["Reports"])

Col = tuple[str, str, str]  # key, label, kind (text|money|int|percent|date)
Report = dict[str, Any]


def _f(v: Any) -> float:
    return float(v) if isinstance(v, (Decimal, int, float)) else 0.0


def _pct(a: float, b: float) -> float:
    return round(a / b * 100, 1) if b else 0.0


def _wrap(key: str, title: str, desc: str, cols: list[Col], rows: list[dict[str, Any]], totals: Optional[dict[str, Any]] = None) -> Report:
    return {
        "key": key,
        "title": title,
        "description": desc,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "columns": [{"key": k, "label": l, "kind": kind} for k, l, kind in cols],
        "rows": rows,
        "totals": totals or {},
    }


async def _q(db: AsyncSession, sql: str, **p: Any) -> list[Any]:
    return list((await db.execute(text(sql), p)).all())


async def event_profit(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    rows = await _q(
        db,
        """
        SELECT e.event_id, e.title, e.starts_at::date,
               COUNT(t.ticket_id) FILTER (WHERE t.payment_id IS NOT NULL OR t.price_paid = 0) AS sold,
               COUNT(t.checked_in_at) AS attended,
               COALESCE(SUM(t.price_paid) FILTER (WHERE t.payment_id IS NOT NULL OR t.price_paid = 0), 0) AS revenue,
               (SELECT COALESCE(SUM(x.amount),0) FROM expenses x WHERE x.event_id=e.event_id AND x.status IN ('approved','reimbursed')) AS cost
          FROM events e
          LEFT JOIN ticket_types tt ON tt.event_id = e.event_id
          LEFT JOIN tickets t ON t.ticket_type_id = tt.ticket_type_id
         WHERE e.starts_at::date BETWEEN :s AND :e
         GROUP BY e.event_id ORDER BY e.starts_at DESC
        """,
        s=start, e=end,
    )
    out = [
        {"event": r[1], "date": str(r[2]), "tickets_sold": r[3], "attended": r[4], "attendance_rate": _pct(r[4], r[3]),
         "revenue": _f(r[5]), "expenses": _f(r[6]), "profit": _f(r[5]) - _f(r[6])}
        for r in rows
    ]
    tot = {"tickets_sold": sum(o["tickets_sold"] for o in out), "attended": sum(o["attended"] for o in out),
           "revenue": sum(o["revenue"] for o in out), "expenses": sum(o["expenses"] for o in out), "profit": sum(o["profit"] for o in out)}
    return _wrap(
        "event-profit", "Profit per event", "Ticket revenue minus approved expenses for every event in the period.",
        [("event", "Event", "text"), ("date", "Date", "date"), ("tickets_sold", "Sold", "int"), ("attended", "Attended", "int"),
         ("attendance_rate", "Attendance", "percent"), ("revenue", "Revenue", "money"), ("expenses", "Expenses", "money"), ("profit", "Profit", "money")],
        out, tot,
    )


async def raised_vs_expenses(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    rows = await _q(
        db,
        """
        SELECT f.title, f.goal_amount,
               (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.fundraiser_id=f.fundraiser_id AND p.paid_at::date BETWEEN :s AND :e),
               (SELECT COALESCE(SUM(x.amount),0) FROM expenses x WHERE x.fundraiser_id=f.fundraiser_id AND x.status IN ('approved','reimbursed')),
               (SELECT COUNT(*) FILTER (WHERE k.status='done') FROM fundraiser_tasks k WHERE k.fundraiser_id=f.fundraiser_id),
               (SELECT COUNT(*) FROM fundraiser_tasks k WHERE k.fundraiser_id=f.fundraiser_id)
          FROM fundraisers f ORDER BY f.fundraiser_id DESC
        """,
        s=start, e=end,
    )
    out = [
        {"fundraiser": r[0], "goal": _f(r[1]) if r[1] is not None else None, "raised": _f(r[2]), "expenses": _f(r[3]),
         "profit": _f(r[2]) - _f(r[3]), "goal_progress": _pct(_f(r[2]), _f(r[1])) if r[1] else None, "tasks": f"{r[4]}/{r[5]}"}
        for r in rows
    ]
    return _wrap(
        "fundraisers", "Amount raised vs expenses", "How much each fundraiser raised, what it cost and whether it is on track.",
        [("fundraiser", "Fundraiser", "text"), ("goal", "Goal", "money"), ("raised", "Raised", "money"), ("expenses", "Expenses", "money"),
         ("profit", "Profit", "money"), ("goal_progress", "Goal reached", "percent"), ("tasks", "Tasks done", "text")],
        out, {"raised": sum(o["raised"] for o in out), "expenses": sum(o["expenses"] for o in out), "profit": sum(o["profit"] for o in out)},
    )


async def money_in_out(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    ins = await _q(db, "SELECT category, COUNT(*), SUM(amount) FROM payments WHERE paid_at::date BETWEEN :s AND :e GROUP BY category ORDER BY 3 DESC", s=start, e=end)
    outs = await _q(
        db, "SELECT 'reimbursed expenses', COUNT(*), COALESCE(SUM(amount),0) FROM expenses WHERE status='reimbursed' AND COALESCE(reimbursed_at, submitted_at)::date BETWEEN :s AND :e",
        s=start, e=end,
    )
    rows = [{"direction": "In", "category": r[0], "count": r[1], "amount": _f(r[2])} for r in ins]
    rows += [{"direction": "Out", "category": r[0], "count": r[1], "amount": _f(r[2])} for r in outs if r[1]]
    tin = sum(r["amount"] for r in rows if r["direction"] == "In")
    tout = sum(r["amount"] for r in rows if r["direction"] == "Out")
    return _wrap(
        "money", "Money in, money out, what is left", "Dues, tickets, merchandise and fundraiser income against reimbursed expenses.",
        [("direction", "Direction", "text"), ("category", "Category", "text"), ("count", "Transactions", "int"), ("amount", "Amount", "money")],
        rows, {"money_in": tin, "money_out": tout, "balance": tin - tout},
    )


async def membership_report(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    rows = await _q(
        db,
        """
        SELECT mt.name, s.name,
               COUNT(*) FILTER (WHERE ms.payment_id IS NOT NULL) AS paid,
               COUNT(*) FILTER (WHERE ms.payment_id IS NULL) AS unpaid,
               COALESCE(SUM(ms.dues_amount) FILTER (WHERE ms.payment_id IS NOT NULL),0),
               s.ends_on
          FROM memberships ms JOIN membership_types mt ON mt.membership_type_id=ms.membership_type_id
          JOIN semesters s ON s.semester_id=ms.semester_id
         WHERE s.ends_on >= :s AND s.starts_on <= :e
         GROUP BY mt.name, s.name, s.ends_on ORDER BY s.ends_on DESC, mt.name
        """,
        s=start, e=end,
    )
    today = dt.date.today()
    expiring = (await _q(db, "SELECT COUNT(DISTINCT ms.member_id) FROM memberships ms JOIN semesters s ON s.semester_id=ms.semester_id WHERE ms.payment_id IS NOT NULL AND s.ends_on BETWEEN :t AND :t30", t=today, t30=today + dt.timedelta(days=30)))[0][0]
    out = [{"tier": r[0], "semester": r[1], "paid_members": r[2], "awaiting_payment": r[3], "dues_collected": _f(r[4]), "ends": str(r[5])} for r in rows]
    return _wrap(
        "membership", "Membership & dues", "Paid vs unpaid memberships per tier and semester, and who is about to lapse.",
        [("tier", "Tier", "text"), ("semester", "Semester", "text"), ("paid_members", "Paid", "int"), ("awaiting_payment", "Awaiting payment", "int"),
         ("dues_collected", "Dues collected", "money"), ("ends", "Ends", "date")],
        out, {"paid_members": sum(o["paid_members"] for o in out), "dues_collected": sum(o["dues_collected"] for o in out), "expiring_within_30_days": int(expiring)},
    )


async def merchandise_report(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    rows = await _q(
        db,
        """
        SELECT p.name, v.size, v.stock_quantity,
               COALESCE(SUM(oi.quantity) FILTER (WHERE o.status <> 'cancelled' AND o.ordered_at::date BETWEEN :s AND :e),0),
               COALESCE(SUM(oi.quantity*oi.unit_price) FILTER (WHERE o.status = 'paid' AND o.ordered_at::date BETWEEN :s AND :e),0)
          FROM products p JOIN product_variants v ON v.product_id=p.product_id
          LEFT JOIN order_items oi ON oi.variant_id=v.variant_id LEFT JOIN orders o ON o.order_id=oi.order_id
         GROUP BY p.name, v.size, v.stock_quantity, v.variant_id ORDER BY p.name, v.size
        """,
        s=start, e=end,
    )
    out = [{"product": r[0], "size": r[1], "in_stock": r[2], "units_ordered": int(r[3]), "paid_revenue": _f(r[4]), "low_stock": "Yes" if r[2] <= 3 else ""} for r in rows]
    return _wrap(
        "merchandise", "Merchandise sales & stock", "Units ordered, revenue and what is left per size. Low stock (3 or fewer) is flagged.",
        [("product", "Product", "text"), ("size", "Size", "text"), ("in_stock", "In stock", "int"), ("units_ordered", "Ordered", "int"),
         ("paid_revenue", "Paid revenue", "money"), ("low_stock", "Low stock", "text")],
        out, {"units_ordered": sum(o["units_ordered"] for o in out), "paid_revenue": sum(o["paid_revenue"] for o in out)},
    )


async def expenses_report(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    rows = await _q(
        db,
        """
        SELECT m.full_name, x.status, COUNT(*), SUM(x.amount) FROM expenses x JOIN members m ON m.member_id=x.member_id
         WHERE x.submitted_at::date BETWEEN :s AND :e GROUP BY m.full_name, x.status ORDER BY SUM(x.amount) DESC
        """,
        s=start, e=end,
    )
    out = [{"volunteer": r[0], "status": r[1], "claims": r[2], "amount": _f(r[3])} for r in rows]
    owed = sum(o["amount"] for o in out if o["status"] in ("approved", "pending", "submitted"))
    return _wrap(
        "expenses", "Volunteer expenses & reimbursements", "Every claim by volunteer and status, with what the club still owes.",
        [("volunteer", "Volunteer", "text"), ("status", "Status", "text"), ("claims", "Claims", "int"), ("amount", "Amount", "money")],
        out, {"total_claimed": sum(o["amount"] for o in out), "still_owed": owed},
    )


async def attendance_report(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    rows = await _q(
        db,
        """
        SELECT e.title, tt.name, tt.seat_limit,
               COUNT(t.ticket_id) FILTER (WHERE t.payment_id IS NOT NULL OR t.price_paid = 0),
               COUNT(t.checked_in_at),
               COUNT(t.ticket_id) FILTER (WHERE t.member_id IS NOT NULL)
          FROM events e JOIN ticket_types tt ON tt.event_id=e.event_id LEFT JOIN tickets t ON t.ticket_type_id=tt.ticket_type_id
         WHERE e.starts_at::date BETWEEN :s AND :e GROUP BY e.title, tt.name, tt.seat_limit, tt.ticket_type_id, e.starts_at ORDER BY e.starts_at DESC
        """,
        s=start, e=end,
    )
    out = [{"event": r[0], "ticket_type": r[1], "capacity": r[2], "sold": r[3], "fill_rate": _pct(r[3], r[2]), "attended": r[4],
            "show_rate": _pct(r[4], r[3]), "member_tickets": r[5]} for r in rows]
    return _wrap(
        "attendance", "Seats filled & who showed up", "Capacity, tickets sold, attendance and member share per ticket type.",
        [("event", "Event", "text"), ("ticket_type", "Ticket type", "text"), ("capacity", "Seats", "int"), ("sold", "Sold", "int"),
         ("fill_rate", "Filled", "percent"), ("attended", "Attended", "int"), ("show_rate", "Showed up", "percent"), ("member_tickets", "Member tickets", "int")],
        out, {"sold": sum(o["sold"] for o in out), "attended": sum(o["attended"] for o in out)},
    )


async def outstanding_report(db: AsyncSession, start: dt.date, end: dt.date) -> Report:
    rows = await _q(
        db,
        """
        SELECT 'Membership', m.full_name, mt.name, ms.dues_amount FROM memberships ms JOIN members m ON m.member_id=ms.member_id
           JOIN membership_types mt ON mt.membership_type_id=ms.membership_type_id WHERE ms.payment_id IS NULL
        UNION ALL
        SELECT 'Merchandise order', COALESCE(m.full_name, o.buyer_name), 'Order #' || o.order_id,
               (SELECT SUM(oi.quantity*oi.unit_price) FROM order_items oi WHERE oi.order_id=o.order_id)
          FROM orders o LEFT JOIN members m ON m.member_id=o.member_id WHERE o.status='placed'
        UNION ALL
        SELECT 'Ticket', t.holder_name, e.title, t.price_paid FROM tickets t JOIN ticket_types tt ON tt.ticket_type_id=t.ticket_type_id
           JOIN events e ON e.event_id=tt.event_id WHERE t.payment_id IS NULL AND t.price_paid > 0
        ORDER BY 1, 2
        """,
    )
    out = [{"type": r[0], "who": r[1], "item": r[2], "amount": _f(r[3])} for r in rows]
    return _wrap(
        "outstanding", "Who still owes what", "Memberships, orders and tickets that have been requested but not paid.",
        [("type", "Type", "text"), ("who", "Who", "text"), ("item", "Item", "text"), ("amount", "Amount", "money")],
        out, {"total_outstanding": sum(o["amount"] for o in out)},
    )


REPORTS: dict[str, Callable[[AsyncSession, dt.date, dt.date], Awaitable[Report]]] = {
    "event-profit": event_profit,
    "fundraisers": raised_vs_expenses,
    "money": money_in_out,
    "membership": membership_report,
    "merchandise": merchandise_report,
    "expenses": expenses_report,
    "attendance": attendance_report,
    "outstanding": outstanding_report,
}
TITLES = {
    "event-profit": "Profit per event", "fundraisers": "Amount raised vs expenses", "money": "Money in, money out, what is left",
    "membership": "Membership & dues", "merchandise": "Merchandise sales & stock", "expenses": "Volunteer expenses & reimbursements",
    "attendance": "Seats filled & who showed up", "outstanding": "Who still owes what",
}


@router.get("/reports")
async def list_reports(_: Annotated[MemberInfo, Depends(RequireOfficer)]) -> list[dict[str, str]]:
    return [{"key": k, "title": t} for k, t in TITLES.items()]


@router.get("/reports/{key}")
async def run_report(
    key: str,
    _: Annotated[MemberInfo, Depends(RequireOfficer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start: Annotated[Optional[dt.date], Query()] = None,
    end: Annotated[Optional[dt.date], Query()] = None,
    format: Annotated[str, Query(pattern="^(json|csv|xlsx|pdf)$")] = "json",
) -> Any:
    fn = REPORTS.get(key)
    if not fn:
        raise NotFoundError("Unknown report.")
    end = end or dt.date.today() + dt.timedelta(days=366)
    start = start or dt.date(2000, 1, 1)
    report = await fn(db, start, end)
    if format == "json":
        return report
    if format == "xlsx":
        from app.services.report_export import render_xlsx
        return Response(content=render_xlsx(report), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="skyline-{key}.xlsx"'})
    if format == "pdf":
        from app.services.report_export import render_pdf
        return Response(content=render_pdf(report), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="skyline-{key}.pdf"'})
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([c["label"] for c in report["columns"]])
    for row in report["rows"]:
        w.writerow([row.get(c["key"], "") for c in report["columns"]])
    for k, v in report["totals"].items():
        w.writerow([f"TOTAL {k}", v])
    return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="skyline-{key}.csv"'})
