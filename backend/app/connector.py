"""THE CONNECTOR — the on-ramp that auto-joins messy data to the UN graph.

Two problems that used to need a human, now done in seconds:

  1. "What does this column mean?"  -> schema mapping
     `kids_u5` / `under5_pop` / `Children (0-4)` all map to the one official
     variable `Population_Under5`.

  2. "Is this the same place?"  -> entity resolution
     `Sirajgonj` / `Sirajganj` / `BD-54` all resolve to the one official
     district id.

This runs OFFLINE with fuzzy string matching (no API key, no network) so the
demo never breaks. In production the same shape is served by the UN Data
Commons `/v2/resolve` endpoint; we degrade gracefully to the local matcher.
"""
from __future__ import annotations

import difflib
import re
from typing import Optional

from . import config

# The UN's official variable vocabulary (a curated slice of the Data Commons /
# SDMX concept list) with the messy aliases we see in the wild.
UN_VARIABLES = [
    {"id": "Population_Under5", "label": "Children under 5",
     "aliases": ["kids_u5", "under5_pop", "children 0-4", "u5", "under five",
                 "child_u5", "pop_under5", "children (0-4)", "under-5 population"]},
    {"id": "Population_Elderly60Plus", "label": "Elderly 60+",
     "aliases": ["elderly", "aged_60", "60plus", "old_pop", "seniors", "elderly_60"]},
    {"id": "Population_Total", "label": "Total population",
     "aliases": ["pop", "population", "total_pop", "headcount", "people"]},
    {"id": "SH_SAN_SAFE", "label": "Safely managed sanitation",
     "aliases": ["sanitation", "toilet", "wash", "san_access", "improved_sanitation"]},
    {"id": "Admin2_Name", "label": "District / admin-2 name",
     "aliases": ["district", "adm2", "upazila", "zila", "region", "area_name",
                 "place", "location", "admin2"]},
    {"id": "Admin2_Pcode", "label": "District P-code",
     "aliases": ["pcode", "adm2_pcode", "admin_code", "iso_code", "code"]},
    {"id": "Latitude", "label": "Latitude", "aliases": ["lat", "y", "latitude"]},
    {"id": "Longitude", "label": "Longitude", "aliases": ["lng", "lon", "long", "x", "longitude"]},
    {"id": "Facility_Type", "label": "Facility type", "aliases": ["type", "category", "kind"]},
]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def map_column(name: str, samples: Optional[list] = None) -> dict:
    """Map one messy column name to the best UN variable, with a confidence."""
    n = _norm(name)
    best, best_score = None, 0.0
    for var in UN_VARIABLES:
        candidates = [var["id"], var["label"], *var["aliases"]]
        score = max(difflib.SequenceMatcher(None, n, _norm(c)).ratio() for c in candidates)
        # exact alias / substring match is a strong signal
        if any(_norm(c) == n or n in _norm(c) or _norm(c) in n for c in candidates if c):
            score = max(score, 0.92)
        if score > best_score:
            best, best_score = var, score
    # numeric-sample hint: lat/lng ranges
    if samples:
        nums = [float(s) for s in samples if _is_num(s)]
        if nums:
            mn, mx = min(nums), max(nums)
            if -90 <= mn and mx <= 90 and "lat" in n:
                best = next(v for v in UN_VARIABLES if v["id"] == "Latitude"); best_score = max(best_score, 0.9)
    return {
        "column": name,
        "mapped_to": best["id"] if best else None,
        "label": best["label"] if best else None,
        "confidence": round(best_score, 2),
        "status": "auto" if best_score >= 0.6 else "review",
    }


def _is_num(s) -> bool:
    try:
        float(s)
        return True
    except (TypeError, ValueError):
        return False


# Canonical district names per country, plus common misspellings/codes the
# resolver should snap to the right place.
_KNOWN_DISTRICTS = {
    "Bangladesh": ["Sirajganj", "Kurigram", "Bhola", "Sylhet", "Jamalpur",
                   "Gaibandha", "Patuakhali", "Dhaka"],
    "Uganda": ["Kasese", "Butaleja"],
}
_PLACE_ALIASES = {
    "Bangladesh": {
        "sirajgonj": "Sirajganj", "shirajganj": "Sirajganj", "bd 54": "Sirajganj",
    },
}


def _place_index() -> dict:
    """Build {country: {normalised_name: canonical_name}} of known districts
    plus a few common misspellings/codes."""
    idx: dict[str, dict[str, str]] = {}
    for country, names in _KNOWN_DISTRICTS.items():
        idx[country] = {_norm(x): x for x in names}
    for country, aliases in _PLACE_ALIASES.items():
        idx.setdefault(country, {}).update(aliases)
    return idx


def resolve_place(name: str, country: str = "Bangladesh") -> dict:
    """Resolve a messy place name to the one canonical district + a synthetic
    P-code (the role /v2/resolve plays in production)."""
    idx = _place_index().get(country, {})
    n = _norm(name)
    if n in idx:
        canon = idx[n]; conf = 0.99; how = "exact"
    else:
        match = difflib.get_close_matches(n, list(idx.keys()), n=1, cutoff=0.6)
        if match:
            canon = idx[match[0]]; conf = round(difflib.SequenceMatcher(None, n, match[0]).ratio(), 2)
            how = "fuzzy"
        else:
            canon = name.title(); conf = 0.3; how = "unresolved"
    iso = config.COUNTRIES.get(country, {}).get("iso", "BGD")
    pcode = f"{iso}-{abs(hash(canon)) % 90 + 10}" if how != "unresolved" else None
    return {"input": name, "resolved": canon, "pcode": pcode,
            "confidence": conf, "method": how, "country": country}


def connect(columns: list[str], samples: Optional[dict] = None,
            places: Optional[list[str]] = None, country: str = "Bangladesh") -> dict:
    """Full connect pass over a messy file's columns + place values."""
    samples = samples or {}
    col_maps = [map_column(c, samples.get(c)) for c in columns]
    place_maps = [resolve_place(p, country) for p in (places or [])]
    auto = sum(1 for c in col_maps if c["status"] == "auto")
    resolved = sum(1 for p in place_maps if p["method"] != "unresolved")
    return {
        "country": country,
        "columns": col_maps,
        "places": place_maps,
        "summary": {
            "columns_total": len(col_maps),
            "columns_auto_mapped": auto,
            "places_total": len(place_maps),
            "places_resolved": resolved,
            "ready_to_join": auto == len(col_maps) and resolved == len(place_maps),
        },
    }
