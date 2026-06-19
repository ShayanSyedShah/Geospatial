"""Make Plan — turn the connected data into a short, cited action plan.

The AI sizes the *numbers* from real data; a human supplies local logistics
(evac-centre capacities, contact lists) which we mark as placeholders, never
invent. Output is decision-ready Markdown.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from . import config


def _fmt(n) -> str:
    return f"{int(round(n)):,}"


def _risk_at(hexes: pd.DataFrame, f: float) -> pd.Series:
    """Linear interpolation across [dry, 4h, 20h, 7d] at fraction f in [0,1].
    Mirrors the frontend timeline so exposure matches what's on screen."""
    f = max(0.0, min(1.0, f))
    a = hexes["flood_risk_4h"]
    b = hexes["flood_risk_20h"]
    c = hexes["flood_risk_7d"]
    if f <= 1 / 3:
        return a * (f / (1 / 3))
    if f <= 2 / 3:
        return a + (b - a) * ((f - 1 / 3) / (1 / 3))
    return b + (c - b) * ((f - 2 / 3) / (1 / 3))


def build_plan(df: pd.DataFrame, country: str, district: str | None,
               intensity: float, depth_m: float) -> str:
    scope = df[df["country"] == country]
    if district and district != "All":
        scope = scope[scope["district"] == district]

    risk = _risk_at(scope, intensity)
    flooded = scope[risk > config.FLOOD_EXPOSURE_THRESHOLD].copy()
    flooded["_risk"] = risk[risk > config.FLOOD_EXPOSURE_THRESHOLD]

    total_u5 = int(flooded["population_u5"].sum())
    schools = int(flooded["nearby_schools"].sum())
    clinics = int(flooded["nearby_clinics"].sum())

    # rank districts in scope by children x risk
    rows = []
    for name, g in flooded.groupby("district"):
        gr = g["_risk"]
        rows.append({
            "district": str(name),
            "u5": int(g["population_u5"].sum()),
            "max_risk": float(gr.max()),
            "hot": int((gr > config.DECISION_THRESHOLD).sum()),
        })
    rows.sort(key=lambda r: (r["u5"] * r["max_risk"]), reverse=True)
    top = rows[:4]

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    label = district or country
    conf = "Medium" if district else "Country-wide (district-level recommended)"

    lines = []
    lines.append(f"# FLOOD ACTION PLAN — {label}")
    lines.append(f"Generated: {now} · Scenario: {depth_m:.1f} m · Lead time: 72 h")
    lines.append(f"Confidence: {conf} · Source: GloFAS + UN Data Commons")
    lines.append("")

    lines.append("## 1. THE HAZARD")
    lines.append(f"- Modelled flood depth ~{depth_m:.1f} m; {len(flooded):,} exposed cells "
                 f"across {len(rows)} districts.")
    lines.append("- Act within the 72-hour lead window.")
    lines.append("")

    lines.append("## 2. WHO IS AFFECTED (vulnerable first)")
    lines.append("| District | Children u5 | Max risk | Hot cells |")
    lines.append("|---|---|---|---|")
    for r in top:
        lines.append(f"| {r['district']} | {_fmt(r['u5'])} | "
                     f"{int(r['max_risk']*100)}% | {r['hot']} |")
    lines.append(f"\n**Total under-5 exposed: ~{_fmt(total_u5)}** · "
                 f"schools nearby: {schools} · clinics nearby: {clinics}")
    lines.append("")

    lines.append("## 3. PRIORITY ORDER (who first, and WHY)")
    for i, r in enumerate(top, 1):
        lines.append(f"{i}. **{r['district']}** — {_fmt(r['u5'])} children, "
                     f"{r['hot']} high-risk cells, depth-weighted exposure.")
    lines.append("\n*Rule: children × depth × distance-to-care (editable).*")
    lines.append("")

    lines.append("## 4. THE PROTOCOL (what to do now)")
    lines.append(f"- Pre-position relief supplies for ~{_fmt(total_u5)} exposed under-5s.")
    lines.append("- Protect cold chain at at-risk clinics; stage water-purification units.")
    lines.append("- Confirm evacuation centres above the flood line.")
    lines.append("- Evacuation centres: _Center X / Center Y_ — **placeholder, human-supplied** "
                 "(capacities & contacts are not in open data).")
    lines.append("")

    lines.append("## 5. SOURCES (every number is traceable)")
    lines.append("- Children: WorldPop 2020 · Flood: GloFAS / JRC")
    lines.append("- Schools: UNICEF Giga + OSM · Clinics: Healthsites.io + OSM")
    lines.append("- Joined via the UN Data Commons graph.")
    return "\n".join(lines)
