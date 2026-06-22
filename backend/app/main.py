"""FastAPI app: flood risk hexagons + evidence chain + decision brief."""
from __future__ import annotations

import math
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from . import config, connector, complaints, education, evidence as evidence_registry, supply
from .brief import build_brief
from .data_pipeline import DataPipeline
from .plan import build_plan
from .protocols import PROTOCOL_IDS, get_protocol
from .scenario import build_context
from .models import (
    BriefRequest, ComplaintsResponse, ConnectRequest, CountryResponse, EducationResponse,
    EvidenceResponse, FacilityCollection, FacilityResponse, HexagonCollection,
    HexagonResponse, PlanRequest, RegionResponse, StatsResponse, SupplyResponse,
)

pipeline: DataPipeline | None = None


def _pipeline() -> DataPipeline:
    """Return the loaded pipeline, loading it on first use if needed."""
    global pipeline
    if pipeline is None:
        pipeline = DataPipeline()
    return pipeline


@asynccontextmanager
async def lifespan(_: FastAPI):
    _pipeline()  # warm the cache at startup
    yield


app = FastAPI(title="Flood Risk Map API", version="1.0.0",
              description="Flood risk hexagons with a visible evidence chain.",
              lifespan=lifespan)

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


def _clean(v):
    """NaN/inf -> None so JSON is valid."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


@app.get("/health")
async def health():
    return {"status": "ok", "loaded": pipeline is not None,
            "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/countries", response_model=list[CountryResponse])
async def get_countries():
    return [
        CountryResponse(name=name, center=cfg["center"], zoom=cfg["zoom"],
                        default=(name == config.DEFAULT_COUNTRY))
        for name, cfg in config.COUNTRIES.items()
    ]


@app.get("/api/hexagons", response_model=HexagonCollection)
async def get_hexagons(
    country: str = Query(config.DEFAULT_COUNTRY),
    district: Optional[str] = Query(None),
):
    p = _pipeline()
    sub = p.hexagons(country, district)
    hexagons = [
        HexagonResponse(
            h3_id=r.h3_id, lat=r.lat, lng=r.lng,
            flood_risk_4h=round(float(r.flood_risk_4h), 4),
            flood_risk_20h=round(float(r.flood_risk_20h), 4),
            flood_risk_7d=round(float(r.flood_risk_7d), 4),
            population_u5=int(r.population_u5),
            nearby_clinics=int(r.nearby_clinics),
            nearby_schools=int(r.nearby_schools),
            nearest_clinic_m=_clean(float(r.nearest_clinic_m)),
            district=str(r.district),
            uncertainty=float(r.uncertainty),
        )
        for r in sub.itertuples(index=False)
    ]
    return HexagonCollection(country=country, district=district,
                             count=len(hexagons), hexagons=hexagons)


@app.get("/api/regions", response_model=list[RegionResponse])
async def get_regions(country: str = Query(config.DEFAULT_COUNTRY)):
    return [RegionResponse(**r) for r in _pipeline().regions(country)]


@app.get("/api/flood-meta")
async def get_flood_meta(country: str = Query(config.DEFAULT_COUNTRY)):
    import json
    meta = json.loads((config.DATA_DIR / "flood_meta.json").read_text())
    if country not in meta:
        raise HTTPException(404, f"No flood overlay for {country}")
    return meta[country]


@app.get("/api/flood-image")
async def get_flood_image(
    country: str = Query(config.DEFAULT_COUNTRY),
    tier: str = Query("7d", pattern="^(4h|20h|7d)$"),
):
    path = config.DATA_DIR / f"flood_{country}_{tier}.png"
    if not path.exists():
        raise HTTPException(404, "overlay not found")
    return FileResponse(path, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/facilities", response_model=FacilityCollection)
async def get_facilities(
    country: str = Query(config.DEFAULT_COUNTRY),
    district: Optional[str] = Query(None),
):
    sub = _pipeline().facilities_for(country, district)
    facilities = [
        FacilityResponse(
            id=str(r.id), name=str(r.name), type=str(r.type),
            lat=float(r.lat), lng=float(r.lng), risk=float(r.risk),
            at_risk=bool(r.at_risk), district=str(r.district),
        )
        for r in sub.itertuples(index=False)
    ]
    return FacilityCollection(country=country, count=len(facilities),
                              at_risk=int(sub["at_risk"].sum()), facilities=facilities)


@app.get("/api/evidence/{id}")
async def get_evidence(id: str):
    """Resolve an id to its evidence.

    Tries the curated provenance registry first (protocol metrics link here),
    then falls back to the per-hexagon evidence chain (h3_id) so existing
    callers keep working.
    """
    prov = evidence_registry.get_evidence(id)
    if prov is not None:
        return prov
    h3_id = id
    p = _pipeline()
    cell = p.cell(h3_id)
    if cell is None:
        raise HTTPException(404, f"No evidence for '{id}' (unknown provenance id or hexagon)")
    return EvidenceResponse(
        h3_id=h3_id,
        risk={
            "flood_risk_4h": round(float(cell["flood_risk_4h"]), 4),
            "flood_risk_20h": round(float(cell["flood_risk_20h"]), 4),
            "flood_risk_7d": round(float(cell["flood_risk_7d"]), 4),
            "flood_depth_max_m": round(float(cell["flood_depth_max_m"]), 2),
            "population_u5": int(cell["population_u5"]),
            "nearby_clinics": int(cell["nearby_clinics"]),
            "nearby_schools": int(cell["nearby_schools"]),
            "nearest_clinic_m": _clean(float(cell["nearest_clinic_m"])),
        },
        flood_forecast={
            "source": "GloFAS / JRC Global Flood Hazard (Copernicus EMS)",
            "model": "LISFLOOD hydrological model, return-period water-depth maps",
            "lead_time": "Return-period hazard tiers (rp10 / rp100 / rp500)",
            "update_frequency": "GloFAS forecast updated daily; hazard maps periodic",
            "validation": "28-year validated GloFAS lineage; depth in metres",
            "url": "https://data.jrc.ec.europa.eu/collection/id-0054",
            "uncertainty": 0.15,
        },
        population={
            "source": "WorldPop 2020 age/sex structures",
            "resolution": "100 m grid",
            "age_stratified": True,
            "method": "Under-5 = sum of female/male ages 0 and 1-4",
            "validation": "Calibrated against national census",
            "url": "https://www.worldpop.org",
            "uncertainty": 0.08,
        },
        infrastructure={
            "schools": {"source": "Giga (ITU/UNICEF) + OpenStreetMap",
                        "update_frequency": "Monthly", "url": "https://giga.global"},
            "clinics": {"source": "Healthsites.io / OpenStreetMap",
                        "update_frequency": "Continuous", "url": "https://healthsites.io"},
        },
        overall_uncertainty=config.OVERALL_UNCERTAINTY,
        decision_threshold=config.DECISION_THRESHOLD,
        decision_rule=f"If risk > {int(config.DECISION_THRESHOLD*100)}%, prioritise evacuation / pre-positioning.",
    )


@app.get("/api/scenario/sylhet2022/context")
async def get_scenario_context():
    """The Sylhet 2022 decision-sandbox context.

    The full cell/access arrays are large, so we return a summary + districts +
    vulnerability + counts. Protocols consume the full context server-side.
    """
    ctx = await run_in_threadpool(build_context)
    return {
        "id": ctx.id,
        "counts": {
            "cells": len(ctx.cells),
            "facilities": len(ctx.facilities),
            "districts": len(ctx.districts),
        },
        "flood_extent": ctx.flood_extent,
        "districts": ctx.districts,
        "vulnerability": ctx.vulnerability,
        "vulnerability_meta": ctx.vulnerability_meta,
        "coverage": ctx.coverage,
    }


@app.get("/api/protocol/{id}")
async def get_protocol_result(id: str):
    """Run a response protocol against the Sylhet 2022 scenario."""
    if id not in PROTOCOL_IDS:
        raise HTTPException(404, f"Unknown protocol '{id}'. Available: {PROTOCOL_IDS}")
    ctx = await run_in_threadpool(build_context)
    try:
        build = get_protocol(id)
    except (ImportError, AttributeError) as e:
        raise HTTPException(503, f"Protocol '{id}' not available: {e}")
    result = await run_in_threadpool(build, ctx)
    return result


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats(country: str = Query(config.DEFAULT_COUNTRY)):
    return StatsResponse(**_pipeline().stats(country))


@app.get("/api/supply", response_model=SupplyResponse)
async def get_supply(
    country: str = Query(config.DEFAULT_COUNTRY),
    district: Optional[str] = Query(None),
):
    return SupplyResponse(**supply.build_supply(_pipeline().df, country, district))


@app.get("/api/complaints", response_model=ComplaintsResponse)
async def get_complaints(country: str = Query(config.DEFAULT_COUNTRY)):
    return ComplaintsResponse(**complaints.build_complaints(_pipeline().df, country))


@app.get("/api/education", response_model=EducationResponse)
async def get_education(
    country: str = Query(config.DEFAULT_COUNTRY),
    district: Optional[str] = Query(None),
):
    p = _pipeline()
    return EducationResponse(**education.build_education(p.df, p.facilities, country, district))


@app.post("/api/plan")
async def post_plan(req: PlanRequest):
    p = _pipeline()
    md = await run_in_threadpool(build_plan, p.df, req.country, req.district,
                                 req.intensity, req.depth_m)
    return {"country": req.country, "district": req.district, "markdown": md}


@app.post("/api/connect")
async def post_connect(req: ConnectRequest):
    """Auto-map a messy file's columns to UN variables and resolve its place
    names to canonical district ids — the on-ramp to the UN data graph."""
    return connector.connect(req.columns, req.samples, req.places, req.country)


@app.post("/api/brief")
async def post_brief(req: BriefRequest):
    p = _pipeline()
    cell = p.cell(req.h3_id)
    if cell is None:
        raise HTTPException(404, f"Hexagon {req.h3_id} not found")
    pdf = await run_in_threadpool(build_brief, cell, req.time_horizon)
    headers = {"Content-Disposition": f'attachment; filename="flood_brief_{req.h3_id}.pdf"'}
    return StreamingResponse(iter([pdf]), media_type="application/pdf", headers=headers)
