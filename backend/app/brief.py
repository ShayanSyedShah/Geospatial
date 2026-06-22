"""Generate a one-page decision-brief PDF for a hexagon (reportlab, no system deps)."""
from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)

from . import config


def _risk_label(risk: float) -> str:
    if risk > 0.8:
        return "VERY HIGH"
    if risk > 0.6:
        return "HIGH"
    if risk > 0.4:
        return "MODERATE"
    return "LOW"


def build_brief(cell: dict, time_horizon: str) -> bytes:
    risk = float(cell.get(f"flood_risk_{time_horizon}", cell.get("flood_risk_20h", 0.0)))
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.6 * cm,
                            bottomMargin=1.6 * cm, leftMargin=1.8 * cm, rightMargin=1.8 * cm)
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], fontSize=18, spaceAfter=4)
    sub = ParagraphStyle("sub", parent=styles["Normal"], textColor=colors.grey, fontSize=9)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=4,
                        textColor=colors.HexColor("#1976d2"))
    body = ParagraphStyle("body", parent=styles["Normal"], fontSize=9.5, leading=13)

    story = []
    story.append(Paragraph("Flood Risk Decision Brief", h1))
    story.append(Paragraph(
        f"Hexagon {cell['h3_id']} &nbsp;·&nbsp; {config.DEFAULT_COUNTRY} &nbsp;·&nbsp; "
        f"horizon {time_horizon} &nbsp;·&nbsp; generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}", sub))
    story.append(Spacer(1, 8))

    # Risk assessment table
    story.append(Paragraph("Risk Assessment", h2))
    nearest = cell.get("nearest_clinic_m")
    nearest_txt = f"{nearest/1000:.1f} km" if nearest and nearest == nearest else "n/a"
    rows = [
        ["Flood risk", f"{risk*100:.0f}%  ({_risk_label(risk)})"],
        ["Max water depth", f"{cell.get('flood_depth_max_m', 0):.1f} m"],
        ["Children under-5 at risk", f"{int(cell.get('population_u5', 0)):,}"],
        ["Nearby health clinics", str(int(cell.get("nearby_clinics", 0)))],
        ["Nearby schools", str(int(cell.get("nearby_schools", 0)))],
        ["Distance to nearest clinic", nearest_txt],
        ["Location", f"{cell.get('lat', 0):.3f}, {cell.get('lng', 0):.3f}"],
    ]
    t = Table(rows, colWidths=[7 * cm, 9 * cm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#555555")),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5), ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)

    # Evidence chain
    story.append(Paragraph("Data Sources &amp; Methodology", h2))
    for title, lines in [
        ("Flood forecast", ["GloFAS / JRC Global Flood Hazard (LISFLOOD model, Copernicus EMS).",
                            "Return-period water-depth layers; 28-yr validated lineage.",
                            "Normalised to a 0-1 risk score."]),
        ("Population", ["WorldPop 2020 age/sex structures, 100 m grid.",
                       "Under-5 = sum of female/male ages 0 and 1-4. Census-calibrated."]),
        ("Infrastructure", ["Schools: UN OCHA / Bangladesh LGED registry (via HDX) - 78,129 points.",
                           "Clinics: UN OCHA / Bangladesh LGED health-facility registry (via HDX)."]),
    ]:
        story.append(Paragraph(f"<b>{title}</b> &nbsp; " + " ".join(lines), body))
        story.append(Spacer(1, 3))

    story.append(Paragraph("Confidence &amp; Decision Rule", h2))
    story.append(Paragraph(
        f"Overall uncertainty &plusmn;{config.OVERALL_UNCERTAINTY*100:.0f}% (95% CI). "
        f"<b>If risk exceeds {config.DECISION_THRESHOLD*100:.0f}%, prioritise evacuation / "
        f"pre-positioning of supplies.</b> This hexagon is "
        f"{'ABOVE' if risk > config.DECISION_THRESHOLD else 'below'} that threshold.", body))

    doc.build(story)
    return buf.getvalue()
