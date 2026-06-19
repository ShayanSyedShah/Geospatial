"""BEACON backend — slim. Serves the cited action-report PDF. The flood/impact
data is a static client-side bundle (frontend/public/beacon), so the app is
offline-capable and the backend is only needed for the report."""
from __future__ import annotations

from datetime import datetime, timezone

import csv
import io

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

from .beacon_report import build_report
from .glofas import get_forecast

app = FastAPI(title="BEACON API", version="2.0.0",
              description="Cited flood action report for Sirajganj.")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "beacon", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/api/report")
async def report(payload: dict):
    pdf = await run_in_threadpool(build_report, payload)
    headers = {"Content-Disposition": 'attachment; filename="beacon_sirajganj.pdf"'}
    return StreamingResponse(iter([pdf]), media_type="application/pdf", headers=headers)


@app.get("/api/glofas")
async def glofas():
    """Live GloFAS v4 river-discharge forecast for the Jamuna at Sirajganj."""
    return await run_in_threadpool(get_forecast)


@app.post("/api/geosight-export")
async def geosight_export(payload: dict):
    """Export BEACON results as a GeoSight-compatible indicator data layer
    (long format: geography code, indicator shortcode, date, value). Upload to a
    GeoSight project and bind the geography column to GeoRepo Sirajganj ADM3."""
    zones = payload.get("zones", [])
    when = payload.get("date", "")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["geography_name", "indicator_shortcode", "date", "value"])
    for z in zones:
        name = z.get("name", "")
        w.writerow([name, "beacon_children_at_risk", when, int(z.get("childrenU5", 0))])
        w.writerow([name, "beacon_priority_rank", when, int(z.get("rank", 0))])
        w.writerow([name, "beacon_schools_flooded", when, int(z.get("schools", 0))])
        w.writerow([name, "beacon_clinics_flooded", when, int(z.get("clinics", 0))])
    headers = {"Content-Disposition": 'attachment; filename="beacon_geosight_indicators.csv"'}
    return PlainTextResponse(buf.getvalue(), media_type="text/csv", headers=headers)
