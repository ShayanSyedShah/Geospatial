// Shared risk -> color/label mapping and the timeline risk model.
import type { Hexagon } from '../types';

export type RGBA = [number, number, number, number];

export function riskColor(risk: number): RGBA {
  if (risk <= 0.001) return [0, 0, 0, 0]; // dry -> invisible
  if (risk > 0.8) return [230, 40, 40, 228]; // very high - red
  if (risk > 0.6) return [255, 124, 22, 222]; // high - orange
  if (risk > 0.4) return [255, 201, 50, 216]; // moderate - amber
  if (risk > 0.2) return [96, 205, 120, 205]; // low - green
  return [70, 160, 230, 195]; // minimal - blue (shallow water)
}

export function riskLabel(risk: number): string {
  if (risk > 0.8) return 'Very High';
  if (risk > 0.6) return 'High';
  if (risk > 0.4) return 'Moderate';
  if (risk > 0.2) return 'Low';
  return 'Minimal';
}

export const RISK_LEGEND = [
  { color: '#d32f2f', label: 'Very High (>80%)' },
  { color: '#ff791e', label: 'High (60-80%)' },
  { color: '#ffc43c', label: 'Moderate (40-60%)' },
  { color: '#78c878', label: 'Low (20-40%)' },
  { color: '#5a96d2', label: 'Minimal (<20%)' },
];

// ---- Timeline model -------------------------------------------------------
// The forecast window runs 0 -> FORECAST_HOURS. Water rises across the three
// real hazard tiers (rp10 @4h, rp100 @20h, rp500 @7d): low-lying cells flood
// first, rarer-but-severe extents fill in later.
export const FORECAST_HOURS = 72;
const KEYS = [0, 1 / 3, 2 / 3, 1]; // fractions for [dry, rp10, rp100, rp500]

/** Interpolated flood risk for a hexagon at timeline fraction f in [0,1]. */
export function riskAtTime(h: Hexagon, f: number): number {
  const stops = [0, h.flood_risk_4h, h.flood_risk_20h, h.flood_risk_7d];
  if (f <= 0) return stops[0];
  if (f >= 1) return stops[3];
  for (let i = 1; i < KEYS.length; i++) {
    if (f <= KEYS[i]) {
      const t = (f - KEYS[i - 1]) / (KEYS[i] - KEYS[i - 1]);
      return stops[i - 1] + (stops[i] - stops[i - 1]) * t;
    }
  }
  return stops[3];
}

export function timeLabel(f: number): string {
  const h = Math.round(f * FORECAST_HOURS);
  if (h === 0) return 'Now';
  if (h < 24) return `+${h}h`;
  return `+${(h / 24).toFixed(h % 24 === 0 ? 0 : 1)}d`;
}

/** Which return-period scenario the current time corresponds to. */
export function scenarioLabel(f: number): string {
  if (f < 1 / 3) return 'onset · rp10 scenario';
  if (f < 2 / 3) return 'rising · rp100 scenario';
  return 'peak · rp500 scenario';
}
