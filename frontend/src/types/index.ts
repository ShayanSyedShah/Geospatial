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
