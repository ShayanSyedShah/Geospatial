"""Education-in-emergencies view derived from at-risk schools + exposed kids."""
from __future__ import annotations

import pandas as pd

CURRICULUM = [
    {"id": "sel", "name": "Psychosocial / SEL", "desc": "Trauma-informed wellbeing sessions"},
    {"id": "catchup", "name": "Catch-up literacy & numeracy", "desc": "Accelerated learning packs"},
    {"id": "radio", "name": "Radio / SMS learning", "desc": "Lessons for no-connectivity zones"},
    {"id": "wash", "name": "Hygiene & safety", "desc": "Flood-season WASH and safety basics"},
]


def build_education(df: pd.DataFrame, facilities: pd.DataFrame,
                    country: str, district: str | None) -> dict:
    fac = facilities[(facilities["country"] == country) & (facilities["type"] == "school")]
    hx = df[df["country"] == country]
    if district and district != "All":
        fac = fac[fac["district"] == district]
        hx = hx[hx["district"] == district]
    schools_total = int(len(fac))
    schools_hit = int(fac["at_risk"].sum())
    # ~18% of exposed under-5 + school-age proxy out of class
    children_out = int(hx["population_u5"].sum() * 1.6 * 0.18)
    learning_centers = max(1, round(schools_hit / 3))
    recovery = [
        {"week": 1, "label": "Assess & psychosocial first aid", "reopened_pct": 0},
        {"week": 2, "label": "Temporary learning spaces open", "reopened_pct": 25},
        {"week": 4, "label": "Catch-up programme running", "reopened_pct": 55},
        {"week": 8, "label": "Schools reopening", "reopened_pct": 85},
    ]
    return {
        "country": country, "district": district,
        "schools_total": schools_total, "schools_hit": schools_hit,
        "children_out": children_out, "learning_centers": learning_centers,
        "recovery": recovery, "curriculum": CURRICULUM,
    }
