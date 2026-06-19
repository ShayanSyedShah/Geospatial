// BEACON types — Sirajganj flood "what-if" decision tool.

export interface ZoneImpact {
  name: string;
  childrenU5: number;
  schools: number;
  clinics: number;
  meanDepth: number;
}

export interface LevelImpact {
  waterElev: number;
  total: { childrenU5: number; schools: number; clinics: number; maxDepth: number };
  zones: ZoneImpact[];
}

export interface Impact {
  levels: number[];
  normal: number;
  danger: number;
  byLevel: Record<string, LevelImpact>;
}

export interface UnicefStat {
  indicator: string;
  country: string;
  value: number;
  year: number;
  ci_low: number | null;
  ci_high: number | null;
  source: string;
  url: string;
}

// a ranked zone (computed client-side from LevelImpact.zones)
export interface RankedZone extends ZoneImpact {
  score: number;
  rank: number;
  // % contribution of each factor to the score (for the "why #1" explanation)
  contrib: { children: number; flood: number; access: number };
  nearestClinicKm: number;
}

export interface Weights {
  children: number;
  flood: number;
  access: number;
}

// what a click selects for the evidence popup
export interface Selection {
  kind: 'zone' | 'school' | 'clinic';
  name: string;
  lng: number;
  lat: number;
  props: Record<string, string | number>;
}
