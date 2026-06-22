"""UN / UNICEF data via the GeoSight REST API — the real "Commons" substrate for
Challenge 1 (GeoAI & Geospatial Evidence).

GeoSight is UNICEF's open-source geospatial platform (the challenge's own platform).
Its API is public, no auth. We pull the Children's Climate Risk Index (CCRI v2)
indicator set for Bangladesh and expose it with full provenance so the evidence
chain reads: UNICEF GeoSight indicator -> value -> our map -> decision.

Endpoints used (exactly what the organizers' t4sg MCP server calls):
  GET {BASE}/api/v1/indicators/            -> list indicators
  GET {BASE}/api/v1/indicators/{id}/data/  -> values per geography
"""
from __future__ import annotations
import json
import os
import urllib.request
import urllib.parse

# Staging carries the CCRI v2 child-risk indicators; prod has 2,100+ others.
BASE = os.environ.get("GEOSIGHT_BASE_URL", "https://staging-geosight.unitst.org").rstrip("/")

# The CCRI v2 child-climate-risk set (the theme the last UN Tech Over winner used).
CCRI_INDICATORS = {
    380: "ccri_rank",          # overall Children's Climate Risk Index rank
    389: "child_survival",     # ccri_v2_p2_sur
    383: "nutrition",          # ccri_v2_p2_nut
    385: "wash",               # ccri_v2_p2_wash
    387: "poverty",            # ccri_v2_p2_pov
    388: "protection",         # ccri_v2_p2_pro
    386: "education",          # ccri_v2_p2_edu
}
COUNTRY = "Bangladesh"


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"accept": "application/json",
                                               "User-Agent": "BEACON-geosight/1.0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def fetch_indicator_rows(indicator_id: int, page_size: int = 400) -> list[dict]:
    """All data rows for one indicator (paginated)."""
    rows, page = [], 1
    while True:
        url = f"{BASE}/api/v1/indicators/{indicator_id}/data/?" + urllib.parse.urlencode(
            {"page": page, "page_size": page_size})
        d = _get(url)
        rows.extend(d.get("results", []))
        if not d.get("next"):
            break
        page += 1
        if page > 20:
            break
    return rows


def fetch_country_profile(country: str = COUNTRY) -> dict:
    """Pull every CCRI indicator and keep the country's value, with provenance."""
    profile = {"country": country, "source": "UNICEF GeoSight (CCRI v2)",
               "api_base": BASE, "indicators": {}}
    for ind_id, key in CCRI_INDICATORS.items():
        try:
            rows = fetch_indicator_rows(ind_id)
        except Exception as e:  # network/endpoint hiccup — record and continue
            profile["indicators"][key] = {"error": str(e), "indicator_id": ind_id}
            continue
        match = next((r for r in rows
                      if (r.get("country_name") or r.get("entity_name") or "").lower() == country.lower()), None)
        if match:
            profile["indicators"][key] = {
                "value": match.get("value"),
                "indicator_id": ind_id,
                "shortcode": match.get("indicator_shortcode"),
                "name": match.get("indicator_name"),
                "geometry_code": match.get("geometry_code"),
                "date": match.get("date"),
                "admin_level": match.get("admin_level"),
                "source_query": f"{BASE}/api/v1/indicators/{ind_id}/data/",
            }
        else:
            profile["indicators"][key] = {"value": None, "indicator_id": ind_id,
                                          "note": f"{country} not found in {len(rows)} rows"}
    return profile


def list_indicators(query: str | None = None, page_size: int = 50) -> list[dict]:
    """Browse available GeoSight indicators (optionally filter by name substring)."""
    d = _get(f"{BASE}/api/v1/indicators/?page_size={page_size}")
    out = [{"id": r["id"], "shortcode": r["shortcode"], "name": r["name"],
            "category": r.get("category"), "source": r.get("source")} for r in d.get("results", [])]
    if query:
        q = query.lower()
        out = [r for r in out if q in (r["name"] or "").lower() or q in (r["shortcode"] or "").lower()]
    return out


if __name__ == "__main__":
    prof = fetch_country_profile()
    here = os.path.dirname(os.path.abspath(__file__))
    out_paths = [
        os.path.join(here, "..", "data", "geosight_ccri_bangladesh.json"),
        os.path.join(here, "..", "..", "frontend", "public", "data", "sylhet_2022", "geosight_ccri_bangladesh.json"),
    ]
    for p in out_paths:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(prof, f, indent=2)
    print(json.dumps(prof, indent=2))
