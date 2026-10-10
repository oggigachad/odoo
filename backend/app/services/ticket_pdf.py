"""Printable ticket PDF with a signed Skyline QR code.

The QR does not contain a URL. It carries a signed payload (``SKYLINE1.<code>.<sig>``) that only the
Skyline website / app check-in understands, so generic phone scanners just show opaque text.
"""

import io
from datetime import datetime

import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A5
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.schemas.events import TicketResponse

BRAND = HexColor("#714B67")
INK = HexColor("#1f1f1f")
MUTED = HexColor("#6b6b6b")
RULE = HexColor("#dcdcdc")


def render_qr_png(payload: str, box_size: int = 10) -> bytes:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=box_size, border=4)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _fmt_dt(dt: datetime | None) -> str:
    return dt.strftime("%a, %d %b %Y  %I:%M %p") if dt else "-"


def render_ticket_pdf(ticket: TicketResponse) -> bytes:
    buf = io.BytesIO()
    width, height = A5
    pdf = canvas.Canvas(buf, pagesize=A5)
    pdf.setTitle(f"Skyline Ticket {ticket.manual_code}")
    pdf.setAuthor("Skyline Student Association")

    # Header band
    pdf.setFillColor(BRAND)
    pdf.rect(0, height - 70, width, 70, stroke=0, fill=1)
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(28, height - 38, "skyline")
    pdf.setFont("Helvetica", 9)
    pdf.drawString(28, height - 54, "STUDENT ASSOCIATION  -  ADMIT ONE")

    # Event
    y = height - 108
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 17)
    title = ticket.event_title or "Event"
    pdf.drawString(28, y, title[:42])
    if len(title) > 42:
        pdf.setFont("Helvetica-Bold", 17)
        pdf.drawString(28, y - 20, title[42:84])
        y -= 20
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 10)
    pdf.drawString(28, y - 20, _fmt_dt(ticket.event_starts_at))
    if ticket.venue:
        pdf.drawString(28, y - 35, ticket.venue[:60])
        y -= 15

    # Divider
    y -= 52
    pdf.setStrokeColor(RULE)
    pdf.setDash(3, 3)
    pdf.line(28, y, width - 28, y)
    pdf.setDash()

    # Details
    def field(label: str, value: str, x: float, yy: float) -> None:
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 7.5)
        pdf.drawString(x, yy, label.upper())
        pdf.setFillColor(INK)
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(x, yy - 14, value[:30])

    field("Attendee", ticket.holder_name, 28, y - 24)
    field("Ticket type", ticket.ticket_type_name or "General", 28, y - 62)
    field("Price paid", f"Rs. {ticket.price_paid}", 28, y - 100)
    field("Ticket no.", f"#{ticket.ticket_id}", 28, y - 138)

    # QR
    qr_size = 150
    qr_x = width - 28 - qr_size
    qr_y = y - 28 - qr_size + 10
    pdf.drawImage(ImageReader(io.BytesIO(render_qr_png(ticket.qr_payload))), qr_x, qr_y, qr_size, qr_size)

    # Manual code
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7.5)
    pdf.drawCentredString(qr_x + qr_size / 2, qr_y - 12, "MANUAL ENTRY CODE")
    pdf.setFillColor(INK)
    pdf.setFont("Courier-Bold", 14)
    pdf.drawCentredString(qr_x + qr_size / 2, qr_y - 28, ticket.manual_code)

    # Footer
    pdf.setStrokeColor(RULE)
    pdf.line(28, 62, width - 28, 62)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7.5)
    pdf.drawString(28, 48, "This QR code is encrypted for Skyline. It can only be scanned and verified by the Skyline")
    pdf.drawString(28, 38, "website or app at the door. One entry per ticket - duplicates are rejected automatically.")
    status = "VALID" if ticket.is_valid else "PAYMENT PENDING - not valid for entry until paid"
    pdf.setFillColor(BRAND if ticket.is_valid else HexColor("#b45309"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(28, 22, f"STATUS: {status}")

    pdf.showPage()
    pdf.save()
    return buf.getvalue()
