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
  reportUrl: () => `${(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')}/api/report`,
};

/** snap an arbitrary water level to the nearest precomputed level key */
export function nearestLevel(levels: number[], v: number): number {
  return levels.reduce((best, l) => (Math.abs(l - v) < Math.abs(best - v) ? l : best), levels[0]);
}
