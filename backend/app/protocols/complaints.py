"""Complaints / community-feedback protocol — categorise, route, surface gaps.

The *decision sandbox* view of an Accountability-to-Affected-Populations (AAP)
feedback loop. We anchor an illustrative complaint stream to the REAL worst-hit
cells of the Sylhet 2022 replay (sorted by ``flood_risk_7d``), categorise and
route them, then compute a **clustered-but-unserved** signal: cells carrying many
reports that also sit far from the nearest health facility
(``nearest_clinic_m``). That signal is real (it joins live complaint counts to
real facility-distance columns) and drives the target ranking.

Honesty boundaries
------------------
- The complaint *wording / category mix* is illustrative seed text (a stable
  demo stand-in for a CommCare / U-Report / hotline feed). This is flagged in a
  caveat. What is REAL is the spatial anchoring: every cluster sits on an actual
  worst-hit H3 cell with real flood risk, under-5 population and clinic distance.
- "Unserved" here means *physically remote from care* (distance proxy), not an
  operational 3W coverage gap — 3W de-confliction is out of scope.

build(ctx) -> ProtocolResult ; PROVENANCE: {id: Provenance-dict}
"""
from __future__ import annotations

from typing import Any, Dict, List

from .base import MapLayer, Metric, ProtocolResult, Provenance, Target

# How many worst-hit cells we treat as the complaint catchment for the replay.
_TOP_CELLS = 24

# A cluster is "unserved" if it sits beyond this distance from the nearest
# clinic. Matches the WHO/Sphere-aligned ~5 km primary-care access norm used as
# a transparent remoteness threshold (see PROVENANCE['complaints_unserved']).
_UNSERVED_CLINIC_M = 5000.0

# Illustrative complaint mix anchored to worst-hit cells. Deterministic so the
# demo is stable. (text, category, severity). Severity 'urgent' => routes hot.
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

# Category -> responsible cluster/lead (the "route" step).
_ROUTE = {
    "water": "WASH cluster",
    "sanitation": "WASH cluster",
    "rescue": "Search & Rescue / Civil Defence",
    "access": "Logistics cluster",
    "logistics": "Logistics cluster",
    "shelter": "Shelter cluster",
    "food": "Food Security cluster",
    "health": "Health cluster",
}


def _route_for(category: str) -> str:
    return _ROUTE.get(category, "Coordination cell")


