"""FastAPI app: flood risk hexagons + evidence chain + decision brief."""
from __future__ import annotations

import math
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from . import config
from .brief import build_brief
from .data_pipeline import DataPipeline
from .models import (
    BriefRequest, CountryResponse, EvidenceResponse, FacilityCollection,
    FacilityResponse, HexagonCollection, HexagonResponse, RegionResponse, StatsResponse,
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


@app.get("/api/evidence/{h3_id}", response_model=EvidenceResponse)
async def get_evidence(h3_id: str):
    p = _pipeline()
    cell = p.cell(h3_id)
    if cell is None:
        raise HTTPException(404, f"Hexagon {h3_id} not found")
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


@app.get("/api/stats", response_model=StatsResponse)
async def get_stats(country: str = Query(config.DEFAULT_COUNTRY)):
    return StatsResponse(**_pipeline().stats(country))


@app.post("/api/brief")
async def post_brief(req: BriefRequest):
    p = _pipeline()
    cell = p.cell(req.h3_id)
    if cell is None:
        raise HTTPException(404, f"Hexagon {req.h3_id} not found")
    pdf = await run_in_threadpool(build_brief, cell, req.time_horizon)
    headers = {"Content-Disposition": f'attachment; filename="flood_brief_{req.h3_id}.pdf"'}
    return StreamingResponse(iter([pdf]), media_type="application/pdf", headers=headers)
