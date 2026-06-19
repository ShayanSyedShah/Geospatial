// Loads the static BEACON bundle (works offline once cached).
import type { Impact, UnicefStat } from '../types';
import type { FeatureCollection, Feature } from 'geojson';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const B = `${BASE}/beacon`;

async function j<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json() as Promise<T>;
}

export const beacon = {
  impact: () => j<Impact>(`${B}/impact.json`),
  unicef: () => j<UnicefStat>(`${B}/unicef.json`),
  zones: () => j<FeatureCollection>(`${B}/zones.geojson`),
  facilities: () => j<FeatureCollection>(`${B}/facilities.geojson`),
  buildings: () => j<FeatureCollection>(`${B}/buildings.geojson`),
  inundation: (levelM: number) => j<Feature>(`${B}/inundation/level_${Math.round(levelM * 100)}.geojson`),
  glofas: () => j<GlofasForecast>(`${API}/api/glofas`),
  ffwc: () => j<{ stations: { name: string; danger: number; river: string }[]; source: string }>(`${API}/api/ffwc`),
  gdacs: () => j<{ active: boolean; alerts: { level: string; name: string }[]; source: string }>(`${API}/api/gdacs`),
  observed: () => j<Feature>(`${B}/observed.geojson`),
  observedMeta: () => j<{ date: string; source: string; note: string }>(`${B}/observed.json`),
  reportUrl: () => `${API}/api/report`,
  geosightExportUrl: () => `${API}/api/geosight-export`,
};

const API = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export interface GlofasForecast {
  station: string;
  unit: string;
  updated: string;
  current: number;
  iNow: number;
  series: { date: string; q: number; p25: number; p75: number }[];
  peak: { date: string; q: number };
  leadDays: number;
  trend: string;
  source: string;
  error?: string;
}

/** snap an arbitrary water level to the nearest precomputed level key */
export function nearestLevel(levels: number[], v: number): number {
  return levels.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best), levels[0]);
}
