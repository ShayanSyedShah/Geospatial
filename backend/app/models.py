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


class FacilityResponse(BaseModel):
    id: str
    name: str
    type: str
    lat: float
    lng: float
    risk: float
    at_risk: bool
    district: str


class FacilityCollection(BaseModel):
    country: str
    count: int
    at_risk: int
    facilities: List[FacilityResponse]


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


# ---- Make Plan ------------------------------------------------------------
class PlanRequest(BaseModel):
    country: str = "Bangladesh"
    district: Optional[str] = None
    intensity: float = 1.0
    depth_m: float = 1.8


# ---- Connector ------------------------------------------------------------
class ConnectRequest(BaseModel):
    columns: List[str]
    samples: Optional[Dict[str, List]] = None
    places: Optional[List[str]] = None
    country: str = "Bangladesh"


# ---- Supply chain ---------------------------------------------------------
class SupplyResponse(BaseModel):
    country: str
    district: Optional[str] = None
    items: List[Dict]
    districts: List[Dict]
    routes: List[Dict]
    efficiency: Dict


# ---- Complaints -----------------------------------------------------------
class ComplaintsResponse(BaseModel):
    country: str
    complaints: List[Dict]


# ---- Education ------------------------------------------------------------
class EducationResponse(BaseModel):
    country: str
    district: Optional[str] = None
    schools_total: int
    schools_hit: int
    children_out: int
    learning_centers: int
    recovery: List[Dict]
    curriculum: List[Dict]
