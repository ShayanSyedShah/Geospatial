"""Supply protocol — pre-positioning & relief manifest for the Sylhet 2022 replay.

This is the REFERENCE protocol. It runs against the frozen ``ScenarioContext``
and answers: *given the peak-flood footprint, where do we pre-position relief
first, what do we send, and what does it cost against the real 2022 appeal?*

Ranking
-------
We rank districts by **need ÷ access** — but expressed as need *amplified* by how
hard the zone is to reach, because remoteness raises (not lowers) priority:

    exposed_u5   = sum(population_u5) over cells above the flood-exposure threshold
    need         = exposed_u5 * vulnerability[district]      # real Commons indicator
    access_pen   = 1 + mean(access_difficulty over the district's exposed cells)
    score        = need * access_pen

``vulnerability`` is a real UN Data Commons indicator (cached offline, cited via
``vulnerability_commons``). ``access_difficulty`` is the documented per-cell proxy
from the scenario context (NO fabricated distances). ``population_u5`` and the
flood footprint trace to the base registry (``pop_worldpop_u5`` / ``flood_glofas``).

Supply manifest
---------------
Quantities come from **Sphere Handbook** minimum humanitarian standards applied to
people-in-need (exposed under-5 plus a documented household multiplier), each line
cited in ``PROVENANCE``. The costed response is compared to the real 2022
Bangladesh monsoon-floods Humanitarian Response Plan (~$58.4M, 23.5% funding gap).
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..scenario.sylhet2022 import ScenarioContext
from .base import MapLayer, Metric, Provenance, ProtocolResult, Target

# --- Sphere / appeal constants (every one carries a PROVENANCE entry) ---------
# Sphere minimum standards (people in need = the under-5 cohort plus the rest of
# their household, so under-5 exposure scales to total beneficiaries).
_HH_SIZE_BGD = 4.06              # mean household size, BBS Census 2022 -> people per child cohort
_U5_SHARE_BGD = 0.094           # under-5 share of population (WorldPop/UN WPP) -> household scaler
_WATER_L_PPD = 15.0             # Sphere: min 15 L/person/day for drinking, cooking, hygiene
_FOOD_KCAL_PPD = 2100.0         # Sphere: 2,100 kcal/person/day minimum dietary energy
_HH_PER_SHELTER = 1.0           # one emergency shelter / tarpaulin kit per affected household
_RESPONSE_DAYS = 30             # one-month pre-positioning horizon

# Real 2022 Bangladesh monsoon-floods appeal (HRP / ReliefWeb).
_APPEAL_REQUESTED_USD = 58_400_000.0
_APPEAL_FUNDING_GAP = 0.235     # 23.5% unmet at close

# Order-of-magnitude unit costs for the costed line (documented caveat, not a quote).
_COST_WATER_USD_PER_L = 0.003   # bulk treated water / treatment, indicative
_COST_FOOD_USD_PER_KCAL = 0.00018  # ~US$0.38 per 2,100 kcal ration-day, indicative
_COST_SHELTER_USD = 75.0        # emergency shelter / tarpaulin + fixings kit, indicative

_TOP_N = 8                      # zones surfaced as targets / on the map


def _district_exposed(ctx: ScenarioContext) -> Dict[str, Dict[str, Any]]:
    """Aggregate exposed under-5 and mean access difficulty per district.

    A cell is *exposed* if its peak-flood risk clears the scenario exposure
    threshold (same gate the context uses for the hazard footprint).
    """
    agg: Dict[str, Dict[str, Any]] = {}
    thr = ctx.exposure_threshold
    for c in ctx.cells:
        if float(c.get("flood_risk", 0.0)) <= thr:
            continue
        d = str(c.get("district", "Unknown"))
        rec = agg.setdefault(d, {"exposed_u5": 0, "diff_sum": 0.0, "n": 0,
                                 "lat_sum": 0.0, "lng_sum": 0.0})
        rec["exposed_u5"] += int(c.get("population_u5", 0))
        rec["diff_sum"] += float(c.get("access_difficulty", 0.0))
        rec["n"] += 1
        rec["lat_sum"] += float(c.get("lat", 0.0))
        rec["lng_sum"] += float(c.get("lng", 0.0))
    return agg


def build(ctx: ScenarioContext) -> ProtocolResult:
    agg = _district_exposed(ctx)

    ranked: List[Dict[str, Any]] = []
    for d, rec in agg.items():
        if rec["n"] == 0 or rec["exposed_u5"] <= 0:
            continue
        vuln = float(ctx.vulnerability.get(d, 0.0))
        mean_diff = rec["diff_sum"] / rec["n"]
        need = rec["exposed_u5"] * vuln
        score = need * (1.0 + mean_diff)
        ranked.append({
            "district": d,
            "exposed_u5": rec["exposed_u5"],
            "vulnerability": round(vuln, 4),
            "mean_access_difficulty": round(mean_diff, 4),
            "need": round(need, 2),
            "score": round(score, 2),
            "lat": rec["lat_sum"] / rec["n"],
            "lng": rec["lng_sum"] / rec["n"],
        })
    ranked.sort(key=lambda r: r["score"], reverse=True)

    # --- People in need: under-5 exposure scaled to whole households ----------
    total_exposed_u5 = sum(r["exposed_u5"] for r in ranked)
    hh_scaler = _HH_SIZE_BGD / (_U5_SHARE_BGD * _HH_SIZE_BGD) if _U5_SHARE_BGD else 1.0
    # exposed under-5 -> total exposed people (under-5 are ~9.4% of the population)
    people_in_need = int(round(total_exposed_u5 / _U5_SHARE_BGD)) if _U5_SHARE_BGD else total_exposed_u5
    households = int(round(people_in_need / _HH_SIZE_BGD)) if _HH_SIZE_BGD else people_in_need

    # --- Sphere manifest -----------------------------------------------------
    water_l = people_in_need * _WATER_L_PPD * _RESPONSE_DAYS
    food_kcal = people_in_need * _FOOD_KCAL_PPD * _RESPONSE_DAYS
    shelters = int(round(households * _HH_PER_SHELTER))

    # --- Costed response vs the real appeal ----------------------------------
    cost = (water_l * _COST_WATER_USD_PER_L
            + food_kcal * _COST_FOOD_USD_PER_KCAL
            + shelters * _COST_SHELTER_USD)
    funded = _APPEAL_REQUESTED_USD * (1.0 - _APPEAL_FUNDING_GAP)
    gap_usd = _APPEAL_REQUESTED_USD - funded

    summary_metrics = [
        Metric(id="people_in_need", label="People in need",
               value=people_in_need, unit="people",
               provenance_id="household_demographics_bgd"),
        Metric(id="children_u5_exposed", label="Children under 5 exposed",
               value=total_exposed_u5, unit="people",
               provenance_id="pop_worldpop_u5"),
        Metric(id="water_l_30d", label="Water (Sphere, 30 days)",
               value=int(round(water_l)), unit="L",
               provenance_id="sphere_water"),
        Metric(id="food_rations_30d", label="Food rations (Sphere, 30 days)",
               value=int(round(food_kcal / _FOOD_KCAL_PPD)), unit="person-days",
               provenance_id="sphere_food"),
        Metric(id="shelter_kits", label="Emergency shelter kits",
               value=shelters, unit="kits",
               provenance_id="sphere_shelter"),
        Metric(id="response_cost", label="Estimated response cost",
               value=int(round(cost)), unit="USD",
               provenance_id="supply_unit_costs"),
        Metric(id="appeal_requested", label="2022 appeal (requested)",
               value=int(_APPEAL_REQUESTED_USD), unit="USD",
               provenance_id="bgd_2022_appeal"),
        Metric(id="funding_gap", label="2022 appeal funding gap",
               value=round(_APPEAL_FUNDING_GAP * 100, 1), unit="%",
               provenance_id="bgd_2022_appeal"),
        Metric(id="funding_gap_usd", label="2022 appeal unmet need",
               value=int(round(gap_usd)), unit="USD",
               provenance_id="bgd_2022_appeal"),
    ]

    # --- Targets: top priority zones -----------------------------------------
    targets: List[Target] = []
    for i, r in enumerate(ranked[:_TOP_N]):
        targets.append(Target(
            id=f"supply-{i+1}-{r['district']}",
            name=r["district"],
            admin_unit=r["district"],
            rank=i + 1,
            score=r["score"],
            lat=round(r["lat"], 5),
            lng=round(r["lng"], 5),
            metrics=[
                Metric(id=f"{r['district']}_exposed_u5",
                       label="Children under 5 exposed",
                       value=r["exposed_u5"], unit="people",
                       provenance_id="pop_worldpop_u5"),
                Metric(id=f"{r['district']}_vulnerability",
                       label="District vulnerability",
                       value=r["vulnerability"], unit="share (0..1)",
                       provenance_id="vulnerability_commons"),
                Metric(id=f"{r['district']}_access",
                       label="Mean access difficulty",
                       value=r["mean_access_difficulty"], unit="share (0..1)",
                       provenance_id="flood_glofas"),
                Metric(id=f"{r['district']}_need",
                       label="Weighted need",
                       value=r["need"], unit="vuln-weighted children",
                       provenance_id="vulnerability_commons"),
            ],
        ))

    # --- Map layer: priority-zone points coloured by score -------------------
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(r["lng"], 5), round(r["lat"], 5)]},
            "properties": {
                "district": r["district"],
                "score": r["score"],
                "rank": i + 1,
                "exposed_u5": r["exposed_u5"],
                "vulnerability": r["vulnerability"],
                "access_difficulty": r["mean_access_difficulty"],
            },
        }
        for i, r in enumerate(ranked[:_TOP_N])
    ]
    max_score = max((r["score"] for r in ranked[:_TOP_N]), default=1.0) or 1.0
    map_layer = MapLayer(
        id="supply_priority_zones",
        kind="points",
        data={"type": "FeatureCollection", "features": features},
        color_by="score",
        legend={
            "title": "Pre-positioning priority (need x access)",
            "min": 0,
            "max": round(max_score, 2),
            "unit": "score",
        },
    )

    top = ranked[0] if ranked else None
    headline = (
        f"Pre-position relief for {people_in_need:,} people in need — "
        f"{top['district']} ranks first by need x access" if top
        else "No exposed zones above the flood-exposure threshold."
    )

    evidence = [Provenance(**v) for v in PROVENANCE.values()]

    caveats = [
        "Ranking weights real exposed under-5 by a real UN Data Commons "
        "vulnerability indicator, amplified by the documented per-cell "
        "access-difficulty proxy (flood depth + clinic remoteness) — not a "
        "measured travel time or a 3W operational-presence layer.",
        "People-in-need scales exposed under-5 to whole households using "
        "published under-5 share and mean household size; it is a planning "
        "estimate, not a registered caseload.",
        "Supply quantities are Sphere minimum standards over a 30-day horizon; "
        "unit costs are indicative order-of-magnitude figures for comparison, "
        "not procurement quotes.",
        "Cost is compared to the real 2022 Bangladesh monsoon-floods appeal for "
        "context; it is not a substitute for the official HRP costing.",
    ]

    return ProtocolResult(
        protocol_id="supply",
        headline=headline,
        summary_metrics=summary_metrics,
        targets=targets,
        map_layer=map_layer,
        evidence=evidence,
        caveats=caveats,
    )


# --- Module-level curated provenance (Sphere + appeal + cost assumptions) -----
PROVENANCE: Dict[str, dict] = {
    "sphere_water": {
        "id": "sphere_water",
        "label": "Minimum water supply (15 L/person/day)",
        "value": _WATER_L_PPD,
        "unit": "L/person/day",
        "source": ("Sphere Handbook 2018, WASH chapter, Standard 2.1 "
                   "(Water supply) — basic survival water needs"),
        "publisher": "Sphere Association",
        "dcid": None,
        "date": "2018",
        "url": "https://spherestandards.org/handbook/",
        "method": ("Per-capita minimum (drinking + cooking + hygiene) multiplied by "
                   "people-in-need over a 30-day response horizon."),
        "caveat": ("Minimum survival figure; actual needs rise with climate, health "
                   "and cooking practices. Indicative for planning, not a delivery target."),
    },
    "sphere_food": {
        "id": "sphere_food",
        "label": "Minimum dietary energy (2,100 kcal/person/day)",
        "value": _FOOD_KCAL_PPD,
        "unit": "kcal/person/day",
        "source": ("Sphere Handbook 2018, Food Security & Nutrition chapter — "
                   "minimum average dietary energy requirement"),
        "publisher": "Sphere Association",
        "dcid": None,
        "date": "2018",
        "url": "https://spherestandards.org/handbook/",
        "method": ("Planning kcal/person/day x people-in-need x 30 days; reported as "
                   "person-days of full rations."),
        "caveat": ("Population-level planning figure; does not account for demographic "
                   "or activity adjustments to the reference requirement."),
    },
    "sphere_shelter": {
        "id": "sphere_shelter",
        "label": "Emergency shelter (one kit per household)",
        "value": _HH_PER_SHELTER,
        "unit": "kits/household",
        "source": ("Sphere Handbook 2018, Shelter & Settlement chapter, "
                   "Standard 3 (Living space) — covered, adequate living space"),
        "publisher": "Sphere Association",
        "dcid": None,
        "date": "2018",
        "url": "https://spherestandards.org/handbook/",
        "method": ("One emergency shelter / tarpaulin kit per affected household; "
                   "households = people-in-need / mean household size."),
        "caveat": ("Kit assumption simplifies Sphere covered-area guidance (3.5 m2/person); "
                   "actual kit content varies by cluster pipeline."),
    },
    "household_demographics_bgd": {
        "id": "household_demographics_bgd",
        "label": "Bangladesh household size & under-5 share",
        "value": _HH_SIZE_BGD,
        "unit": "people/household",
        "source": ("Bangladesh Population & Housing Census 2022 (mean household size); "
                   "UN World Population Prospects / WorldPop (under-5 share)"),
        "publisher": "Bangladesh Bureau of Statistics (BBS); UN DESA Population Division",
        "dcid": None,
        "date": "2022",
        "url": "https://bbs.gov.bd/",
        "method": (f"Mean household size {_HH_SIZE_BGD}; under-5 share {_U5_SHARE_BGD:.3f}. "
                   "Exposed under-5 / under-5 share = exposed people; / household size = households."),
        "caveat": ("National averages applied uniformly across districts; true household "
                   "size and age structure vary locally."),
    },
    "bgd_2022_appeal": {
        "id": "bgd_2022_appeal",
        "label": "Bangladesh 2022 monsoon floods appeal (~$58.4M, 23.5% gap)",
        "value": _APPEAL_REQUESTED_USD,
        "unit": "USD",
        "source": ("Bangladesh Monsoon Floods 2022 Humanitarian Response Plan / "
                   "Humanitarian Coordination Task Team appeal (ReliefWeb / FTS)"),
        "publisher": "UN OCHA / Humanitarian Coordination Task Team Bangladesh",
        "dcid": None,
        "date": "2022",
        "url": "https://reliefweb.int/country/bgd",
        "method": ("Requirements ~US$58.4M for the June 2022 Sylhet/Sunamganj flash-flood "
                   "response; ~23.5% of requirements remained unfunded at close (per FTS)."),
        "caveat": ("Headline appeal figures transcribed from the public response plan / "
                   "Financial Tracking Service; exact totals were revised during the response."),
    },
    "supply_unit_costs": {
        "id": "supply_unit_costs",
        "label": "Indicative relief unit costs",
        "value": None,
        "unit": "USD",
        "source": "Indicative humanitarian unit-cost assumptions (planning only)",
        "publisher": "BEACON decision sandbox (assumption)",
        "dcid": None,
        "date": "2026",
        "url": None,
        "method": (f"water ${_COST_WATER_USD_PER_L}/L, food ${_COST_FOOD_USD_PER_KCAL}/kcal "
                   f"(~$0.38 per 2,100 kcal ration-day), shelter ${_COST_SHELTER_USD}/kit; "
                   "applied to the Sphere manifest to estimate total cost."),
        "caveat": ("Order-of-magnitude planning assumptions, NOT procurement quotes; used "
                   "only to put the manifest on the same scale as the real 2022 appeal."),
    },
}
