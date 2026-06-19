// Transparent, INFORM-aligned zone prioritization ("who to help first").
// Factors normalized 0-1 across zones (children log-transformed per INFORM),
// combined by user-adjustable weights. Every rank is explainable.
import type { RankedZone, Weights, ZoneImpact } from '../types';

const norm = (vals: number[]) => {
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  return vals.map((v) => (v - min) / span);
};

export function rankZones(
  zones: ZoneImpact[],
  nearestClinicKm: Record<string, number>,
  w: Weights,
): RankedZone[] {
  if (!zones.length) return [];
  const childrenN = norm(zones.map((z) => Math.log1p(z.childrenU5))); // log: skewed exposure
  const floodN = norm(zones.map((z) => z.meanDepth));
  const accessN = norm(zones.map((z) => nearestClinicKm[z.name] ?? 0)); // farther = worse
  const wsum = w.children + w.flood + w.access || 1;

  const ranked = zones.map((z, i) => {
    const cC = (w.children / wsum) * childrenN[i];
    const cF = (w.flood / wsum) * floodN[i];
    const cA = (w.access / wsum) * accessN[i];
    const score = cC + cF + cA;
    const tot = score || 1;
    return {
      ...z,
      score,
      rank: 0,
      nearestClinicKm: nearestClinicKm[z.name] ?? 0,
      contrib: { children: cC / tot, flood: cF / tot, access: cA / tot },
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  ranked.forEach((z, i) => (z.rank = i + 1));
  return ranked;
}

/** Plain-language "why is this zone #1?" sentence. */
export function explain(z: RankedZone): string {
  const parts = ([
    [`its ${z.childrenU5.toLocaleString()} children under-5`, z.contrib.children],
    [`flood depth (~${z.meanDepth.toFixed(1)} m)`, z.contrib.flood],
    [`distance to the nearest clinic (${z.nearestClinicKm.toFixed(1)} km)`, z.contrib.access],
  ] as [string, number][]).sort((a, b) => b[1] - a[1]);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return `Ranked #${z.rank} (score ${z.score.toFixed(2)}). Driven mostly by ${parts[0][0]} ` +
    `(${pct(parts[0][1])} of the score), then ${parts[1][0]} (${pct(parts[1][1])}) ` +
    `and ${parts[2][0]} (${pct(parts[2][1])}).`;
}
