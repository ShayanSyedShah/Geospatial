"""De-confliction protocol — need vs. response-coverage gap for the Sylhet 2022 replay.

Answers: *across the six affected districts, which had high flood-need yet sat
OUTSIDE the HRP's five priority districts?* This is the protocol where the UN Data
Commons is structurally load-bearing: the need side is built from WorldPop exposure
x Commons-cited vulnerability, the coverage side from the 2022 HCTT geographic
prioritisation, and the OUTPUT is the gap between them.

    exposed_u5[d] = sum WorldPop under-5 over ctx.cells in district d above the
                    exposure gate (ctx.exposure_threshold)
    coverage[d]   = coverage_score from coverage_bgd_2022   # 0..1 (HRP prioritisation tier)

A district is UNDER-SERVED iff  exposed_u5 > FLOOR (25,000)  AND  coverage_score < 1.0
(i.e. it carries real flood-need but sits outside the HRP-5). Under-served districts
rank first by exposed_u5 desc; everything else is 'covered'.

Coverage is the HCTT Flash Floods HRP 2022 geographic prioritisation (five named
"heavily impacted" districts at 1.0 vs. affected-secondary at 0.4), NOT
per-organisation 4W counts — see the `coverage_hrp_2022` caveat. The whole appeal
closed ~23.5% funded.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List

from ..scenario.sylhet2022 import ScenarioContext
from .base import MapLayer, Metric, Provenance, ProtocolResult, Target

_U5_SHARE_BGD = 0.094          # under-5 share of population (WorldPop/UN WPP) -> people scaler
_UNDERSERVED_FLOOR = 25_000    # min exposed under-5 for a coverage gap to matter
_FULL_COVERAGE = 1.0           # HRP-priority districts score 1.0; below = outside the HRP-5


PROVENANCE: Dict[str, dict] = {
    "coverage_hrp_2022": {
        "id": "coverage_hrp_2022",
        "label": "Response coverage (HRP 2022 prioritisation)",
        "value": None,
        "unit": None,
        "source": "Flash Floods Humanitarian Response Plan 2022 + NAWG GAP Analysis + HCTT 4W",
        "publisher": "HCTT / NAWG / UN Bangladesh (OCHA)",
        "dcid": None,
        "date": "2022",
        "url": "https://reliefweb.int/report/bangladesh/gap-analysis-north-east-flash-flood-response-2022-nawg-bangladesh",
        "method": ("Per-district coverage tier from the HRP's named priority set "
                   "(Sylhet, Sunamganj, Moulvibazar, Habiganj, Netrakona = 1.0; "
                   "affected-secondary e.g. Kishoreganj = 0.4)."),
        "caveat": ("Coverage is the HRP geographic prioritisation + the 23.5%-funded national "
                   "gap, NOT a per-organisation 4W partner count. Granular 4W lives in the HCTT "
                   "Monitoring Dashboard (PDF). Presented as prioritisation-vs-need, not org counts."),
    },
    "need_worldpop_u5": {
        "id": "need_worldpop_u5",
        "label": "Children under 5 exposed (need)",
        "value": None,
        "unit": "people",
        "source": "WorldPop 2020 age/sex-structured population grids",
        "publisher": "WorldPop, University of Southampton",
        "dcid": "Count_Person_Upto5Years",
        "date": "2020",
        "url": "https://www.worldpop.org",
        "method": "Sum of under-5 population over cells above the flood-exposure threshold.",
        "caveat": "Exposure gated at the documented decision threshold (0.6), not the rp500 envelope.",
    },
    "need_vulnerability_mics": {
        "id": "need_vulnerability_mics",
        "label": "District vulnerability (under-5 stunting)",
        "value": None,
        "unit": "share 0..1",
        "source": "Bangladesh MICS 2019 (stunting prevalence, height-for-age < -2 SD)",
        "publisher": "Bangladesh Bureau of Statistics & UNICEF Bangladesh",
        "dcid": "sdg/SH_STA_STNT",
        "date": "2020-03",
        "url": "https://www.unicef.org/bangladesh/media/3281/file/Bangladesh%202019%20MICS%20Report_English.pdf",
        "method": "Division-level MICS stunting prevalence inherited by district; weights need.",
        "caveat": "Division->district heuristic; transcribed from MICS (Commons carries it national-only).",
    },
    "appeal_2022_gap": {
        "id": "appeal_2022_gap",
        "label": "2022 appeal funding gap",
        "value": "23.5% funded",
        "unit": None,
        "source": "Flash Floods Humanitarian Response Plan 2022 (US$58.4M requested)",
        "publisher": "HCTT / UN Bangladesh (OCHA)",
        "dcid": None,
        "date": "2022",
        "url": "https://reliefweb.int/report/bangladesh/flash-floods-humanitarian-response-plan-2022-united-nations-bangladesh-coordinated-appeal-july-december-2022",
        "method": "Reported appeal vs. funding received at close.",
        "caveat": "National figure; even priority districts were underfunded.",
    },
}


def _need_by_district(ctx: ScenarioContext) -> Dict[str, Dict[str, Any]]:
    """Exposed under-5 + centroid + vulnerability per district over the six
    SCENARIO_DISTRICTS.

    Derived from ``ctx.cells`` (already clipped to the six affected districts),
    gated at ``ctx.exposure_threshold`` — the same in-need cut every protocol uses.
    No national widening: de-confliction reasons within the incident scope and
    contrasts the HRP-5 against the affected-secondary district(s) inside it.
    Districts with no exposed cells are dropped.
    """
    agg: Dict[str, Dict[str, float]] = defaultdict(
        lambda: {"exposed_u5": 0, "lat_sum": 0.0, "lng_sum": 0.0, "n": 0}
    )
    for c in ctx.cells:
        if float(c.get("flood_risk", 0.0)) <= ctx.exposure_threshold:
            continue
        d = str(c["district"])
        a = agg[d]
        a["exposed_u5"] += int(c.get("population_u5", 0))
        a["lat_sum"] += float(c["lat"])
        a["lng_sum"] += float(c["lng"])
        a["n"] += 1

    out: Dict[str, Dict[str, Any]] = {}
    for d, a in agg.items():
        if a["exposed_u5"] <= 0 or a["n"] == 0:
            continue
        out[d] = {
            "exposed_u5": int(a["exposed_u5"]),
            "lat": a["lat_sum"] / a["n"],
            "lng": a["lng_sum"] / a["n"],
            "vulnerability": float(ctx.vulnerability.get(d, 0.0)),
        }
    return out


def build(ctx: ScenarioContext) -> ProtocolResult:
    coverage = ctx.coverage or {}
    cov_districts: Dict[str, Any] = (coverage.get("districts") or {})

    exposed = _need_by_district(ctx)
    rows: List[Dict[str, Any]] = []
    for d, rec in exposed.items():
        cov = cov_districts.get(d, {})
        coverage_score = float(cov.get("coverage_score", 0.0))
        # Principled gap: a district carries a coverage gap iff it has real
        # flood-need (exposed_u5 above the floor) AND sits outside the HRP-5
        # (coverage_score < 1.0). The rest are 'covered'.
        underserved = (rec["exposed_u5"] > _UNDERSERVED_FLOOR
                       and coverage_score < _FULL_COVERAGE)
        rows.append({
            "district": d,
            "exposed_u5": rec["exposed_u5"],
            "vulnerability": rec["vulnerability"],
            "coverage_score": coverage_score,
            "tier": cov.get("tier", "unknown"),
            "status": "under-served" if underserved else "covered",
            "lat": rec["lat"],
            "lng": rec["lng"],
        })

    # Under-served first (by exposed_u5 desc), then covered (also by exposed_u5 desc).
    rows.sort(key=lambda r: (r["status"] != "under-served", -r["exposed_u5"]))

    under = [r for r in rows if r["status"] == "under-served"]
    children_under = sum(r["exposed_u5"] for r in under)
    people_under = int(round(children_under / _U5_SHARE_BGD)) if _U5_SHARE_BGD else children_under
    n_priority = sum(1 for r in rows if r["coverage_score"] >= _FULL_COVERAGE)

    # under[0] is the top under-served district (highest exposed under-5).
    if under:
        worst = under[0]
        kids_k = worst["exposed_u5"] // 1000
        headline = (
            f"{worst['district']} is the clearest coverage gap — high flood-need "
            f"({kids_k}k children exposed) yet outside the HRP's five priority "
            f"districts. The 2022 appeal closed 23.5% funded."
        )
    elif rows:
        headline = (
            "No under-served districts — the HRP's five priority districts covered "
            "the highest-need areas. The 2022 appeal still closed only 23.5% funded."
        )
    else:
        headline = "No coverage gap computed (no exposed districts)."

    summary_metrics = [
        Metric(id="districts_underserved", label="Under-served districts",
               value=len(under), unit="districts", provenance_id="coverage_hrp_2022"),
        Metric(id="districts_priority", label="HRP priority districts",
               value=n_priority, unit="districts", provenance_id="coverage_hrp_2022"),
        Metric(id="children_undercovered", label="Children under-5 in under-served districts",
               value=children_under, unit="children", provenance_id="need_worldpop_u5"),
        Metric(id="people_undercovered", label="People in under-served districts (est.)",
               value=people_under, unit="people", provenance_id="need_worldpop_u5"),
        Metric(id="appeal_gap", label="2022 appeal funded",
               value="23.5%", provenance_id="appeal_2022_gap"),
    ]

    targets: List[Target] = []
    for i, r in enumerate(rows):
        targets.append(Target(
            id=f"deconf-{r['district']}",
            name=f"{r['district']} ({r['status']})",
            admin_unit=r["district"],
            rank=i + 1,
            score=r["exposed_u5"],
            lat=r["lat"], lng=r["lng"],
            metrics=[
                Metric(id="exposed_u5", label="Children under-5 exposed", value=r["exposed_u5"],
                       unit="children", provenance_id="need_worldpop_u5"),
                Metric(id="coverage", label="HRP coverage tier", value=r["coverage_score"],
                       provenance_id="coverage_hrp_2022"),
                Metric(id="vulnerability", label="District vulnerability", value=r["vulnerability"],
                       provenance_id="need_vulnerability_mics"),
                Metric(id="appeal_gap", label="2022 appeal funded", value="23.5%",
                       provenance_id="appeal_2022_gap"),
            ],
        ))

    map_layer = MapLayer(
        id="deconfliction-gap",
        kind="points",
        data=[{"district": r["district"], "lat": r["lat"], "lng": r["lng"],
               "gap": r["exposed_u5"], "status": r["status"]} for r in rows if r["lat"] is not None],
        color_by="status",
        legend={"title": "Coverage gap",
                "stops": [["covered", "#2c7fb8"], ["under-served", "#d7191c"]]},
    )

    evidence = [Provenance(**PROVENANCE[k]) for k in
                ("coverage_hrp_2022", "need_worldpop_u5", "need_vulnerability_mics", "appeal_2022_gap")]

    caveats = [
        "Coverage = HRP geographic prioritisation tier, not per-organisation 4W counts.",
        "Exposure = GloFAS modelled flood risk; cf. the UNOSAT observed flood polygon on the map.",
        "≈8.2M modelled in-need; cf. ~7.2M reported affected (NAWG).",
    ]

    return ProtocolResult(
        protocol_id="deconfliction",
        headline=headline,
        summary_metrics=summary_metrics,
        targets=targets,
        map_layer=map_layer,
        evidence=evidence,
        caveats=caveats,
    )
