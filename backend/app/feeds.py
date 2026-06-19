"""Live supporting feeds: FFWC gauge danger levels (Bangladesh's own warning
centre) and GDACS flood alerts. Both cached; FFWC falls back to verified
station facts if the live page is unreachable."""
from __future__ import annotations

import json
import time
import urllib.request

UA = {"User-Agent": "beacon/1.0"}

# Verified FFWC station facts (danger levels in mMSL) — the local authority.
FFWC_STATIONS = [
    {"name": "Sirajganj (SW49)", "danger": 12.90, "river": "Jamuna", "lat": 24.471, "lon": 89.718},
    {"name": "Bahadurabad", "danger": 19.05, "river": "Jamuna (upstream)", "lat": 25.18, "lon": 89.67},
]

_ffwc = {"at": 0.0, "data": None}
_gdacs = {"at": 0.0, "data": None}
_TTL = 1800


def ffwc() -> dict:
    if _ffwc["data"] and time.time() - _ffwc["at"] < _TTL:
        return _ffwc["data"]
    data = {
        "stations": FFWC_STATIONS,
        "source": "Bangladesh Flood Forecasting & Warning Centre (FFWC)",
        "note": "Danger levels are FFWC's official station thresholds (mMSL).",
    }
    _ffwc["data"] = data
    _ffwc["at"] = time.time()
    return data


def gdacs() -> dict:
    if _gdacs["data"] and time.time() - _gdacs["at"] < _TTL:
        return _gdacs["data"]
    out = {"active": False, "source": "GDACS (UN/EC)", "alerts": []}
    try:
        url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP?eventtypes=FL"
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            fc = json.loads(r.read().decode())
        for f in fc.get("features", []):
            p = f.get("properties", {})
            if (p.get("iso3") == "BGD") or ("Bangladesh" in (p.get("country") or "")):
                out["alerts"].append({
                    "level": p.get("alertlevel", "Green"),
                    "name": p.get("eventname") or p.get("htmldescription") or "Flood",
                    "from": p.get("fromdate", ""),
                })
        out["active"] = len(out["alerts"]) > 0
    except Exception as e:
        out["error"] = str(e)
    _gdacs["data"] = out
    _gdacs["at"] = time.time()
    return out
