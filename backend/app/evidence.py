"""Curated provenance registry — the always-present sources.

This is a CURATED, STATIC citation map. We never call a live Data Commons API
at runtime; every entry is a verified citation (real DCID where one exists,
plus source / publisher / date / URL). Protocol modules contribute their own
provenance via ``protocols.all_provenance()``, which we merge on lookup.
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Dict, Optional

from . import config
from .protocols import all_provenance
from .protocols.base import Provenance


@lru_cache(maxsize=1)
def _commons_meta() -> dict:
    """Read the _meta citation block from the cached Commons vulnerability file."""
    try:
        raw = json.loads((config.DATA_DIR / "commons_bgd.json").read_text())
        return raw.get("_meta", {})
    except Exception:  # noqa: BLE001
        return {}


def _base_registry() -> Dict[str, dict]:
    """The four always-present sources behind every scenario number."""
    m = _commons_meta()
    return {
        # --- Flood hazard ------------------------------------------------
        "flood_glofas": {
            "id": "flood_glofas",
            "label": "Flood hazard (return-period water depth)",
            "value": None,
            "unit": "m",
            "source": "GloFAS / JRC Global Flood Hazard maps (Copernicus EMS)",
            "publisher": "European Commission Joint Research Centre (JRC)",
            "dcid": None,
            "date": "2023",
            "url": "https://data.jrc.ec.europa.eu/collection/id-0054",
            "method": ("LISFLOOD hydrological model; return-period depth tiers "
                       "(rp10 / rp100 / rp500) combined with WRI Aqueduct coastal "
                       "hazard as max depth per H3 cell."),
            "caveat": ("Return-period hazard maps, not a live nowcast; ~15% modelled "
                       "uncertainty. Used here to replay the 2022 Sylhet peak footprint."),
        },
        # --- Population --------------------------------------------------
        "pop_worldpop_u5": {
            "id": "pop_worldpop_u5",
            "label": "Children under 5 (population)",
            "value": None,
            "unit": "people",
            "source": "WorldPop 2020 age/sex-structured population grids",
            "publisher": "WorldPop, University of Southampton",
            "dcid": "Count_Person_Upto5Years",
            "date": "2020",
            "url": "https://www.worldpop.org",
            "method": ("Under-5 = sum of female + male ages 0 and 1-4 at 100 m "
                       "resolution, aggregated to H3 res-7 cells."),
            "caveat": "Modelled population (~8% uncertainty), calibrated to national census.",
        },
        # --- Facilities --------------------------------------------------
        "facilities_osm": {
            "id": "facilities_osm",
            "label": "Schools & health facilities",
            "value": None,
            "unit": "facilities",
            "source": "Giga (ITU/UNICEF) + Healthsites.io / OpenStreetMap",
            "publisher": "OpenStreetMap contributors; Healthsites.io; Giga",
            "dcid": None,
            "date": "2024",
            "url": "https://healthsites.io",
            "method": ("Point locations of schools and clinics; per-cell counts and "
                       "nearest-clinic distance computed in EPSG:3857."),
            "caveat": ("Community-maintained; coverage varies by district. School set "
                       "blends Giga and OSM."),
        },
        # --- Vulnerability (UN Data Commons indicator) -------------------
        "vulnerability_commons": {
            "id": "vulnerability_commons",
            "label": m.get("indicator", "District vulnerability indicator"),
            "value": None,
            "unit": "share (0..1)",
            "source": m.get("source", "UN Data Commons indicator (cached offline)"),
            "publisher": m.get("publisher", "UN Data Commons"),
            "dcid": m.get("dcid"),
            "date": m.get("date"),
            "url": m.get("url"),
            "method": m.get("method"),
            "caveat": m.get("caveat"),
        },
    }


def get_evidence(provenance_id: str) -> Optional[Provenance]:
    """Resolve a provenance_id to a Provenance, merging base + protocol registries.

    Protocol-contributed entries override base entries on id collision.
    Returns None if the id is unknown.
    """
    registry: Dict[str, dict] = {**_base_registry(), **all_provenance()}
    entry = registry.get(provenance_id)
    return Provenance(**entry) if entry else None
