"""BEACON one-page cited action brief (reportlab, no system deps)."""
from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build_report(payload: dict) -> bytes:
    level = payload.get("level", 0)
    total = payload.get("total", {})
    zones = payload.get("zones", [])[:3]
    unicef = payload.get("unicef") or {}
    w = payload.get("weights", {})

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=1.5 * cm, bottomMargin=1.4 * cm,
                            leftMargin=1.8 * cm, rightMargin=1.8 * cm)
    s = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=s["Title"], fontSize=19, spaceAfter=2, textColor=colors.HexColor("#15324a"))
    sub = ParagraphStyle("sub", parent=s["Normal"], fontSize=9, textColor=colors.grey)
    h2 = ParagraphStyle("h2", parent=s["Heading2"], fontSize=12, spaceBefore=12, spaceAfter=4,
                        textColor=colors.HexColor("#2f86d6"))
    body = ParagraphStyle("body", parent=s["Normal"], fontSize=9.5, leading=13)
    hero = ParagraphStyle("hero", parent=s["Normal"], fontSize=13, leading=17, textColor=colors.HexColor("#15324a"))

    story = []
    story.append(Paragraph("BEACON — Anticipatory Action Brief", h1))
    story.append(Paragraph(
        f"Child flood risk · Sirajganj District, Bangladesh (Jamuna) · scenario water level "
        f"<b>{level:.1f} m</b> · generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}", sub))
    story.append(Spacer(1, 8))

    if zones:
        story.append(Paragraph(
            f"<b>Protect {zones[0]['name']} first</b> — most young children, in the deepest water, "
            f"farthest from care at this flood level.", hero))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Impact at this scenario", h2))
    story.append(Paragraph(
        f"Approximately <b>{int(total.get('childrenU5', 0)):,} children under-5</b> in the flood zone · "
        f"<b>{total.get('schools', 0)}</b> schools and <b>{total.get('clinics', 0)}</b> clinics flooded · "
        f"max depth ~{total.get('maxDepth', 0):.1f} m.", body))

    story.append(Paragraph("Where to help first", h2))
    rows = [["#", "Zone (upazila)", "Children u-5", "Schools", "Clinics", "Nearest clinic"]]
    for z in zones:
        rows.append([str(z.get("rank", "")), z.get("name", ""),
                     f"{int(z.get('childrenU5', 0)):,}", str(z.get("schools", 0)),
                     str(z.get("clinics", 0)), f"{z.get('nearestClinicKm', 0):.1f} km"])
    t = Table(rows, colWidths=[1 * cm, 5 * cm, 3 * cm, 2 * cm, 2 * cm, 3 * cm])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8f1fb")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f9fc")]),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cdd9e5")),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e3ebf2")),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Ranking weights: children {int(w.get('children', 0.45) * 100)}% · "
        f"flood depth {int(w.get('flood', 0.35) * 100)}% · clinic distance {int(w.get('access', 0.2) * 100)}% "
        f"(INFORM-style: normalized factors, log-scaled exposure). Weights are user-set and visible.", sub))

    story.append(Paragraph("Evidence chain", h2))
    u = ""
    if unicef.get("value") is not None:
        u = (f"<br/>• Child mortality context: <b>{unicef['value']:.0f}</b> {unicef.get('indicator','').lower()} "
             f"(Bangladesh, {unicef.get('year','')}"
             + (f", CI {unicef['ci_low']:.0f}-{unicef['ci_high']:.0f}" if unicef.get('ci_low') else "")
             + f"). Source: {unicef.get('source','UNICEF')}.")
    story.append(Paragraph(
        "• Flood hazard: GloFAS/JRC lineage + Copernicus 30 m DEM bathtub screening, connected to the Jamuna.<br/>"
        "• Children under-5: WorldPop 100 m (2020), ±~10%.<br/>"
        "• Schools: Giga / OpenStreetMap. Clinics: Healthsites.io / OpenStreetMap. Boundaries: geoBoundaries ADM3."
        + u, body))

    story.append(Paragraph("Limitations", h2))
    story.append(Paragraph(
        "Indicative bathtub screening: it shows where water would pool at this level on bare-earth terrain and "
        "tends to over-predict extent; it does not model flow speed or timing. Child counts are modelled estimates. "
        "Use for prioritisation, not as a substitute for hydrodynamic flood modelling. The human makes the decision.",
        sub))
    story.append(Spacer(1, 8))
    story.append(Paragraph("BEACON · built on UN public data · the human decides, not the AI.", sub))

    doc.build(story)
    return buf.getvalue()
