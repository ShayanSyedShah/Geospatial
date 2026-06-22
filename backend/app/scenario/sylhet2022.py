"""Sylhet 2022 scenario context — the world state every protocol runs against.

This is the *decision sandbox* payload: we replay the real June 2022 Sylhet
flood at peak extent and freeze the joined evidence layers a protocol needs.
Built ONCE (cached in module scope) from the real datasets via the existing
``DataPipeline``; protocols read it, they never re-query the rasters.

Layers attached
---------------
- ``cells``            : per-H3 rows (real GloFAS flood risk + WorldPop under-5 + facility access)
- ``facilities``       : real schools/clinics with at-risk flags
- ``districts``        : per-district aggregates (DataPipeline.regions)
- ``flood_extent``     : exposed-cell summary by flood tier (the replay's hazard footprint)
- ``vulnerability``    : per-district 0..1 from a real UN Data Commons indicator (cached offline)
- ``access_difficulty``: per-cell 0..1 documented proxy (see formula below)
- ``coverage``         : HRP-2022 geographic prioritisation tier per district (de-confliction)
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from .. import config
from ..data_pipeline import DataPipeline

# Scenario constants. Sylhet 2022 peaked mid-June; we run protocols at peak
# flood, so the 7-day (rp500-equivalent) tier is the hazard footprint.
SCENARIO_ID = "sylhet2022"
COUNTRY = "Bangladesh"
PEAK_TIER = "flood_risk_7d"

# Geographic scope of the 2022 Sylhet flood replay. The June 2022 flood hit the
# northeastern haor basin: the four Sylhet-division districts plus the adjacent
# haor districts that the story's "Haor basin fills" scene depicts. Without this
# clip the protocols would reason over ALL of Bangladesh (Dhaka's population would
# dominate every ranking) instead of the actual incident. District names match the
# ADM2 ``shapeName`` spellings used in the pipeline's hexagon/facility tables.
# Sources: UNOSAT/UNICEF 2022 Sylhet flood reporting; haor basin = Sylhet division
# (Sylhet, Sunamganj, Maulvibazar, Habiganj) + Netrakona & Kishoreganj.
SCENARIO_DISTRICTS = frozenset({
    "Sylhet", "Sunamganj", "Maulvibazar", "Habiganj", "Netrakona", "Kishoreganj",
})

# Access-difficulty proxy weights (documented; see access_difficulty()).
_W_DEPTH = 0.6        # flood depth dominates road severance
_W_CLINIC = 0.4       # remoteness from the nearest clinic
_DEPTH_NORM_M = 4.0   # depth (m) that saturates the proxy to 1.0 (matches config norm)
_CLINIC_NORM_M = 15000.0  # 15 km from a clinic saturates the remoteness term


class ScenarioContext(BaseModel):
    """Frozen, joined world state for one scenario run."""
    id: str
    cells: List[Dict[str, Any]]
    facilities: List[Dict[str, Any]]
    districts: List[Dict[str, Any]]
    flood_extent: Dict[str, Any]
    vulnerability: Dict[str, float]            # district -> 0..1 (Commons indicator)
    vulnerability_meta: Dict[str, Any]         # _meta block from commons cache (citation)
    access_difficulty: Dict[str, float]        # h3_id -> 0..1 (documented proxy)
    exposure_threshold: float                  # peak-risk cut for "exposed / in need"
    coverage: Optional[Dict[str, Any]] = None  # 3W presence — out of scope (None for now)


def _load_vulnerability() -> tuple[Dict[str, float], Dict[str, Any]]:
    """Read the cached UN Data Commons vulnerability indicator for BGD districts."""
    path = config.DATA_DIR / "commons_bgd.json"
    raw = json.loads(path.read_text())
    districts = {str(k): float(v) for k, v in raw.get("districts", {}).items()}
    meta = raw.get("_meta", {})
    return districts, meta

def _load_coverage() -> Optional[Dict[str, Any]]:
    """2022 response-coverage layer (HRP prioritisation) for de-confliction."""
    path = config.DATA_DIR / "coverage_bgd_2022.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())

def access_difficulty(depth_m: float, nearest_clinic_m: Optional[float]) -> float:
    """Per-cell access-difficulty proxy, normalised 0..1 (higher = harder to reach).

    There is no road / 3W access dataset, so we build a transparent proxy from
    two real columns already on each cell:

        depth_term  = min(flood_depth_max_m / 4.0, 1)     # deeper water cuts roads
        clinic_term = min(nearest_clinic_m / 15000, 1)    # farther from care = more remote
        difficulty  = 0.6 * depth_term + 0.4 * clinic_term

    Weights favour flood depth (the immediate cause of road severance) over
    baseline remoteness. Saturation at 4 m / 15 km keeps both terms in 0..1.
    This is a documented heuristic, NOT a measured travel time — see the
    "access_difficulty" caveat surfaced on protocols that use it.
    """
    depth_term = min(max(float(depth_m or 0.0), 0.0) / _DEPTH_NORM_M, 1.0)
    clinic = nearest_clinic_m if nearest_clinic_m is not None else _CLINIC_NORM_M
    clinic_term = min(max(float(clinic), 0.0) / _CLINIC_NORM_M, 1.0)
    return round(_W_DEPTH * depth_term + _W_CLINIC * clinic_term, 4)


def _build() -> ScenarioContext:
    pipeline = DataPipeline()

    # Peak-flood cells for Bangladesh (sorted worst-first by the pipeline),
    # CLIPPED to the 2022 Sylhet flood footprint (the affected haor districts).
    # This is what makes the run a Sylhet *incident* replay rather than a
    # national aggregate — see SCENARIO_DISTRICTS above.
    hex_all = pipeline.hexagons(COUNTRY)
    hex_df = hex_all[hex_all["district"].isin(SCENARIO_DISTRICTS)]
    cells: List[Dict[str, Any]] = []
    access: Dict[str, float] = {}
    for r in hex_df.itertuples(index=False):
        nearest = None if r.nearest_clinic_m != r.nearest_clinic_m else float(r.nearest_clinic_m)
        diff = access_difficulty(float(r.flood_depth_max_m), nearest)
        access[str(r.h3_id)] = diff
        cells.append({
            "h3_id": str(r.h3_id),
            "lat": float(r.lat),
            "lng": float(r.lng),
            "flood_risk": round(float(getattr(r, PEAK_TIER)), 4),
            "flood_risk_4h": round(float(r.flood_risk_4h), 4),
            "flood_risk_20h": round(float(r.flood_risk_20h), 4),
            "flood_risk_7d": round(float(r.flood_risk_7d), 4),
            "flood_depth_max_m": round(float(r.flood_depth_max_m), 2),
            "population_u5": int(r.population_u5),
            "nearby_schools": int(r.nearby_schools),
            "nearby_clinics": int(r.nearby_clinics),
            "nearest_clinic_m": nearest,
            "district": str(r.district),
            "access_difficulty": diff,
        })

    fac_df = pipeline.facilities_for(COUNTRY)
    fac_df = fac_df[fac_df["district"].isin(SCENARIO_DISTRICTS)]
    facilities = [
        {
            "id": str(f.id), "name": str(f.name), "type": str(f.type),
            "lat": float(f.lat), "lng": float(f.lng), "risk": float(f.risk),
            "at_risk": bool(f.at_risk), "district": str(f.district),
        }
        for f in fac_df.itertuples(index=False)
    ]

    districts = [d for d in pipeline.regions(COUNTRY)
                 if d.get("district") in SCENARIO_DISTRICTS]

    # "Exposed / in need" gate. The rp500 (7d) tier marks ~97% of cells, which
    # overstates the observed flood: it would imply more people in need than live
    # in the affected districts. We use the documented operational DECISION
    # THRESHOLD (config.DECISION_THRESHOLD = 0.6) as the in-need cut so the
    # footprint reflects genuinely high flood risk (~the real ~7M affected),
    # not the worst-case hazard envelope. Every protocol reads this same gate.
    exposure_threshold = config.DECISION_THRESHOLD

    # Flood extent = the replay's hazard footprint at the in-need gate.
    exposed = hex_df[hex_df[PEAK_TIER] > exposure_threshold]
    flood_extent = {
        "tier": PEAK_TIER,
        "threshold": exposure_threshold,
        "exposed_cells": int(len(exposed)),
        "total_cells": int(len(hex_df)),
        "children_exposed": int(exposed["population_u5"].sum()),
        "max_depth_m": round(float(hex_df["flood_depth_max_m"].max()), 2),
    }

    vulnerability_all, vuln_meta = _load_vulnerability()
    # Keep only the in-scenario districts (protocols index vulnerability by name).
    vulnerability = {d: v for d, v in vulnerability_all.items() if d in SCENARIO_DISTRICTS}

    # HRP-2022 prioritisation coverage layer (de-confliction reads coverage_score
    # per district). De-confliction derives need from the clipped `cells` above,
    # gated at exposure_threshold — it stays within the 6 SCENARIO_DISTRICTS.
    coverage = _load_coverage()

    return ScenarioContext(
        id=SCENARIO_ID,
        cells=cells,
        facilities=facilities,
        districts=districts,
        flood_extent=flood_extent,
        vulnerability=vulnerability,
        vulnerability_meta=vuln_meta,
        access_difficulty=access,
        exposure_threshold=exposure_threshold,
        coverage=coverage,  # HRP-2022 prioritisation coverage (de-confliction)
    )


_CONTEXT: Optional[ScenarioContext] = None


def build_context() -> ScenarioContext:
    """Return the Sylhet 2022 context, building it once and caching in module scope."""
    global _CONTEXT
    if _CONTEXT is None:
        _CONTEXT = _build()
    return _CONTEXT
