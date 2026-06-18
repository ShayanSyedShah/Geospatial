"""Pydantic response schemas."""
from typing import Dict, List, Optional

from pydantic import BaseModel


class HexagonResponse(BaseModel):
    h3_id: str
    lat: float
    lng: float
    # all three tiers so the client can animate the timeline without refetching
    flood_risk_4h: float
    flood_risk_20h: float
    flood_risk_7d: float
    population_u5: int
    nearby_clinics: int
    nearby_schools: int
    nearest_clinic_m: Optional[float] = None
    district: str
    uncertainty: float


class HexagonCollection(BaseModel):
    country: str
    district: Optional[str] = None
    count: int
    hexagons: List[HexagonResponse]


class RegionResponse(BaseModel):
    district: str
    hexagons: int
    children_at_risk: int
    max_risk: float
    avg_risk: float
    high_risk_hexagons: int
    lat: float
    lng: float


class CountryResponse(BaseModel):
    name: str
    center: List[float]
    zoom: float
    default: bool


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
    time_horizon: str = "7d"
