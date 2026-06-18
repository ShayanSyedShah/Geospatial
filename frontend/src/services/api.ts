import type { Evidence, HexagonCollection, Stats, TimeHorizon } from '../types';

// In dev, Vite proxies /api -> localhost:8000. In prod, set VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  hexagons: (country: string, timeHorizon: TimeHorizon) =>
    get<HexagonCollection>(`/api/hexagons?country=${encodeURIComponent(country)}&time_horizon=${timeHorizon}`),

  stats: (country: string) => get<Stats>(`/api/stats?country=${encodeURIComponent(country)}`),

  evidence: (h3Id: string) => get<Evidence>(`/api/evidence/${h3Id}`),

  briefUrl: () => `${BASE}/api/brief`,

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
