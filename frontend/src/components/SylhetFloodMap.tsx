import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildNeighborMask } from '../utils/neighborMask';
import { SylhetMapWaterLayer } from '../water/SylhetMapWaterLayer';
import type { MapLayer } from '../types';

export interface FloodFrame {
  date: string;
  label: string;
  mode?: 'monsoon' | 'lift' | 'rainburst' | 'surge' | 'flood' | 'response';
  floodExtent: string | null; // URL to GeoJSON, or null for a stat-only frame
  camera?: { center: [number, number]; zoom: number; pitch: number; bearing: number };
}

interface Props {
  focus: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  frames: FloodFrame[];
  activeIndex: number;
  showRain: boolean;
  /** The active response protocol's map_layer; its ranked targets are painted as
   *  labelled pill markers. null clears the markers. */
  protocolLayer?: MapLayer | null;
  /** Active protocol id (supply|education|complaints|deconfliction) — drives the
   *  pill icon. */
  protocolId?: string | null;
  /** Fired when a protocol target is clicked: a pill (point protocols) or a
   *  district polygon (deconfliction). Receives the raw row / feature props. */
  onSelectTarget?: (props: Record<string, unknown>) => void;
  /** Sync key of the currently selected/hovered target (id, else district). The
   *  matching pill / district is highlighted. */
  selectedKey?: string | null;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const MONSOON_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[88.7, 20.2], [89.6, 21.2], [90.5, 22.5], [91.25, 24.0], [91.75, 25.25]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[89.8, 19.7], [90.45, 21.0], [91.05, 22.8], [91.55, 24.35], [91.65, 25.55]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[90.3, 20.4], [90.95, 21.6], [91.45, 23.05], [91.85, 24.55], [91.92, 24.95]] } },
  ],
};
const MONSOON_POINTS: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [89.6, 21.2] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [90.5, 22.5] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [91.25, 24.0] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [91.75, 25.25] } },
  ],
};
const KHASI_JAINTIA_RIDGE: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Khasi/Jaintia Hills escarpment' },
      geometry: {
        type: 'LineString',
        coordinates: [[90.75, 25.45], [91.15, 25.5], [91.55, 25.38], [91.95, 25.27], [92.28, 25.2]],
      },
    },
  ],
};

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, maxzoom: 19,
      attribution: 'Imagery Â© Esri, Maxar Â· Flood Â© UNOSAT/UNITAR',
    },
    labels: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
    // Real NASA GPM IMERG precipitation for 17 Jun 2022 (the record-rain day over
    // Meghalaya that triggered the flood), via public NASA GIBS WMTS (no key).
    rain: {
      type: 'raster',
      tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/IMERG_Precipitation_Rate/default/2022-06-17/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png'],
      tileSize: 256, maxzoom: 6,
      attribution: 'Precipitation Â© NASA GPM IMERG, via NASA GIBS',
    },
    terrain: {
      type: 'raster-dem',
      tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 10,
      attribution: 'Elevation Â© AWS Terrain Tiles / SRTM, Mapzen',
    },
    // Free, no-key vector tiles (OpenFreeMap) — real 3D building footprints
    // extruded on city zoom, same as the main Flood map.
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#06121c' } },
    { id: 'satellite', type: 'raster', source: 'satellite' },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'terrain',
      paint: {
        'hillshade-exaggeration': 0.34,
        'hillshade-shadow-color': '#02070d',
        'hillshade-highlight-color': '#e0f2fe',
        'hillshade-accent-color': '#38bdf8',
      },
    },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.8 } },
    // Every river + water body in Bangladesh as blue water, from the OpenFreeMap
    // vector tiles (no fetch, all zooms). Drawn ABOVE labels so the blue water
    // covers the white river lines. Wide rivers fill; small rivers = lines.
    {
      id: 'bd-water-fill', type: 'fill', source: 'openmaptiles', 'source-layer': 'water',
      paint: { 'fill-color': '#1f6fa8', 'fill-opacity': 0.55 },
    },
    {
      id: 'bd-rivers-halo', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#1f6fa8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.4, 9, 4, 13, 9],
        'line-opacity': 0.5, 'line-blur': 1.5,
      },
    },
    {
      id: 'bd-rivers', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#46b6ea',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 9, 2.4, 13, 5.5],
        'line-opacity': 0.95,
      },
    },
    // upstream rainfall (hidden until the rain scene toggles it on)
    { id: 'rain', type: 'raster', source: 'rain', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.7 } },
    // Real 3D building footprints (OpenFreeMap), extruded on city zoom — same as
    // the main Flood map. Zoom-gated to minzoom 14 so the regional views stay fast.
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6],
          0, '#a7b6c7',
          25, '#c8d4e2',
          80, '#eff5fb',
        ],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.72,
      },
    },
  ],
};

// ---- Protocol markings (the four response protocols' recommended locations) ----
// Each protocol's map_layer.data is EITHER a GeoJSON FeatureCollection of points
// (supply, complaints) OR a plain array of {lat,lng,...} rows (education,
// deconfliction). We normalise both, derive a per-target colour (categorical from
// legend.values/legend.stops, else a numeric ramp on score/color_by), and render
// each as a labelled HTML pill — the same badge style as the infra markers — so
// you can read WHAT each recommended location is, not just see a coloured dot.
const PROTOCOL_RAMP = ['#2c7fb8', '#41b6c4', '#a1dab4', '#fecc5c', '#fd8d3c', '#e31a1c'];
const PROTOCOL_ICON: Record<string, string> = {
  supply: '📦', education: '🎓', complaints: '📣', deconfliction: '🔄',
};
const MAX_PROTOCOL_MARKERS = 10; // cap so the map stays legible (the panel lists them all)

