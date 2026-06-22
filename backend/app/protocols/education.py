"""Education-in-emergencies protocol — which schools to restore first.

Runs against the frozen Sylhet 2022 scenario context (peak flood). It ranks the
real at-risk schools by *who is harmed and how badly*, converts WorldPop under-5
exposure into a primary-school-age estimate via a sourced census cohort ratio
(NOT a magic number), and proposes a phased reopening sequence.

Ranking method (per at-risk school)
------------------------------------
    score = exposure   (school's own flood-risk 0..1, from the facility layer)
          x vulnerability(district)   (UN/UNICEF MICS stunting proxy, 0..1)
          x children_factor          (district primary-school-age children, normalised)

All three terms are real joins from ``ctx``:
- exposure       : ``facility.risk`` (GloFAS-derived per-facility flood exposure)
- vulnerability  : ``ctx.vulnerability[district]`` (MICS 2019 stunting, cached offline)
- children_factor: per-district primary-school-age estimate = sum(cell under-5)
                   x SCHOOL_AGE_RATIO, min-max normalised across affected districts.

Every emitted Metric points at a provenance_id in this module's PROVENANCE or in
evidence.py's base registry (``population_u5`` / ``flood`` / ``facility`` /
``vulnerability``).
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List

from .base import MapLayer, Metric, ProtocolResult, Provenance

PROTOCOL_ID = "education"

# ---------------------------------------------------------------------------
# Sourced cohort ratio (replaces the old fabricated "1.6 * 0.18" heuristic).
#
# WorldPop gives us under-5 (ages 0-4) counts per cell. To estimate primary-
# school-age children we scale by the ratio of the 5-9 cohort to the 0-4 cohort
# from the most granular *published* Bangladesh age structure (2011 Census):
#     5-9 cohort  = 18,173,229
#     0-4 cohort  = 15,061,970
#     ratio       = 18,173,229 / 15,061,970 = 1.2066...
# This is a documented, single-source ratio with a caveat — see PROVENANCE.
# ---------------------------------------------------------------------------
_COHORT_5_9 = 18_173_229
_COHORT_0_4 = 15_061_970
SCHOOL_AGE_RATIO = round(_COHORT_5_9 / _COHORT_0_4, 4)  # ~1.2066

TOP_N = 12  # priority schools surfaced as targets


PROVENANCE: Dict[str, dict] = {
    "school_age_ratio": {
        "id": "school_age_ratio",
        "label": "Primary-school-age (5-9) to under-5 (0-4) cohort ratio",
        "value": SCHOOL_AGE_RATIO,
        "unit": "ratio",
        "source": "Bangladesh Population & Housing Census 2011, age-structure table "
                  "(0-4 = 15,061,970; 5-9 = 18,173,229)",
        "publisher": "Bangladesh Bureau of Statistics (BBS)",
        "dcid": "Count_Person_5To9Years",
        "date": "2011",
        "url": "https://en.wikipedia.org/wiki/Demographics_of_Bangladesh",
        "method": "Primary-school-age children per cell estimated as "
                  "WorldPop under-5 count x (5-9 cohort / 0-4 cohort) = x1.2066, "
                  "using the most granular published single-cohort census counts.",
        "caveat": "Cohort ratio derived from the 2011 census national age structure "
                  "(the latest census publishing single-year 5-9 / 0-4 cohorts) and "
                  "applied uniformly; it assumes the national 5-9:0-4 ratio holds at "
                  "district level and that the 5-9 band stands in for primary-school "
                  "enrolment age. It is an order-of-magnitude planning estimate, not "
                  "an enrolment census.",
    },
    "school_reopening_phases": {
        "id": "school_reopening_phases",
        "label": "Phased school-reopening sequence for flood response",
        "value": None,
        "unit": None,
        "source": "INEE Minimum Standards for Education: Preparedness, Response, "
                  "Recovery (Domain 2 Access & Learning Environment; Domain 4 "
                  "Teaching & Learning) and the Education Cannot Wait flood-response "
                  "playbook",
        "publisher": "Inter-agency Network for Education in Emergencies (INEE)",
        "dcid": None,
        "date": "2024",
        "url": "https://inee.org/minimum-standards",
        "method": "Reopening percentages are an illustrative recovery curve aligned "
                  "to the INEE recovery domains (assess -> temporary learning spaces "
                  "-> catch-up -> phased reopening); not country-specific timings.",
        "caveat": "Phase timings are planning guidance, not a measured Sylhet 2022 "
                  "recovery timeline. They illustrate sequence, not a forecast.",
    },
}


def _norm(values: Dict[str, float]) -> Dict[str, float]:
    """Min-max normalise a dict of values to 0..1 (constant -> all 1.0)."""
    if not values:
        return {}
    lo = min(values.values())
    hi = max(values.values())
    if hi <= lo:
        return {k: 1.0 for k in values}
    return {k: (v - lo) / (hi - lo) for k, v in values.items()}


def build(ctx) -> ProtocolResult:
    """Rank at-risk schools to restore first and propose a phased reopening."""
    schools = [f for f in ctx.facilities if f.get("type") == "school"]
    at_risk_schools = [s for s in schools if s.get("at_risk")]

    vulnerability: Dict[str, float] = ctx.vulnerability or {}

    # --- per-district primary-school-age children (from real WorldPop under-5) ---
    # Count only flood-exposed cells (peak risk above the scenario in-need gate),
    # so "children out of class" reflects the flooded area, not whole districts.
    thr = ctx.exposure_threshold
    u5_by_district: Dict[str, int] = defaultdict(int)
    for c in ctx.cells:
        if float(c.get("flood_risk", 0.0)) <= thr:
            continue
        u5_by_district[str(c.get("district"))] += int(c.get("population_u5") or 0)
    schoolage_by_district: Dict[str, int] = {
        d: int(round(u5 * SCHOOL_AGE_RATIO)) for d, u5 in u5_by_district.items()
    }

    # children_factor normalised across districts that actually have hit schools
    affected_districts = {str(s.get("district")) for s in at_risk_schools}
    children_factor = _norm({
        d: float(schoolage_by_district.get(d, 0)) for d in affected_districts
    })

    # --- score every at-risk school: exposure x vulnerability x children_factor ---
    scored: List[Dict[str, Any]] = []
    for s in at_risk_schools:
        district = str(s.get("district"))
        exposure = float(s.get("risk") or 0.0)
        vuln = float(vulnerability.get(district, 0.0))
        kids = children_factor.get(district, 0.0)
        score = exposure * vuln * kids
        scored.append({**s, "_district": district, "_exposure": exposure,
                       "_vuln": vuln, "_kids": kids, "_score": score})
    scored.sort(key=lambda x: x["_score"], reverse=True)

    # --- summary metrics (clickable, each provenance-backed) ---
    schools_hit = len(at_risk_schools)
    schools_total = len(schools)

    # children out of class = primary-school-age children in districts with hit
    # schools, summed (the exposed-district school-age population).
    children_out = int(sum(schoolage_by_district.get(d, 0) for d in affected_districts))

    summary_metrics = [
        Metric(
            id="children_out",
            label="Children out of class (primary school-age, exposed districts)",
            value=children_out,
            unit="children",
            provenance_id="school_age_ratio",
        ),
        Metric(
            id="schools_hit",
            label="Schools hit (flood-exposed)",
            value=schools_hit,
            unit="schools",
            provenance_id="facilities_osm",
        ),
        Metric(
            id="schools_total",
            label="Schools in scenario footprint",
            value=schools_total,
            unit="schools",
            provenance_id="facilities_osm",
        ),
        Metric(
            id="districts_affected",
            label="Districts with flood-hit schools",
            value=len(affected_districts),
            unit="districts",
            provenance_id="vulnerability_commons",
        ),
    ]

    # --- targets: top priority schools to restore first ---
    targets = []
    for rank, s in enumerate(scored[:TOP_N], start=1):
        district = s["_district"]
        district_schoolage = int(schoolage_by_district.get(district, 0))
        targets.append({
            "id": str(s.get("id")),
            "name": str(s.get("name")),
            "admin_unit": district,
            "rank": rank,
            "score": round(float(s["_score"]), 4),
            "lat": float(s.get("lat")) if s.get("lat") is not None else None,
            "lng": float(s.get("lng")) if s.get("lng") is not None else None,
            "metrics": [
                Metric(id="exposure", label="School flood exposure",
                       value=round(s["_exposure"], 3), unit="0..1",
                       provenance_id="flood_glofas"),
                Metric(id="vulnerability", label="District child vulnerability (stunting)",
                       value=round(s["_vuln"], 3), unit="0..1",
                       provenance_id="vulnerability_commons"),
                Metric(id="district_school_age", label="Primary school-age children in district",
                       value=district_schoolage, unit="children",
                       provenance_id="school_age_ratio"),
            ],
        })

    # --- phased reopening recommendation ---
    reopening = [
        {"phase": 1, "week": 1, "label": "Rapid needs assessment & psychosocial first aid",
         "reopened_pct": 0},
        {"phase": 2, "week": 2, "label": "Temporary learning spaces in safe/dry sites",
         "reopened_pct": 25},
        {"phase": 3, "week": 4, "label": "Accelerated catch-up (literacy/numeracy) running",
         "reopened_pct": 55},
        {"phase": 4, "week": 8, "label": "Phased physical reopening of repaired schools",
         "reopened_pct": 85},
    ]

    # --- map layer: priority points for the top schools ---
    point_rows = [
        {
            "id": t["id"], "name": t["name"], "district": t["admin_unit"],
            "rank": t["rank"], "score": t["score"],
            "lat": t["lat"], "lng": t["lng"],
        }
        for t in targets if t["lat"] is not None and t["lng"] is not None
    ]
    map_layer = MapLayer(
        id="education_priority_schools",
        kind="points",
        data=point_rows,
        color_by="score",
        legend={
            "title": "School restoration priority",
            "metric": "exposure x vulnerability x school-age children",
            "scale": "higher score = restore first",
        },
    ) if point_rows else None

    # --- evidence: this module's sources + the base ids it references ---
    evidence = [Provenance(**p) for p in PROVENANCE.values()]

    headline = (
        f"{schools_hit:,} schools hit, ~{children_out:,} school-age children out of class — "
        f"restore the top {min(TOP_N, len(targets))} highest-exposure, highest-vulnerability schools first"
    )

    caveats = [
        "Children-out-of-class is a planning estimate: WorldPop under-5 counts scaled "
        "by the 2011-census 5-9:0-4 cohort ratio (x1.21), summed over districts with "
        "flood-hit schools — it is exposure-based, not an attendance/enrolment count.",
        "School ranking weights flood exposure, district child vulnerability (MICS 2019 "
        "stunting proxy), and district school-age population equally (multiplicative); "
        "it does not account for building damage severity or road access.",
        "Reopening phase timings follow INEE recovery guidance and are illustrative, "
        "not a measured Sylhet 2022 recovery schedule.",
        "Operational presence (3W) is out of scope, so targets are not de-conflicted "
        "against agencies already responding.",
    ]

    return ProtocolResult(
        protocol_id=PROTOCOL_ID,
        headline=headline,
        summary_metrics=summary_metrics,
        targets=targets,
        map_layer=map_layer,
        evidence=evidence,
        caveats=caveats,
    )
