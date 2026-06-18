import type { EvacRoute, Facility, UserLocation } from '../types';
import { bearing, haversine } from './geo';

// OSRM public demo server: CORS-open, keyless, covers Bangladesh (verified).
const OSRM = 'https://router.project-osrm.org/route/v1/driving';

/** Route from user to a destination facility. Tries OSRM road routing, falls
 *  back to a straight-line "direct" path if it fails/times out. */
export async function routeTo(user: UserLocation, dest: Facility): Promise<EvacRoute> {
  const brg = bearing(user.lat, user.lng, dest.lat, dest.lng);
  const direct: EvacRoute = {
    to: dest,
    distanceM: haversine(user.lat, user.lng, dest.lat, dest.lng),
    durationS: haversine(user.lat, user.lng, dest.lat, dest.lng) / 1.4, // ~walking
    path: [[user.lng, user.lat], [dest.lng, dest.lat]],
    mode: 'direct',
    bearing: brg,
  };
  try {
    const url = `${OSRM}/${user.lng},${user.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return direct;
    const data = await res.json();
    const r = data?.routes?.[0];
    if (!r?.geometry?.coordinates?.length) return direct;
    return {
      to: dest,
      distanceM: r.distance,
      durationS: r.duration,
      path: r.geometry.coordinates as [number, number][],
      mode: 'road',
      bearing: brg,
    };
  } catch {
    return direct;
  }
}
