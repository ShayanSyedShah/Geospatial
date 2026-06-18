"""Pydantic response schemas."""
from typing import Dict, Optional

from pydantic import BaseModel


class HexagonResponse(BaseModel):
    h3_id: str
    lat: float
    lng: float
    flood_risk: float
    population_u5: int
    nearby_clinics: int
    nearby_schools: int
    nearest_clinic_m: Optional[float] = None
    uncertainty: float


class HexagonCollection(BaseModel):
    country: str
    time_horizon: str
    count: int
    hexagons: list[HexagonResponse]


class EvidenceResponse(BaseModel):
    h3_id: str
    flood_forecast: Dict
    population: Dict
    infrastructure: Dict
    overall_uncertainty: float
    decision_threshold: float
    decision_rule: str
    risk: Dict


class StatsResponse(BaseModel):
    country: str
    total_hexagons: int
    children_at_risk: int
    avg_flood_risk: float
    high_risk_hexagons: int


class BriefRequest(BaseModel):
    h3_id: str
    time_horizon: str = "20h"
