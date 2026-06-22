export type TimeHorizon = '4h' | '20h' | '7d';

export interface Hexagon {
  h3_id: string;
  lat: number;
  lng: number;
  flood_risk_4h: number;
  flood_risk_20h: number;
  flood_risk_7d: number;
  population_u5: number;
  nearby_clinics: number;
  nearby_schools: number;
  nearest_clinic_m: number | null;
  district: string;
  uncertainty: number;
}

export interface HexagonCollection {
  country: string;
  district: string | null;
  count: number;
  hexagons: Hexagon[];
}

export interface Region {
  district: string;
  hexagons: number;
  children_at_risk: number;
  max_risk: number;
  avg_risk: number;
  high_risk_hexagons: number;
  lat: number;
  lng: number;
}

export interface Country {
  name: string;
  center: [number, number];
  zoom: number;
  default: boolean;
}

export interface Facility {
  id: string;
  name: string;
  type: 'school' | 'clinic';
  lat: number;
  lng: number;
  risk: number;
  at_risk: boolean;
  district: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
  label?: string;
}

export interface EvacRoute {
  to: Facility;
  distanceM: number;
  durationS: number;
  path: [number, number][]; // [lng, lat]
  mode: 'road' | 'direct';
  bearing: number;
}

export interface Stats {
  country: string;
  total_hexagons: number;
  children_at_risk: number;
  avg_flood_risk: number;
  high_risk_hexagons: number;
}

export interface SupplyData {
  country: string;
  district: string | null;
  items: { id: string; name: string; unit: string; stock: number }[];
  districts: {
    district: string; children_exposed: number; max_risk: number;
    demand: number; allocated: number; coverage_pct: number;
    distance_km: number; eta_h: number; reachable: boolean;
  }[];
  routes: { depot: string; district: string; distance_km: number; eta_h: number; status: 'open' | 'cut' }[];
  efficiency: { naive: number; optimized: number; coverage_pct: number; unmet: number };
}

export interface Complaint {
  id: string;
  source: 'community' | 'field';
  text: string;
  district: string;
  lat: number;
  lng: number;
  severity: 'urgent' | 'high' | 'med';
  status: 'reported' | 'in_progress' | 'resolved';
  category: string;
  age_h: number;
}

export interface ComplaintsData {
  country: string;
  complaints: Complaint[];
}

export interface EducationData {
  country: string;
  district: string | null;
  schools_total: number;
  schools_hit: number;
  children_out: number;
  learning_centers: number;
  recovery: { week: number; label: string; reopened_pct: number }[];
  curriculum: { id: string; name: string; desc: string }[];
}

export interface ConnectColumn {
  column: string;
  mapped_to: string | null;
  label: string | null;
  confidence: number;
  status: 'auto' | 'review';
}

export interface ConnectPlace {
  input: string;
  resolved: string;
  pcode: string | null;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'unresolved';
  country: string;
}

export interface ConnectResult {
  country: string;
  columns: ConnectColumn[];
  places: ConnectPlace[];
  summary: {
    columns_total: number;
    columns_auto_mapped: number;
    places_total: number;
    places_resolved: number;
    ready_to_join: boolean;
  };
}

// ---------- BEACON decision-sandbox contract (mirrors backend models.py) ----------

export interface Provenance {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  source: string;
  publisher: string;
  dcid: string;
  date: string;
  url: string;
  method: string;
  caveat: string;
}

export interface Metric {
  id: string;
  label: string;
  value: number | string;
  unit: string;
  provenance_id: string;
}

export interface Target {
  id: string;
  name: string;
  admin_unit: string;
  rank: number;
  score: number;
  metrics: Metric[];
  lat: number;
  lng: number;
}

export interface MapLayer {
  id: string;
  kind: 'choropleth' | 'points' | 'path';
  data: unknown;
  color_by: string | null;
  legend: unknown;
}

export interface ProtocolResult {
  protocol_id: string;
  headline: string;
  summary_metrics: Metric[];
  targets: Target[];
  map_layer: MapLayer | null;
  evidence: Provenance[];
  caveats: string[];
}

export interface ScenarioContext {
  id: string;
  cells: unknown;
  facilities: unknown;
  districts: unknown;
  flood_extent: unknown;
  vulnerability: Record<string, unknown>;
  access_difficulty: Record<string, unknown>;
  coverage: Record<string, unknown> | null;
}

export interface Evidence {
  h3_id: string;
  risk: Record<string, number | null>;
  flood_forecast: Record<string, unknown>;
  population: Record<string, unknown>;
  infrastructure: { schools: Record<string, string>; clinics: Record<string, string> };
  overall_uncertainty: number;
  decision_threshold: number;
  decision_rule: string;
}