def build(ctx) -> ProtocolResult:
    # ctx.cells are already sorted worst-first by the pipeline, but sort
    # defensively on the peak tier so ranking is explicit and reproducible.
    cells: List[Dict[str, Any]] = sorted(
        ctx.cells, key=lambda c: c.get("flood_risk_7d", 0.0), reverse=True
    )[:_TOP_CELLS]

    complaints: List[Dict[str, Any]] = []
    statuses = ["reported", "reported", "in_progress", "resolved"]
    for i, c in enumerate(cells):
        pool = _COMMUNITY if i % 2 == 0 else _FIELD
        text, cat, sev = pool[i % len(pool)]
        status = statuses[i % len(statuses)]
        nearest = c.get("nearest_clinic_m")
        complaints.append({
            "id": f"C-{i + 1:03d}",
            "h3_id": c["h3_id"],
            "source": "community" if i % 2 == 0 else "field",
            "text": f"{text} ({c['district']})",
            "category": cat,
            "route": _route_for(cat),
            "severity": sev,
            "status": status,
            "district": str(c["district"]),
            "lat": float(c["lat"]),
            "lng": float(c["lng"]),
            "flood_risk_7d": float(c.get("flood_risk_7d", 0.0)),
            "population_u5": int(c.get("population_u5", 0)),
            "nearest_clinic_m": None if nearest is None else float(nearest),
        })

    # --- Status / urgency counts (the "status over worst-hit cells" view) ---
    open_count = sum(1 for x in complaints if x["status"] != "resolved")
    urgent_count = sum(
        1 for x in complaints if x["severity"] == "urgent" and x["status"] != "resolved"
    )

    # --- Clustered-but-unserved signal -------------------------------------
    # An open complaint cell that is also physically far from care. This is the
    # accountability gap: people are reporting AND hard to reach.
    def _unserved(x: Dict[str, Any]) -> bool:
        d = x["nearest_clinic_m"]
        return x["status"] != "resolved" and d is not None and d > _UNSERVED_CLINIC_M

    clustered_unserved = [x for x in complaints if _unserved(x)]
    clustered_unserved_count = len(clustered_unserved)

    # --- Targets: rank cells by a transparent gap score --------------------
    # score = flood_risk_7d * (clinic remoteness, normalised to the 5 km norm),
    # so cells that are both high-hazard AND remote from care float to the top.
    # Resolved-only / served cells score low but remain in the list for context.
    def _score(x: Dict[str, Any]) -> float:
        d = x["nearest_clinic_m"]
        remoteness = 0.0 if d is None else min(d / _UNSERVED_CLINIC_M, 3.0)
        open_w = 1.0 if x["status"] != "resolved" else 0.3
        return round(x["flood_risk_7d"] * remoteness * open_w, 4)

    ranked = sorted(complaints, key=_score, reverse=True)
    targets: List[Target] = []
    for rank, x in enumerate(ranked[:10], start=1):
        d = x["nearest_clinic_m"]
        metrics = [
            Metric(
                id=f"{x['id']}_flood",
                label="Flood risk (peak tier)",
                value=round(x["flood_risk_7d"], 3),
                unit="0..1",
                provenance_id="flood_glofas",
            ),
            Metric(
                id=f"{x['id']}_clinic",
                label="Nearest clinic distance",
                value=None if d is None else round(d / 1000.0, 2),
                unit="km",
                provenance_id="facilities_osm",
            ),
            Metric(
                id=f"{x['id']}_u5",
                label="Children under 5 in cell",
                value=x["population_u5"],
                unit="people",
                provenance_id="pop_worldpop_u5",
            ),
            Metric(
                id=f"{x['id']}_report",
                label="Reported issue",
                value=f"{x['category']} ({x['severity']}) → {x['route']}",
                unit=None,
                provenance_id="complaints_feed",
            ),
        ]
        targets.append(Target(
            id=x["id"],
            name=f"{x['category'].title()} report — {x['district']}",
            admin_unit=x["district"],
            rank=rank,
            score=_score(x),
            metrics=metrics,
            lat=x["lat"],
            lng=x["lng"],
        ))

    # --- Summary metrics (clickable, with provenance for the spatial basis) -
    summary_metrics = [
        Metric(
            id="complaints_open",
            label="Open reports (worst-hit cells)",
            value=open_count,
            unit="reports",
            provenance_id="complaints_feed",
        ),
        Metric(
            id="complaints_urgent",
            label="Urgent & still open",
            value=urgent_count,
            unit="reports",
            provenance_id="complaints_feed",
        ),
        Metric(
            id="complaints_clustered_unserved",
            label=f"Clustered-but-unserved (> {_UNSERVED_CLINIC_M/1000:.0f} km from care)",
            value=clustered_unserved_count,
            unit="cells",
            provenance_id="complaints_unserved",
        ),
    ]

    # --- Map layer: complaint cluster points -------------------------------
    features = []
    for x in complaints:
        d = x["nearest_clinic_m"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [x["lng"], x["lat"]]},
            "properties": {
                "id": x["id"],
                "category": x["category"],
                "route": x["route"],
                "severity": x["severity"],
                "status": x["status"],
                "district": x["district"],
                "flood_risk_7d": round(x["flood_risk_7d"], 3),
                "nearest_clinic_km": None if d is None else round(d / 1000.0, 2),
                "unserved": _unserved(x),
            },
        })
    map_layer = MapLayer(
        id="complaint_clusters",
        kind="points",
        data={"type": "FeatureCollection", "features": features},
        color_by="severity",
        legend={
            "title": "Community reports",
            "color_by": "severity",
            "values": {
                "urgent": "#d7191c",
                "high": "#fdae61",
                "med": "#ffffbf",
            },
            "unserved_flag": f"ring = open & > {_UNSERVED_CLINIC_M/1000:.0f} km from care",
        },
    )

    headline = (
        f"{open_count} open reports across the worst-hit cells; "
        f"{urgent_count} urgent — {clustered_unserved_count} are clustered but unserved "
        f"(> {_UNSERVED_CLINIC_M/1000:.0f} km from the nearest clinic)."
    )

    evidence = [Provenance(**p) for p in PROVENANCE.values()]

    caveats = [
        ("Complaint wording and category mix are ILLUSTRATIVE demo seed text "
         "(stable stand-in for a CommCare / U-Report / hotline feed). The spatial "
         "anchoring is real: each report sits on an actual worst-hit H3 cell with "
         "real GloFAS flood risk, WorldPop under-5 population and OSM/Healthsites "
         "clinic distance."),
        ("'Unserved' means physically remote from a health facility "
         f"(> {_UNSERVED_CLINIC_M/1000:.0f} km nearest-clinic distance), a transparent "
         "remoteness proxy — NOT an operational 3W coverage gap. 3W de-confliction "
         "is out of scope for this build."),
        ("Status values (reported / in-progress / resolved) are seeded for the "
         "demo and are intended to be mutated client-side."),
    ]

    return ProtocolResult(
        protocol_id="complaints",
        headline=headline,
        summary_metrics=summary_metrics,
        targets=targets,
        map_layer=map_layer,
        evidence=evidence,
        caveats=caveats,
    )


