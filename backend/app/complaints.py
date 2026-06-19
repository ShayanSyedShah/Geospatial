"""Seeded complaint/issue intake anchored to the worst-hit flood cells.

Deterministic (no randomness) so the demo is stable. Two sources: affected
community members and field staff. The frontend mutates status client-side.
"""
from __future__ import annotations

import pandas as pd

_COMMUNITY = [
    ("No clean drinking water", "water", "urgent"),
    ("Family stranded, water rising fast", "rescue", "urgent"),
    ("Latrines flooded, disease fear", "sanitation", "high"),
    ("Children have no dry shelter", "shelter", "high"),
    ("Food ran out two days ago", "food", "med"),
    ("Elderly neighbour needs medicine", "health", "high"),
]
_FIELD = [
    ("Cold chain down at clinic", "health", "urgent"),
    ("Fuel shortage at depot", "logistics", "high"),
    ("Bridge cut, district unreachable", "access", "urgent"),
    ("Shelter kits exhausted", "logistics", "med"),
    ("Need boats for evacuation", "logistics", "high"),
]


def build_complaints(df: pd.DataFrame, country: str) -> dict:
    sub = df[df["country"] == country].sort_values("flood_risk_7d", ascending=False)
    cells = sub.head(20).reset_index(drop=True)
    out = []
    statuses = ["reported", "reported", "in_progress", "resolved"]
    for i, c in cells.iterrows():
        pool = _COMMUNITY if i % 2 == 0 else _FIELD
        text, cat, sev = pool[i % len(pool)]
        out.append({
            "id": f"C-{i+1:03d}",
            "source": "community" if i % 2 == 0 else "field",
            "text": f"{text} ({c['district']})",
            "district": str(c["district"]),
            "lat": float(c["lat"]), "lng": float(c["lng"]),
            "severity": sev, "status": statuses[i % len(statuses)],
            "category": cat, "age_h": int(2 + (i * 3) % 46),
        })
    return {"country": country, "complaints": out}
