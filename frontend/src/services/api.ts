import type {
  ComplaintsData, ConnectResult, Country, EducationData, Evidence, Facility,
  HexagonCollection, Region, Stats, SupplyData, TimeHorizon,
} from '../types';

interface FacilityCollection { country: string; count: number; at_risk: number; facilities: Facility[]; }

// In dev, Vite proxies /api -> localhost:8000. In prod, set VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  countries: () => get<Country[]>('/api/countries'),

  hexagons: (country: string, district?: string | null) =>
    get<HexagonCollection>(
      `/api/hexagons?country=${encodeURIComponent(country)}` +
      (district && district !== 'All' ? `&district=${encodeURIComponent(district)}` : '')),

  regions: (country: string) => get<Region[]>(`/api/regions?country=${encodeURIComponent(country)}`),

  facilities: (country: string) =>
    get<FacilityCollection>(`/api/facilities?country=${encodeURIComponent(country)}`),

  floodMeta: (country: string) =>
    get<{ bounds: [number, number, number, number]; tiers: string[] }>(
      `/api/flood-meta?country=${encodeURIComponent(country)}`),

  floodImageUrl: (country: string, tier: string) =>
    `${BASE}/api/flood-image?country=${encodeURIComponent(country)}&tier=${tier}`,

  stats: (country: string) => get<Stats>(`/api/stats?country=${encodeURIComponent(country)}`),

  evidence: (h3Id: string) => get<Evidence>(`/api/evidence/${h3Id}`),

  supply: (country: string, district: string | null) =>
    get<SupplyData>(`/api/supply?country=${encodeURIComponent(country)}` +
      (district ? `&district=${encodeURIComponent(district)}` : '')),

  complaints: (country: string) =>
    get<ComplaintsData>(`/api/complaints?country=${encodeURIComponent(country)}`),

  education: (country: string, district: string | null) =>
    get<EducationData>(`/api/education?country=${encodeURIComponent(country)}` +
      (district ? `&district=${encodeURIComponent(district)}` : '')),

  async plan(country: string, district: string | null, intensity: number, depthM: number) {
    const res = await fetch(`${BASE}/api/plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, district, intensity, depth_m: depthM }),
    });
    if (!res.ok) throw new Error(`plan -> ${res.status}`);
    return (await res.json()) as { country: string; district: string | null; markdown: string };
  },

  async connect(columns: string[], places: string[], country: string) {
    const res = await fetch(`${BASE}/api/connect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns, places, country }),
    });
    if (!res.ok) throw new Error(`connect -> ${res.status}`);
    return (await res.json()) as ConnectResult;
  },

  async downloadBrief(h3Id: string, timeHorizon: TimeHorizon) {
    const res = await fetch(`${BASE}/api/brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ h3_id: h3Id, time_horizon: timeHorizon }),
    });
    if (!res.ok) throw new Error(`brief -> ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flood_brief_${h3Id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
