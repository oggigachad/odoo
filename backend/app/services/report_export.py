"""Excel and PDF exports for the report centre. PDFs carry the club logo and a diagonal watermark."""

import io
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle

LOGO = Path(__file__).resolve().parents[3] / "frontend" / "public" / "logo.png"
BRAND = "#714B67"


def _cell(row: dict[str, Any], col: dict[str, str]) -> Any:
    v = row.get(col["key"], "")
    if v is None:
        return ""
    if col["kind"] in ("money", "int", "percent"):
        try:
            return float(v)
        except (TypeError, ValueError):
            return v
    return v


def _num(v: Any) -> Any:
    try:
        return float(v)
    except (TypeError, ValueError):
        return str(v)


def render_xlsx(report: dict[str, Any]) -> bytes:
    import xlsxwriter

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    ws = wb.add_worksheet(report["title"][:31].replace("/", "-"))
    title = wb.add_format({"bold": True, "font_size": 16, "font_color": BRAND})
    head = wb.add_format({"bold": True, "bg_color": BRAND, "font_color": "#FFFFFF", "border": 1})
    money = wb.add_format({"num_format": "#,##0.00", "border": 1})
    plain = wb.add_format({"border": 1})
    bold = wb.add_format({"bold": True, "top": 1})
    band = wb.add_format({"bg_color": BRAND})
    row0 = 0
    ncols = max(len(report["columns"]), 4)
    if LOGO.exists():
        ws.set_row(0, 38, band)
        for i in range(ncols):
            ws.write_blank(0, i, None, band)
        ws.insert_image(0, 0, str(LOGO), {"x_scale": 0.25, "y_scale": 0.25, "x_offset": 4, "y_offset": 4})
        row0 = 1
    ws.write(row0, 0, report["title"], title)
    ws.write(row0 + 1, 0, report.get("description", ""))
    ws.write(row0 + 2, 0, f"Generated {report.get('generated_at', '')[:19].replace('T', ' ')} UTC. Skyline Student Association")
    top = row0 + 4
    for i, c in enumerate(report["columns"]):
        ws.write(top, i, c["label"], head)
        ws.set_column(i, i, max(14, min(40, len(c["label"]) + 6)))
    for r, row in enumerate(report["rows"], start=top + 1):
        for i, c in enumerate(report["columns"]):
            ws.write(r, i, _cell(row, c), money if c["kind"] == "money" else plain)
    r = top + len(report["rows"]) + 2
    for k, v in report["totals"].items():
        ws.write(r, 0, f"Total {k}", bold)
        ws.write(r, 1, _num(v), bold)
        r += 1
    wb.close()
    return buf.getvalue()


def render_pdf(report: dict[str, Any]) -> bytes:
    buf = io.BytesIO()
    page = landscape(A4) if len(report["columns"]) > 5 else A4
    W, H = page

    def decorate(c, doc):  # noqa: ANN001
        c.saveState()
        c.setFillColor(colors.HexColor(BRAND))
        c.rect(0, H - 22 * mm, W, 22 * mm, stroke=0, fill=1)
        if LOGO.exists():
            c.drawImage(ImageReader(str(LOGO)), 12 * mm, H - 18 * mm, height=13 * mm, width=40 * mm, preserveAspectRatio=True, mask="auto", anchor="w")
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 12)
        c.drawRightString(W - 12 * mm, H - 13 * mm, "Skyline Student Association")
        c.setFillColor(colors.Color(0.44, 0.29, 0.40, alpha=0.08))
        c.setFont("Helvetica-Bold", 74)
        c.translate(W / 2, H / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, "SKYLINE")
        c.restoreState()
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor("#6b6b6b"))
        c.drawString(12 * mm, 8 * mm, f"Generated {report.get('generated_at', '')[:16].replace('T', ' ')} UTC. For club officers only.")
        c.drawRightString(W - 12 * mm, 8 * mm, f"Page {doc.page}")

    doc = BaseDocTemplate(buf, pagesize=page, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=28 * mm, bottomMargin=16 * mm,
                          title=report["title"], author="Skyline Student Association")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(12 * mm, 16 * mm, W - 24 * mm, H - 44 * mm, id="f")], onPage=decorate)])
    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=16, textColor=colors.HexColor(BRAND), spaceAfter=3, leading=20)
    body = ParagraphStyle("b", fontName="Helvetica", fontSize=9, textColor=colors.HexColor("#444444"), spaceAfter=8)
    cellst = ParagraphStyle("c", fontName="Helvetica", fontSize=8, leading=10)
    headst = ParagraphStyle("hh", parent=cellst, textColor=colors.white, fontName="Helvetica-Bold")
    story: list[Any] = [Paragraph(report["title"], h1), Paragraph(report.get("description", ""), body)]
    data = [[Paragraph(c["label"], headst) for c in report["columns"]]]
    for row in report["rows"]:
        data.append([Paragraph("" if row.get(c["key"]) is None else str(row.get(c["key"])), cellst) for c in report["columns"]])
    if not report["rows"]:
        data.append([Paragraph("No data for this period.", cellst)] + [""] * (len(report["columns"]) - 1))
    t = Table(data, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BRAND)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f3f8")]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#dcdcdc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(t)
    if report["totals"]:
        story.append(Spacer(1, 8))
        tot = Table([[f"Total {k}", str(v)] for k, v in report["totals"].items()], hAlign="LEFT")
        tot.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 9),
                                 ("LINEABOVE", (0, 0), (-1, 0), 0.5, colors.HexColor(BRAND))]))
        story.append(tot)
    doc.build(story)
    return buf.getvalue()
