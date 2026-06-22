"""UN System Data Commons — the headliner source for Challenge 1.

Live, keyless calls to the hackathon Data Commons API (UNStats/OpenSourceWeek2026):
  POST {BASE}/v2/resolve       name/ISO -> DCID
  POST {BASE}/v2/observation   DCID + variable -> value (with provenance)

This is THE platform the challenge is named after. Real data, real source chain.
"""
from __future__ import annotations
import json
import os
import urllib.request

BASE = os.environ.get(
    "DATACOMMONS_BASE",
    "https://dc-un-dev-dc-datacommons-service-72utkhfqvq-uc.a.run.app/core/api",
).rstrip("/")

# Variables to pull for a country (dcid -> friendly label). Count_Person is proven.
VARIABLES = {
    "Count_Person": "Total population",
    "Count_Person_Upto4Years": "Children under 5",
    "Count_Person_5To17Years": "Children 5–17",
}


def _post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "accept": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def resolve(name: str) -> str | None:
    """Resolve a place name to a Data Commons DCID (e.g. 'Bangladesh' -> 'country/BGD')."""
    d = _post("/v2/resolve", {"nodes": [name], "property": "<-description->dcid"})
    cands = (d.get("entities") or [{}])[0].get("candidates") or []
    return cands[0]["dcid"] if cands else None


def observe(entity_dcid: str, variables: dict = VARIABLES) -> dict:
    """Latest observation per variable for one entity, with source provenance."""
    d = _post("/v2/observation", {
        "select": ["date", "variable", "entity", "value"],
        "entity": {"dcids": [entity_dcid]},
        "variable": {"dcids": list(variables)},
        "date": "LATEST",
    })
    by_var = d.get("byVariable", {})
    facets = d.get("facets", {})
    out = {}
    for var, label in variables.items():
        ent = by_var.get(var, {}).get("byEntity", {}).get(entity_dcid, {})
        ofs = ent.get("orderedFacets") or []
        if not ofs:
            continue
        obs = (ofs[0].get("observations") or [{}])[0]
        fac = facets.get(str(ofs[0].get("facetId")), {})
        out[var] = {
            "label": label, "value": obs.get("value"), "date": obs.get("date"),
            "source": fac.get("importName"), "provenance": fac.get("provenanceUrl"),
        }
    return out


def fetch_country(name: str = "Bangladesh") -> dict:
    dcid = resolve(name) or "country/BGD"
    return {
        "country": name, "dcid": dcid, "api_base": BASE,
        "source": "UN System Data Commons (/v2/observation)",
        "indicators": observe(dcid),
    }


if __name__ == "__main__":
    prof = fetch_country()
    here = os.path.dirname(os.path.abspath(__file__))
    for p in [os.path.join(here, "..", "data", "datacommons_bangladesh.json"),
              os.path.join(here, "..", "..", "frontend", "public", "data", "sylhet_2022", "datacommons_bangladesh.json")]:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(prof, open(p, "w", encoding="utf-8"), indent=2)
    print(json.dumps(prof, indent=2))
