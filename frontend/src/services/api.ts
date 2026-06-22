import type {
  ComplaintsData, ConnectResult, Country, EducationData, Evidence, Facility,
  HexagonCollection, Provenance, ProtocolResult, Region, ScenarioContext, Stats,
  SupplyData, TimeHorizon,
} from '../types';

interface FacilityCollection { country: string; count: number; at_risk: number; facilities: Facility[]; }
export const STATIC_FLOOD_META: Record<string, { bounds: [number, number, number, number]; tiers: string[] }> = {
  Bangladesh: { bounds: [87.87077967100234, 20.47098773012833, 92.83744633766881, 26.770987730128077], tiers: ['4h', '20h', '7d'] },
  Uganda: { bounds: [29.42343299999999, -1.632590066666383, 35.14843299999976, 4.384076600000043], tiers: ['4h', '20h', '7d'] },
};

// In dev, Vite proxies /api -> localhost:8001. In prod, set VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

async function getWithFallback<T>(path: string, fallbackPath?: string): Promise<T> {
  try {
    return await get<T>(path);
  } catch (err) {
    if (!fallbackPath) throw err;
    const res = await fetch(fallbackPath, { cache: 'force-cache' });
    if (!res.ok) throw err;
    return res.json() as Promise<T>;
  }
}

const staticData = {
  countries: '/data/countries.json',
  hexagons: (country: string) => `/data/hexagons_${country}.json`,
  regions: (country: string) => `/data/regions_${country}.json`,
  facilities: (country: string) => `/data/facilities_${country}.json`,
};

export const api = {
  countries: () => getWithFallback<Country[]>('/api/countries', staticData.countries),

  hexagons: (country: string, district?: string | null) =>
    getWithFallback<HexagonCollection>(
      `/api/hexagons?country=${encodeURIComponent(country)}` +
      (district && district !== 'All' ? `&district=${encodeURIComponent(district)}` : ''),
      !district || district === 'All' ? staticData.hexagons(country) : undefined),

  regions: (country: string) =>
    getWithFallback<Region[]>(`/api/regions?country=${encodeURIComponent(country)}`, staticData.regions(country)),

  facilities: (country: string, district?: string | null) =>
    getWithFallback<FacilityCollection>(
      `/api/facilities?country=${encodeURIComponent(country)}` +
      (district && district !== 'All' ? `&district=${encodeURIComponent(district)}` : ''),
      staticData.facilities(country)),

  floodMeta: (country: string) =>
    get<{ bounds: [number, number, number, number]; tiers: string[] }>(
      `/api/flood-meta?country=${encodeURIComponent(country)}`),

  floodImageUrl: (country: string, tier: string) =>
    STATIC_FLOOD_META[country] && !BASE
      ? `/flood_${country}_${tier}.png`
      : `${BASE}/api/flood-image?country=${encodeURIComponent(country)}&tier=${tier}`,

  stats: (country: string) => get<Stats>(`/api/stats?country=${encodeURIComponent(country)}`),

  evidence: (h3Id: string) => get<Evidence>(`/api/evidence/${h3Id}`),

  // ---------- BEACON decision sandbox (Sylhet 2022) ----------
  scenarioContext: () =>
    get<ScenarioContext>('/api/scenario/sylhet2022/context'),

  protocol: (id: string) =>
    get<ProtocolResult>(`/api/protocol/${encodeURIComponent(id)}`),

  provenance: (provenanceId: string) =>
    get<Provenance>(`/api/evidence/${encodeURIComponent(provenanceId)}`),

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
