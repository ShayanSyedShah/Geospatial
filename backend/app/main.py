"""BEACON backend — slim. Serves the cited action-report PDF. The flood/impact
data is a static client-side bundle (frontend/public/beacon), so the app is
offline-capable and the backend is only needed for the report."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .beacon_report import build_report

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
