export type TimeHorizon = '4h' | '20h' | '7d';

export interface Hexagon {
  h3_id: string;
  lat: number;
  lng: number;
  flood_risk: number;
  population_u5: number;
  nearby_clinics: number;
  nearby_schools: number;
  nearest_clinic_m: number | null;
  uncertainty: number;
}

export interface HexagonCollection {
  country: string;
  time_horizon: TimeHorizon;
  count: number;
  hexagons: Hexagon[];
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
