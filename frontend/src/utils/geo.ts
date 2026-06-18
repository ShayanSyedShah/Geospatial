import type { Facility, UserLocation } from '../types';

const R = 6371000; // Earth radius, metres
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial compass bearing 0-360° (from north). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function compass(deg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

/** Nearest SAFE (not at-risk) clinic to the user, by straight-line distance. */
export function nearestSafeClinic(user: UserLocation, facilities: Facility[]): Facility | null {
  let best: Facility | null = null;
  let bestD = Infinity;
  for (const f of facilities) {
    if (f.type !== 'clinic' || f.at_risk) continue;
    const d = haversine(user.lat, user.lng, f.lat, f.lng);
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}
