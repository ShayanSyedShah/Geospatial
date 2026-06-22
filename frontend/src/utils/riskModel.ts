import type { Hexagon } from '../types';

// A standing, nationwide flood-RISK screen (not a single event): every cell scored
// by "could it flood × who's there × can they cope/escape", from data already on
// each hexagon. The lens lets you see WHY a cell is high — which factor drives it.
export type RiskLens = 'overall' | 'hazard' | 'exposure' | 'access' | 'service';

export const RISK_LENSES: { id: RiskLens; label: string; hint: string }[] = [
  { id: 'overall', label: 'Overall risk', hint: 'hazard × exposure × access × service' },
  { id: 'hazard', label: 'Flood hazard', hint: 'JRC/GloFAS return periods' },
  { id: 'exposure', label: 'People exposed', hint: 'WorldPop under-5' },
  { id: 'access', label: 'Access / cut-off', hint: 'distance to nearest clinic' },
  { id: 'service', label: 'Service loss', hint: 'no clinic/school nearby' },
];

export interface RiskFactors {
  hazard: number;
  exposure: number;
  access: number;
  service: number;
  overall: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// "Could it flood at all" — worst case across the return-period tiers.
export const hazardOf = (h: Hexagon) =>
  clamp01(Math.max(h.flood_risk_4h, h.flood_risk_20h, h.flood_risk_7d));

// How many people (√ so a few huge cells don't flatten the rest).
export const exposureOf = (h: Hexagon, maxU5: number) =>
  clamp01(Math.sqrt((h.population_u5 || 0) / Math.max(1, maxU5)));

// Cut-off proxy: far from the nearest clinic = worse (capped at 15 km).
export const accessOf = (h: Hexagon) =>
  clamp01((h.nearest_clinic_m ?? 20000) / 15000);

// Service gap: no clinic nearby hurts most, no school adds to it.
export const serviceOf = (h: Hexagon) =>
  clamp01((h.nearby_clinics === 0 ? 0.6 : 0) + (h.nearby_schools === 0 ? 0.4 : 0));

// Composite: hazard GATES the risk (no flood → low), exposure/access/service
// amplify it within 0.4..1.0. So "flood + many people + cut off" tops out at 1.
export function riskFactors(h: Hexagon, maxU5: number): RiskFactors {
  const hazard = hazardOf(h);
  const exposure = exposureOf(h, maxU5);
  const access = accessOf(h);
  const service = serviceOf(h);
  const amp = 0.4 + 0.3 * exposure + 0.18 * access + 0.12 * service; // 0.4..1.0
  const overall = clamp01(hazard * Math.min(1, amp));
  return { hazard, exposure, access, service, overall };
}

export const riskValue = (f: RiskFactors, lens: RiskLens) => f[lens];

// Risk ramp: dim teal (low) → yellow → orange → red (high). Distinct from the
// population Inferno and the green→red poverty ramp.
const RISK: Array<[number, number, number]> = [
  [40, 90, 120],
  [120, 170, 120],
  [240, 220, 70],
  [242, 140, 40],
  [214, 40, 38],
];

export function riskColor(t: number): [number, number, number] {
  const x = clamp01(t) * (RISK.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RISK[i];
  const b = RISK[Math.min(i + 1, RISK.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
