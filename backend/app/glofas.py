"""Live GloFAS v4 river-discharge forecast for the Jamuna at Sirajganj.

Pulled from the Open-Meteo Flood API (serves GloFAS v4 as JSON, no key). This is
real, authoritative, daily-updated forecast data for the actual river cell.
"""
from __future__ import annotations

import json
import time
import urllib.request
from datetime import date

LAT, LON = 24.45, 89.70
URL = (f"https://flood-api.open-meteo.com/v1/flood?latitude={LAT}&longitude={LON}"
       "&daily=river_discharge,river_discharge_p25,river_discharge_p75"
       "&past_days=5&forecast_days=30")

_cache: dict = {"at": 0.0, "data": None}
_TTL = 1800  # 30 min


def _fetch() -> dict:
    req = urllib.request.Request(URL, headers={"User-Agent": "beacon/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.loads(r.read().decode())
    dd = d["daily"]
    times = dd["time"]
    q = dd["river_discharge"]
    p25 = dd.get("river_discharge_p25") or [None] * len(q)
    p75 = dd.get("river_discharge_p75") or [None] * len(q)
    today = date.today().isoformat()
    try:
        i_now = times.index(today)
    except ValueError:
        i_now = min(5, len(times) - 1)

    series = [{"date": times[i], "q": round(q[i] or 0),
               "p25": round(p25[i] or q[i] or 0), "p75": round(p75[i] or q[i] or 0)}
              for i in range(len(times))]
    fut = [(times[i], q[i]) for i in range(i_now, len(times)) if q[i] is not None]
    peak_date, peak_q = max(fut, key=lambda x: x[1]) if fut else (today, 0)
    lead = (date.fromisoformat(peak_date) - date.today()).days
    current = round(q[i_now] or 0)
    trend = "rising" if peak_q > current * 1.05 else "steady"

    return {
        "station": "Jamuna (Brahmaputra) at Sirajganj",
        "cell": [d.get("latitude"), d.get("longitude")],
        "unit": dd_unit(d),
        "updated": today,
        "current": current,
        "iNow": i_now,
        "series": series,
        "peak": {"date": peak_date, "q": round(peak_q)},
        "leadDays": lead,
        "trend": trend,
        "source": "GloFAS v4 (Copernicus EMS), via Open-Meteo Flood API",
    }


def dd_unit(d: dict) -> str:
    return d.get("daily_units", {}).get("river_discharge", "m³/s")


def get_forecast() -> dict:
    now = time.time()
    if _cache["data"] is None or now - _cache["at"] > _TTL:
        try:
            _cache["data"] = _fetch()
            _cache["at"] = now
        except Exception as e:
            if _cache["data"] is None:
                return {"error": str(e), "source": "GloFAS v4 (Copernicus EMS), via Open-Meteo"}
    return _cache["data"]