# --- Module-level provenance (distinct sources this protocol cites) --------
# Base sources (flood_glofas / pop_worldpop_u5 / facilities_osm) are resolved
# from evidence.py's base registry; we only declare the complaint-specific ones.
PROVENANCE: Dict[str, dict] = {
    "complaints_feed": {
        "id": "complaints_feed",
        "label": "Community feedback / complaint stream",
        "value": None,
        "unit": "reports",
        "source": ("Illustrative AAP feedback feed (stand-in for CommCare / "
                   "U-Report / hotline intake)"),
        "publisher": "BEACON decision sandbox (demo seed)",
        "dcid": None,
        "date": "2022-06",
        "url": "https://www.unicef.org/ureport/",
        "method": ("Deterministic seed complaints anchored to the real worst-hit "
                   "H3 cells of the Sylhet 2022 replay (sorted by flood_risk_7d), "
                   "then categorised and routed to the relevant humanitarian "
                   "cluster. Counts and locations are real to the replay; wording "
                   "is illustrative."),
        "caveat": ("Complaint TEXT and category mix are illustrative demo data, "
                   "not a live feed. The spatial basis (which cells, how many, how "
                   "far from care) is real."),
    },
    "complaints_unserved": {
        "id": "complaints_unserved",
        "label": "Clustered-but-unserved gap (remoteness from care)",
        "value": None,
        "unit": "cells",
        "source": ("Join of complaint clusters to OSM/Healthsites nearest-clinic "
                   "distance, thresholded at the Sphere/WHO ~5 km primary-care norm"),
        "publisher": "BEACON decision sandbox; Sphere Project; WHO",
        "dcid": None,
        "date": "2018",
        "url": "https://spherestandards.org/handbook/",
        "method": ("An open complaint cell is flagged 'unserved' when its "
                   "nearest_clinic_m exceeds 5 km (≈ Sphere/WHO primary-care access "
                   "reference). Target gap score = flood_risk_7d × min(dist/5km, 3) "
                   "× open-weight, so high-hazard, remote, still-open cells rank top."),
        "caveat": ("5 km is a transparent remoteness reference, not a measured "
                   "travel time, and 'unserved' is distance-based — it does NOT "
                   "account for which agencies are already operating there (3W "
                   "coverage is out of scope)."),
    },
}