type ProtoPt = { lng: number; lat: number; props: Record<string, unknown> };
type ProtoMarker = { lng: number; lat: number; color: string; title: string; sub: string; props: Record<string, unknown> };

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
const toNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c));

function extractPoints(data: unknown): ProtoPt[] {
  const d = data as { type?: string; features?: unknown };
  if (d && d.type === 'FeatureCollection' && Array.isArray(d.features)) {
    const out: ProtoPt[] = [];
    for (const f of d.features as Array<Record<string, unknown>>) {
      const geom = asRecord(f.geometry);
      const c = geom.coordinates;
      if (geom.type !== 'Point' || !Array.isArray(c) || c.length < 2) continue;
      const lng = toNum(c[0]); const lat = toNum(c[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) out.push({ lng, lat, props: asRecord(f.properties) });
    }
    return out;
  }
  if (Array.isArray(data)) {
    const out: ProtoPt[] = [];
    for (const r of data as Array<Record<string, unknown>>) {
      const lng = toNum(r.lng); const lat = toNum(r.lat);
      if (Number.isFinite(lng) && Number.isFinite(lat)) out.push({ lng, lat, props: r });
    }
    return out;
  }
  return [];
}

function legendCategoryMap(legend: unknown): Record<string, string> | null {
  const l = asRecord(legend);
  if (l.values && typeof l.values === 'object') return l.values as Record<string, string>;
  if (Array.isArray(l.stops)) {
    const m: Record<string, string> = {};
    for (const s of l.stops as unknown[]) if (Array.isArray(s) && s.length >= 2) m[String(s[0])] = String(s[1]);
    return Object.keys(m).length ? m : null;
  }
  return null;
}

// Title = the place/feature name; sub = a short, protocol-agnostic stat read from
// whatever fields the target carries (status / severity / exposed children / rank).
function titleFor(props: Record<string, unknown>): string {
  return String(props.name ?? props.district ?? props.id ?? '').trim();
}
function subFor(props: Record<string, unknown>): string {
  if (props.status != null) return String(props.status);
  if (props.severity != null) {
    const cat = props.category != null ? ` · ${String(props.category)}` : '';
    return `${String(props.severity)}${cat}`;
  }
  const u5 = toNum(props.exposed_u5);
  if (Number.isFinite(u5)) return `${u5.toLocaleString()} children exposed`;
  const rank = toNum(props.rank);
  if (Number.isFinite(rank)) return `priority #${rank}`;
  return '';
}

function buildProtocolMarkers(layer: MapLayer): ProtoMarker[] {
  const pts = extractPoints(layer.data);
  if (!pts.length) return [];
  const colorBy = layer.color_by || '';
  const catMap = legendCategoryMap(layer.legend);
  const scores = pts.map((p) => toNum(p.props.score ?? p.props[colorBy])).filter(Number.isFinite);
  const min = scores.length ? Math.min(...scores) : 0;
  const max = scores.length ? Math.max(...scores) : 1;
  const span = max > min ? max - min : 1;

  const catFor = (props: Record<string, unknown>): string | null => {
    if (!catMap) return null;
    for (const k of [colorBy, 'status', 'severity', 'tier']) {
      if (!k) continue;
      const v = props[k];
      if (v != null && String(v) in catMap) return String(v);
    }
    return null;
  };

  // Data arrives in priority order; cap to keep the map readable.
  return pts.slice(0, MAX_PROTOCOL_MARKERS).map((p) => {
    let color = '#38bdf8';
    const cv = catFor(p.props);
    if (cv) {
      color = catMap![cv];
    } else {
      const v = toNum(p.props.score ?? p.props[colorBy]);
      if (Number.isFinite(v)) color = PROTOCOL_RAMP[Math.max(0, Math.min(PROTOCOL_RAMP.length - 1, Math.floor(((v - min) / span) * PROTOCOL_RAMP.length)))];
    }
    return { lng: p.lng, lat: p.lat, color, title: titleFor(p.props), sub: subFor(p.props), props: p.props };
  });
}

// ---- De-confliction choropleth (managed GeoJSON source + fill/outline layers) ----
// De-confliction does NOT use pills: its map_layer.data is an array of
// {district, gap, status, ...} rows. We paint the actual district polygons,
// coloured by coverage status from legend.stops, and emit the joined feature
// props on click. Source / layer ids:
const DECONF_SOURCE = 'beacon-deconf';
const DECONF_FILL = 'beacon-deconf-fill';
const DECONF_OUTLINE = 'beacon-deconf-outline';
const DECONF_SELECTED = 'beacon-deconf-selected';
const DECONF_GEOJSON_URL = '/data/sylhet_2022/deconfliction_districts.geojson';

// Sync key for a marker/feature row — must mirror the parent's selKeyOfRow: the
// row id when present (education/complaints), else the district (supply/deconf).
const markerKeyOf = (p: Record<string, unknown>): string =>
  p.id != null ? String(p.id) : String(p.district ?? p.shapeName ?? '');
// Fallback status→colour if legend.stops is missing/partial.
const DECONF_FALLBACK: Record<string, string> = {
  covered: '#2563eb', 'under-served': '#f59e0b', abandoned: '#ef4444',
};

// Build a MapLibre 'match' colour expression on feature.properties.status from
// the legend stops (categorical), falling back to the canonical palette.
function deconfColorExpr(legend: unknown): maplibregl.ExpressionSpecification {
  const map = { ...DECONF_FALLBACK, ...(legendCategoryMap(legend) ?? {}) };
  const expr: unknown[] = ['match', ['get', 'status']];
  for (const [status, color] of Object.entries(map)) { expr.push(status, color); }
  expr.push('#94a3b8'); // default grey for unknown status
  return expr as unknown as maplibregl.ExpressionSpecification;
}

// Join each map_layer.data row's gap/status/district onto the matching polygon
// (shapeName === row.district), writing them onto a CLONE of the feature props.
function joinDeconf(
  geom: GeoJSON.FeatureCollection,
  data: unknown,
): GeoJSON.FeatureCollection {
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  const byDistrict = new Map<string, Record<string, unknown>>();
  for (const r of rows) {
    const key = String(r.district ?? '').trim();
    if (key) byDistrict.set(key, r);
  }
  return {
    type: 'FeatureCollection',
    features: geom.features.map((f) => {
      const props = { ...(f.properties ?? {}) } as Record<string, unknown>;
      const name = String(props.shapeName ?? props.district ?? '').trim();
      const row = byDistrict.get(name);
      if (row) {
        props.status = row.status;
        props.gap = row.gap;
        props.district = row.district ?? name;
      } else {
        props.district = props.district ?? name;
      }
      return { ...f, properties: props };
    }),
  };
}

/** Self-contained MapLibre map for the 2022 Sylhet event â€” satellite base with the
 *  real UNOSAT flood polygon for the active date drawn on top. */
export default function SylhetFloodMap({ focus, frames, activeIndex, showRain, protocolLayer, protocolId, onSelectTarget, selectedKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  // cache fetched GeoJSON by url so scrubbing doesn't refetch
  const cacheRef = useRef<Record<string, GeoJSON.FeatureCollection>>({});
  const causeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const upliftMarkerRef = useRef<maplibregl.Marker | null>(null);
  const rainburstMarkersRef = useRef<maplibregl.Marker[]>([]);
  const surgeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const dangerMarkersRef = useRef<maplibregl.Marker[]>([]);
  const infraMarkersRef = useRef<maplibregl.Marker[]>([]);
  const protocolMarkersRef = useRef<Array<{ marker: maplibregl.Marker; el: HTMLDivElement; key: string }>>([]);
  // Latest onSelectTarget, mirrored each render so DOM/map listeners never go stale.
  const selectTargetRef = useRef<Props['onSelectTarget']>(onSelectTarget);
  selectTargetRef.current = onSelectTarget;
  // Latest selectedKey, so a freshly-built marker can paint its initial selected state.
  const selectedKeyRef = useRef<string | null | undefined>(selectedKey);
  selectedKeyRef.current = selectedKey;
  // De-confliction: cached district polygons + the live click handler so we can
  // attach/detach map.on('click', ...) idempotently across protocol changes.
  const deconfGeomRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const deconfClickRef = useRef<((e: maplibregl.MapLayerMouseEvent) => void) | null>(null);
  const surgeAnimRef = useRef<number | null>(null);
  const surgeCameraTimersRef = useRef<number[]>([]);
  const waterLayerRef = useRef<SylhetMapWaterLayer | null>(null);
  const framesRef = useRef(frames);
  const activeIndexRef = useRef(activeIndex);

  useEffect(() => {
    framesRef.current = frames;
    activeIndexRef.current = activeIndex;
  }, [frames, activeIndex]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: focus.center,
      zoom: focus.zoom,
      pitch: focus.pitch,
      bearing: focus.bearing,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    const causeMarkers: Array<{ label: string; coord: [number, number]; anchor: 'bottom-left' | 'bottom' | 'left' }> = [
      { label: 'Bay of Bengal moisture', coord: [89.25, 20.65], anchor: 'bottom-left' },
      { label: 'Meghalaya hills: rain trigger', coord: [91.65, 25.35], anchor: 'bottom' },
      { label: 'Sylhet haor basin fills', coord: [91.9, 24.92], anchor: 'left' },
      { label: 'Bangladesh', coord: [90.36, 23.7], anchor: 'bottom' },
    ];
    causeMarkersRef.current = causeMarkers.map(({ label, coord, anchor }) => {
      const el = document.createElement('div');
      el.className = 'syl-map-cause-label';
      el.textContent = label;
      el.style.display = 'none';
      return new maplibregl.Marker({ element: el, anchor }).setLngLat(coord).addTo(map);
    });
    const upliftEl = document.createElement('div');
    upliftEl.className = 'syl-uplift-marker';
    upliftEl.innerHTML = '<span></span><span></span><span></span><b>air forced upward</b>';
    upliftEl.style.display = 'none';
    upliftMarkerRef.current = new maplibregl.Marker({ element: upliftEl, anchor: 'bottom' })
      .setLngLat([91.65, 25.34])
      .addTo(map);
    const rainburstSites: Array<{ label: string; sub: string; coord: [number, number] }> = [
      { label: 'Sohra / Cherrapunji', sub: 'windward Khasi escarpment', coord: [91.735, 25.275] },
      { label: 'Mawsynram', sub: 'extreme rain core', coord: [91.56, 25.305] },
    ];
    rainburstMarkersRef.current = rainburstSites.map(({ label, sub, coord }) => {
      const el = document.createElement('div');
      el.className = 'syl-rainburst-marker';
      el.innerHTML = '<i></i><i></i><i></i><i></i><b>' + label + '</b><span>' + sub + '</span>';
      el.style.display = 'none';
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(coord).addTo(map);
    });
    // The full river network the 2022 surge ran through / put at risk.
    const surgeSites: Array<{ label: string; coord: [number, number]; anchor: 'bottom' | 'top' | 'left' | 'right' }> = [
      { label: 'Barak River (from Meghalaya)', coord: [92.62, 24.72], anchor: 'bottom' },
      { label: 'Surma River', coord: [91.55, 24.93], anchor: 'bottom' },
      { label: 'Kushiyara River', coord: [91.92, 24.60], anchor: 'top' },
      { label: 'Kalni River', coord: [91.18, 24.45], anchor: 'top' },
      { label: 'Sari-Goyain', coord: [92.02, 25.08], anchor: 'bottom' },
      { label: 'Jadukata', coord: [91.12, 25.08], anchor: 'bottom' },
      { label: 'Manu River', coord: [91.78, 24.42], anchor: 'top' },
      { label: 'Khowai River', coord: [91.40, 24.33], anchor: 'top' },
      { label: 'Sylhet floodplain', coord: [91.88, 24.90], anchor: 'left' },
      { label: 'Sunamganj haors', coord: [91.25, 24.78], anchor: 'right' },
    ];
    surgeMarkersRef.current = surgeSites.map(({ label, coord, anchor }) => {
      const el = document.createElement('div');
      el.className = 'syl-surge-label';
      el.textContent = label;
      el.style.display = 'none';
      return new maplibregl.Marker({ element: el, anchor }).setLngLat(coord).addTo(map);
    });

    // DANGER ZONES — the districts the 2022 flood actually hit hardest (7 NE
    // districts, ~7.2M affected, ~2M in Sylhet Division). Pulsing red alarms,
    // sized by severity. Shown during the flood scenes.
    const dangerSites: Array<{ name: string; stat: string; coord: [number, number]; sev: 1 | 2 | 3 }> = [
      { name: 'Sunamganj', stat: 'haor basin · towns marooned · ~90% inundated', coord: [91.40, 25.07], sev: 3 },
      { name: 'Sylhet', stat: '~2M affected · airport & rail cut · 55 unions flooded', coord: [91.87, 24.90], sev: 3 },
      { name: 'Moulvibazar', stat: 'Manu & Kushiyara overflow', coord: [91.78, 24.49], sev: 2 },
      { name: 'Habiganj', stat: 'Khowai & Kushiyara rise', coord: [91.41, 24.37], sev: 2 },
      { name: 'Netrokona', stat: 'Someshwari haors flooded', coord: [90.73, 24.88], sev: 2 },
      { name: 'Kishoreganj', stat: 'downstream haors fill', coord: [90.78, 24.44], sev: 1 },
    ];
    dangerMarkersRef.current = dangerSites.map(({ name, stat, coord, sev }) => {
      const el = document.createElement('div');
      el.className = `syl-danger sev-${sev}`;
      el.innerHTML = '<span class="ring"></span><span class="ring r2"></span><span class="dot"></span>';
      el.title = `${name} — ${stat}`; // info on hover, no visible name label
      el.style.display = 'none';
      return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coord).addTo(map);
    });

    // Key infrastructure the 2022 flood knocked out — shown on the flood scenes.
    const infraSites: Array<{ icon: string; label: string; coord: [number, number] }> = [
      { icon: '✈', label: 'Osmani Int’l Airport — closed 6 days', coord: [91.8667, 24.9633] },
      { icon: '🚉', label: 'Sylhet railway — suspended', coord: [91.8800, 24.8980] },
      { icon: '🏚', label: 'Sunamganj town — ~94% under water', coord: [91.3960, 25.0680] },
    ];
    infraMarkersRef.current = infraSites.map(({ icon, label, coord }, i) => {
      const el = document.createElement('div');
      el.className = 'syl-infra';
      el.innerHTML = `<span class="ic">${icon}</span><b>${label}</b>`;
      el.style.display = 'none';
      el.style.animationDelay = `${(i * 0.16).toFixed(2)}s`; // staggered pop-in on Peak extent
      return new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat(coord).addTo(map);
    });
    map.on('load', () => {
      if (typeof window !== 'undefined') (window as unknown as { __sylhetMap?: maplibregl.Map }).__sylhetMap = map;
      if (typeof map.setTerrain === 'function') {
        map.setTerrain({ source: 'terrain', exaggeration: 1.75 });
      }
      // Main map uses MapLibre layers for real DEM/OSM water. The custom 3D layer stays in the separate Water Lab.
fetch('/bgd_adm0.geojson')
        .then((r) => r.json())
        .then((adm0) => {
          if (!mapRef.current || map.getSource('bangladesh-adm0')) return;
          map.addSource('bangladesh-adm0', { type: 'geojson', data: adm0 });
          map.addSource('outside-bangladesh', { type: 'geojson', data: buildNeighborMask(adm0) });
          map.addLayer({
            id: 'outside-bangladesh-mask',
            type: 'fill',
            source: 'outside-bangladesh',
            paint: { 'fill-color': '#02070d', 'fill-opacity': 0.58 },
          });
          map.addLayer({
            id: 'bangladesh-country-tint',
            type: 'fill',
            source: 'bangladesh-adm0',
            paint: { 'fill-color': '#0b2a22', 'fill-opacity': 0.12 },
          });
          map.addLayer({
            id: 'bangladesh-border-glow',
            type: 'line',
            source: 'bangladesh-adm0',
            paint: { 'line-color': '#22d3ee', 'line-width': 8, 'line-opacity': 0.68, 'line-blur': 4 },
          });
          map.addLayer({
            id: 'bangladesh-border',
            type: 'line',
            source: 'bangladesh-adm0',
            paint: { 'line-color': '#ffffff', 'line-width': 2.2, 'line-opacity': 1 },
          });
        })
        .catch((err) => console.warn('Bangladesh boundary load failed', err));

      map.addSource('monsoon', { type: 'geojson', data: MONSOON_FC });
      map.addSource('khasi-jaintia-ridge', { type: 'geojson', data: KHASI_JAINTIA_RIDGE });
      map.addSource('sylhet-water-surface', {
        type: 'geojson',
        data: '/data/sylhet_2022/sylhet_water_surface.geojson',
      });
      map.addSource('sylhet-water-points', {
        type: 'geojson',
        data: '/data/sylhet_2022/sylhet_water_points.geojson',
      });
      map.addLayer({
        id: 'sylhet-water-heat', type: 'heatmap', source: 'sylhet-water-points',
        layout: { visibility: 'none' },
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'stage'], 1, 0.38, 3, 0.92],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 7, 1.25, 10, 2.9],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 7, 18, 10, 38],
          'heatmap-opacity': 0.9,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(14,165,233,0)',
            0.18, 'rgba(14,165,233,0.22)',
            0.42, 'rgba(6,182,212,0.56)',
            0.75, 'rgba(103,232,249,0.82)',
            1, 'rgba(224,247,255,0.92)'
          ],
        },
      });
      map.addLayer({
        id: 'sylhet-water-fill', type: 'fill', source: 'sylhet-water-surface',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': ['match', ['get', 'stage'], 1, '#00a6ff', 2, '#00d5ff', '#7cf7ff'],
          'fill-opacity': 0.06,
          'fill-outline-color': 'rgba(124,247,255,0)',
        },
      });
      map.addLayer({
        id: 'sylhet-water-shine', type: 'line', source: 'sylhet-water-surface',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#7cf7ff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.25, 10, 0.75],
          'line-opacity': 0,
          'line-blur': 0.35,
        },
      });
      map.addLayer({
        id: 'khasi-ridge-glow', type: 'line', source: 'khasi-jaintia-ridge',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fde68a', 'line-width': 14, 'line-opacity': 0.42, 'line-blur': 8 },
      });
      map.addLayer({
        id: 'khasi-ridge-line', type: 'line', source: 'khasi-jaintia-ridge',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fef3c7', 'line-width': 4.5, 'line-opacity': 0.95 },
      });
      map.addLayer({
        id: 'monsoon-glow', type: 'line', source: 'monsoon',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#60a5fa',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 30, 9, 48],
          'line-opacity': 0.34,
          'line-blur': 12,
        },
      });
      map.addLayer({
        id: 'monsoon-stream', type: 'line', source: 'monsoon',
        layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#bae6fd',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 6, 9, 11],
          'line-opacity': 1,
          'line-dasharray': [1, 1.4],
        },
      });
      map.addSource('monsoon-points', { type: 'geojson', data: MONSOON_POINTS });
      map.addLayer({
        id: 'monsoon-pulses', type: 'circle', source: 'monsoon-points',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 9, 11],
          'circle-color': '#dbeafe',
          'circle-opacity': 0.78,
          'circle-stroke-color': '#38bdf8',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.9,
        },
      });
      // Real Barak â†’ Surma/Kushiyara river geometry (OSM) â€” the water's pathway.
      fetch('/data/sylhet_2022/rivers.geojson')
        .then((r) => r.json())
        .then((rivers: GeoJSON.FeatureCollection) => {
          if (!mapRef.current || map.getSource('rivers')) return;
          map.addSource('rivers', { type: 'geojson', data: rivers });
          // Soft deep-water halo — gives the ribbon width + a wet edge.
          map.addLayer({
            id: 'rivers-glow', type: 'line', source: 'rivers',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0b3a5a',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 18, 11, 48],
              'line-opacity': 0.5, 'line-blur': 9,
            },
          });
          // Main water body — a wide natural river-blue band, soft edges.
          map.addLayer({
            id: 'rivers-line', type: 'line', source: 'rivers',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#2080b5',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 11, 11, 30],
              'line-opacity': 0.94,
              'line-blur': 2.4,
            },
          });
          // Lighter sunlit centre of the channel.
          map.addLayer({
            id: 'rivers-flow-glow', type: 'line', source: 'rivers',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#56abda',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 5, 11, 15],
              'line-opacity': 0.72,
              'line-blur': 1.6,
            },
          });
          // Moving surface glints (animated dash, driven in applyFrame) = flow.
          map.addLayer({
            id: 'rivers-flow-pulse', type: 'line', source: 'rivers',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#eaf8ff',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2.5, 11, 7],
              'line-opacity': 0.6,
              'line-dasharray': [0, 4, 3],
            },
          });
          ['sylhet-water-heat', 'sylhet-water-fill', 'sylhet-water-shine', 'rivers-flow-glow', 'rivers-flow-pulse'].forEach((id) => {
            if (map.getLayer(id)) map.moveLayer(id);
          });
          void applyFrame();
        })
        .catch((err) => console.warn('rivers load failed', err));

      // The full network of rivers the 2022 surge ran through / put at risk
      // (Barak -> Surma/Kushiyara/Kalni + hill feeders), real OSM geometry.
      fetch('/data/sylhet_2022/affected_rivers.geojson')
        .then((r) => r.json())
        .then((net: GeoJSON.FeatureCollection) => {
          if (!mapRef.current || map.getSource('affected-rivers')) return;
          map.addSource('affected-rivers', { type: 'geojson', data: net });
          // feeder rivers — thinner, cooler blue
          map.addLayer({
            id: 'affected-feeder', type: 'line', source: 'affected-rivers',
            filter: ['==', ['get', 'klass'], 'feeder'],
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#3aa0d6',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.6, 10, 4.5],
              'line-opacity': 0.78, 'line-blur': 0.6,
            },
          });
          // main rivers — wide glowing water-blue
          map.addLayer({
            id: 'affected-main-glow', type: 'line', source: 'affected-rivers',
            filter: ['==', ['get', 'klass'], 'main'],
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#0b3a5a',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 9, 10, 22],
              'line-opacity': 0.5, 'line-blur': 6,
            },
          });
          map.addLayer({
            id: 'affected-main', type: 'line', source: 'affected-rivers',
            filter: ['==', ['get', 'klass'], 'main'],
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#2a93c9',
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3.4, 10, 9],
              'line-opacity': 0.95, 'line-blur': 0.8,
            },
          });
          void applyFrame();
        })
        .catch((err) => console.warn('affected rivers load failed', err));

      // Danger zones — the 9 affected districts shaded by severity tier
      // (1 = epicentre dark red, 3 = affected light). Real district shapes.
      fetch('/data/sylhet_2022/danger_zones.geojson')
        .then((r) => r.json())
        .then((zones: GeoJSON.FeatureCollection) => {
          if (!mapRef.current || map.getSource('danger-zones')) return;
          map.addSource('danger-zones', { type: 'geojson', data: zones });
          const beforeId = map.getLayer('bd-water-fill') ? 'bd-water-fill' : undefined;
          map.addLayer({
            id: 'danger-fill', type: 'fill', source: 'danger-zones',
            layout: { visibility: 'none' },
            paint: {
              'fill-color': ['match', ['get', 'tier'], 1, '#7a0d0d', 2, '#c8392b', 3, '#f0915f', '#f0915f'],
              'fill-opacity': ['match', ['get', 'tier'], 1, 0.55, 2, 0.42, 3, 0.28, 0.28],
            },
          }, beforeId);
          map.addLayer({
            id: 'danger-outline', type: 'line', source: 'danger-zones',
            layout: { visibility: 'none' },
            paint: {
              'line-color': ['match', ['get', 'tier'], 1, '#ff4d3d', 2, '#ff7a5a', 3, '#ffb591', '#ffb591'],
              'line-width': ['match', ['get', 'tier'], 1, 2.2, 2, 1.6, 3, 1.1, 1.1],
              'line-opacity': 0.85,
            },
          }, beforeId);
        })
        .catch((err) => console.warn('danger zones load failed', err));

      map.addSource('flood', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'flood-fill', type: 'fill', source: 'flood',
        paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.42 },
      });
      map.addLayer({
        id: 'flood-line', type: 'line', source: 'flood',
        paint: { 'line-color': '#67e8f9', 'line-width': 1.2, 'line-opacity': 0.9 },
      });
      // Real shallow-water sim on the Sylhet SRTM terrain — the actual water,
      // driven per scene via waterLayerRef.setLevel().
      try {
        const water = new SylhetMapWaterLayer();
        map.addLayer(water as unknown as maplibregl.LayerSpecification);
        waterLayerRef.current = water;
      } catch (err) { console.warn('sylhet water layer failed', err); }
      loadedRef.current = true;
      void applyFrame();
    });
    mapRef.current = map;
    if (typeof window !== 'undefined') (window as unknown as { __sylhetMap?: maplibregl.Map }).__sylhetMap = map;
    return () => {
      causeMarkersRef.current.forEach((marker) => marker.remove());
      causeMarkersRef.current = [];
      upliftMarkerRef.current?.remove();
      upliftMarkerRef.current = null;
      rainburstMarkersRef.current.forEach((marker) => marker.remove());
      rainburstMarkersRef.current = [];
      surgeMarkersRef.current.forEach((marker) => marker.remove());
      surgeMarkersRef.current = [];
      dangerMarkersRef.current.forEach((marker) => marker.remove());
      dangerMarkersRef.current = [];
      infraMarkersRef.current.forEach((marker) => marker.remove());
      infraMarkersRef.current = [];
      protocolMarkersRef.current.forEach(({ marker }) => marker.remove());
      protocolMarkersRef.current = [];
      if (surgeAnimRef.current !== null) window.clearInterval(surgeAnimRef.current);
      surgeCameraTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      waterLayerRef.current = null;
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyFrame() {
    const map = mapRef.current;
    const frame = framesRef.current[activeIndexRef.current];
    if (!map || !frame) return;
    const showMonsoon = frame.mode === 'monsoon';
    const showLift = frame.mode === 'lift';
    const showRainburst = frame.mode === 'rainburst';
    const showSurge = frame.mode === 'surge';
    const waterLevel = frame.label === 'Haor basin fills' ? 0.95 : (frame.label === 'Peak extent' || frame.mode === 'response') ? 1 : 0;
    const waterStage = frame.label === 'Haor basin fills' ? 3 : (frame.label === 'Peak extent' || frame.mode === 'response') ? 3 : 0;
    void waterLevel;
    causeMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = (showMonsoon || showLift || showRainburst) ? 'block' : 'none';
    });
    if (upliftMarkerRef.current) upliftMarkerRef.current.getElement().style.display = showLift ? 'block' : 'none';
    rainburstMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showRainburst ? 'block' : 'none';
    });
    surgeMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showSurge ? 'block' : 'none';
    });
    // Danger zones appear once water is on the ground (the flood scenes): the
    // 9 affected districts shaded by severity tier, plus a pulse on each. These
    // are the FLOOD-scene visuals only — the Response scene shows NONE of them, so
    // it presents a clean decision map with just the protocol pills on top.
    const showDanger = frame.mode === 'flood';
    ['danger-fill', 'danger-outline'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showDanger ? 'visible' : 'none');
    });
    // The floating HTML markers are SCENE-SPECIFIC so each flood scene shows only
    // its own indicators — and NOTHING carries onto the response scene:
    //   • Haor basin fills → district danger pulses (the basin inundating)
    //   • Peak extent      → infrastructure knocked out (airport/rail/town = peak damage)
    //   • Response         → none (only the protocol pill markers)
    const showDangerPulses = frame.label === 'Haor basin fills';
    const showInfra = frame.label === 'Peak extent';
    dangerMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showDangerPulses ? 'block' : 'none';
    });
    infraMarkersRef.current.forEach((marker) => {
      marker.getElement().style.display = showInfra ? 'block' : 'none';
    });
    if (surgeAnimRef.current !== null) {
      window.clearInterval(surgeAnimRef.current);
      surgeAnimRef.current = null;
    }
    surgeCameraTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    surgeCameraTimersRef.current = [];
    if (frame.camera) {
      map.easeTo({ ...frame.camera, duration: 1200, essential: true });
    }
    if (!loadedRef.current) return;
    const src = map.getSource('flood') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    ['monsoon-glow', 'monsoon-stream', 'monsoon-pulses'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    });
    ['khasi-ridge-glow', 'khasi-ridge-line'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', (showLift || showRainburst) ? 'visible' : 'none');
    });
    // Real 3D water replaces the old prototype water layers on the flood scene.
    const isFloodScene = frame.mode === 'flood' && !!frame.floodExtent;
    ['sylhet-water-heat', 'sylhet-water-fill', 'sylhet-water-shine'].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', (waterStage > 0 && !isFloodScene) ? 'visible' : 'none');
        map.setFilter(id, ['<=', ['get', 'stage'], waterStage]);
      }
    });
    // Step 4 (river surge): show the WHOLE affected river network (Barak ->
    // Surma/Kushiyara/Kalni + hill feeders) as labelled water-blue lines, and
    // raise the real Water Lab water on the Surma when zoomed in close.
    ['rivers-glow', 'rivers-line', 'rivers-flow-glow', 'rivers-flow-pulse'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    });
    // Lines stay hidden during surge — the real water IS the river now.
    ['affected-feeder', 'affected-main-glow', 'affected-main'].forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    });
    // Step 5 (haor basin fills) = real water clipped to the observed UNOSAT
    // satellite extent. Step 4 = the surge sim. Turn water off elsewhere.
    if (showSurge) waterLayerRef.current?.setSurge(1);
    else if (!isFloodScene) waterLayerRef.current?.setSurge(0);
    // The custom three.js water composites on a FLAT map; flatten terrain for it.
    if (typeof map.setTerrain === 'function') {
      try { map.setTerrain((showSurge || isFloodScene) ? null : { source: 'terrain', exaggeration: 1.75 }); } catch (e) { void e; }
    }
    // stat-only frame (no shipped polygon): keep the last real extent as a dim
    // reference so the map isn't empty, and signal it visually.
    if (!frame.floodExtent) {
      const noObservedPolygon = showMonsoon || showLift || showRainburst || showSurge;
      if (noObservedPolygon) src.setData(EMPTY_FC);
      map.setPaintProperty('flood-fill', 'fill-opacity', noObservedPolygon ? 0 : 0.16);
      map.setPaintProperty('flood-line', 'line-opacity', noObservedPolygon ? 0 : 0.4);
      return;
    }
    let fc = cacheRef.current[frame.floodExtent];
    if (!fc) {
      try {
        fc = await fetch(frame.floodExtent).then((r) => r.json());
        cacheRef.current[frame.floodExtent] = fc;
      } catch (err) {
        console.error('flood frame load failed', err);
        return;
      }
    }
    src.setData(fc);
    if (isFloodScene) {
      // Fill the real satellite extent with 3D water; keep only a thin glowing
      // outline of the measured boundary (no flat cyan fill).
      waterLayerRef.current?.setFloodExtent(fc);
      waterLayerRef.current?.setFlood(1);
      map.setPaintProperty('flood-fill', 'fill-opacity', 0);
      map.setPaintProperty('flood-line', 'line-color', '#9be7ff');
      map.setPaintProperty('flood-line', 'line-opacity', 0.55);
    } else {
      map.setPaintProperty('flood-fill', 'fill-opacity', 0.42);
      map.setPaintProperty('flood-line', 'line-color', '#67e8f9');
      map.setPaintProperty('flood-line', 'line-opacity', 0.9);
    }
  }

  // swap the flood polygon when the active date changes
  useEffect(() => { void applyFrame(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, frames]);

  // toggle the NASA rainfall layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => { if (map.getLayer('rain')) map.setLayoutProperty('rain', 'visibility', showRain ? 'visible' : 'none'); };
    if (map.isStyleLoaded()) apply(); else map.once('idle', apply);
  }, [showRain]);

  // Paint the active protocol's recommended locations as labelled pill markers
  // (same badge style as the infra markers). Clears + rebuilds on every change, so
  // switching tabs swaps the markers and a null layer clears them — without
  // touching the scene layers. Capped + de-cluttered by buildProtocolMarkers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    const clearPills = () => {
      protocolMarkersRef.current.forEach(({ marker }) => marker.remove());
      protocolMarkersRef.current = [];
    };
    // Idempotently tear down the de-confliction source + layers + click handler.
    const clearDeconf = () => {
      const m = mapRef.current;
      if (!m) return;
      if (deconfClickRef.current) {
        m.off('click', DECONF_FILL, deconfClickRef.current);
        deconfClickRef.current = null;
      }
      if (m.getLayer(DECONF_SELECTED)) m.removeLayer(DECONF_SELECTED);
      if (m.getLayer(DECONF_OUTLINE)) m.removeLayer(DECONF_OUTLINE);
      if (m.getLayer(DECONF_FILL)) m.removeLayer(DECONF_FILL);
      if (m.getSource(DECONF_SOURCE)) m.removeSource(DECONF_SOURCE);
    };

    const isDeconf = protocolId === 'deconfliction';

    const runDeconf = async () => {
      const m = mapRef.current;
      if (cancelled || !m || !protocolLayer) return;
      // Hide pills while the choropleth is active.
      clearPills();
      // Load + cache the district polygons.
      let geom = deconfGeomRef.current;
      if (!geom) {
        try {
          geom = await fetch(DECONF_GEOJSON_URL).then((r) => r.json());
          deconfGeomRef.current = geom;
        } catch (err) {
          console.warn('deconfliction districts load failed', err);
          return;
        }
      }
      if (cancelled || !mapRef.current || !geom) return;
      const joined = joinDeconf(geom, protocolLayer.data);
      const colorExpr = deconfColorExpr(protocolLayer.legend);
      // Update in place if already present, else add source + fill + outline.
      const existing = m.getSource(DECONF_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(joined);
        if (m.getLayer(DECONF_FILL)) m.setPaintProperty(DECONF_FILL, 'fill-color', colorExpr);
      } else {
        m.addSource(DECONF_SOURCE, { type: 'geojson', data: joined });
        m.addLayer({
          id: DECONF_FILL, type: 'fill', source: DECONF_SOURCE,
          paint: { 'fill-color': colorExpr, 'fill-opacity': 0.45 },
        });
        m.addLayer({
          id: DECONF_OUTLINE, type: 'line', source: DECONF_SOURCE,
          paint: { 'line-color': '#0b1220', 'line-width': 1, 'line-opacity': 0.6 },
        });
        // Bright outline for the currently-selected district (filtered in the
        // selectedKey effect). Starts matching nothing.
        m.addLayer({
          id: DECONF_SELECTED, type: 'line', source: DECONF_SOURCE,
          paint: { 'line-color': '#ffffff', 'line-width': 2.6, 'line-opacity': 0.95 },
          filter: ['==', ['get', 'district'], ' '],
        });
      }
      // Reflect any existing selection onto the freshly (re)built layer.
      if (m.getLayer(DECONF_SELECTED)) {
        m.setFilter(DECONF_SELECTED, ['==', ['get', 'district'], selectedKeyRef.current ?? ' ']);
      }
      // (Re)wire the click handler + hover cursor on the fill.
      if (deconfClickRef.current) m.off('click', DECONF_FILL, deconfClickRef.current);
      const onClick = (e: maplibregl.MapLayerMouseEvent) => {
        const feat = e.features && e.features[0];
        if (feat && feat.properties) selectTargetRef.current?.(feat.properties as Record<string, unknown>);
      };
      deconfClickRef.current = onClick;
      m.on('click', DECONF_FILL, onClick);
      m.on('mouseenter', DECONF_FILL, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', DECONF_FILL, () => { m.getCanvas().style.cursor = ''; });
    };

    const run = () => {
      const m = mapRef.current;
      if (cancelled || !m) return;
      // Switching away from / clearing the protocol always wipes both renderers.
      if (!protocolLayer) { clearPills(); clearDeconf(); return; }
      if (isDeconf) { void runDeconf(); return; }
      // Point protocol: remove any deconf fill, then (re)build the pills.
      clearDeconf();
      clearPills();
      const icon = PROTOCOL_ICON[protocolId ?? ''] ?? '📍';
      const selKey = selectedKeyRef.current;
      protocolMarkersRef.current = buildProtocolMarkers(protocolLayer).map((d, i) => {
        const key = markerKeyOf(d.props);
        const el = document.createElement('div');
        el.className = `syl-proto-marker${key && key === selKey ? ' is-selected' : ''}`;
        el.style.setProperty('--c', d.color);
        el.style.animationDelay = `${(i * 0.09).toFixed(2)}s`; // staggered pop-in
        el.innerHTML =
          `<span class="pm-dot"></span><span class="pm-ic">${icon}</span>` +
          `<b>${escapeHtml(d.title)}</b>` +
          (d.sub ? `<span class="pm-sub">${escapeHtml(d.sub)}</span>` : '');
        // Make pills clickable — emit the raw row props for this target. Use the
        // ref so the listener always calls the latest onSelectTarget.
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectTargetRef.current?.(d.props);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'left' }).setLngLat([d.lng, d.lat]).addTo(m);
        return { marker, el, key };
      });
    };
    if (loadedRef.current && map.isStyleLoaded()) run();
    else map.once('idle', run);
    return () => { cancelled = true; clearPills(); clearDeconf(); };
  }, [protocolLayer, protocolId]);

  // Highlight the selected/hovered target without rebuilding markers: toggle the
  // pill class, and filter the de-confliction selected-district outline.
  useEffect(() => {
    const map = mapRef.current;
    protocolMarkersRef.current.forEach(({ el, key }) => {
      el.classList.toggle('is-selected', !!key && key === selectedKey);
    });
    if (map && map.getLayer(DECONF_SELECTED)) {
      map.setFilter(DECONF_SELECTED, ['==', ['get', 'district'], selectedKey ?? ' ']);
    }
  }, [selectedKey]);

  // zIndex:0 gives the map (and all its HTML markers) its own stacking context, so
  // markers can NEVER paint over the UI boxes (scene bar, response panel, titlebar),
  // which all sit at z-index >= 4.
  return <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
}


























