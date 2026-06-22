import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';
import { BitmapLayer, ColumnLayer, IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { buildNeighborMask } from '../utils/neighborMask';
import { api } from '../services/api';
import type { EvacRoute, Facility, Hexagon, UserLocation } from '../types';
import type { FloodOverlaySettings } from './FloodOverlayControls';
import { type LayerCfg, opacityOf, rankOf } from './layers';
import { isFloodedAtTime, riskAtTime, riskLabel, tierOpacity } from '../utils/risk';
import { type RiskLens, RISK_LENSES, riskFactors, riskValue, riskColor, hazardOf } from '../utils/riskModel';

export interface CameraFocus {
  lng: number;
  lat: number;
  zoom: number;
}

type Bounds = [number, number, number, number];

interface GlobeProps {
  country: string;
  hexagons: Hexagon[];
  floodBounds: Bounds | null;
  overlay: FloodOverlaySettings;
  layers: LayerCfg[];
  riskLens: RiskLens;
  facilities: Facility[];
  userLocation: UserLocation | null;
  route: EvacRoute | null;
  selectedHex: Hexagon | null;
  onSelectHex: (h: Hexagon | null) => void;
  onSelectFacility: (f: Facility) => void;
  onMapClick: (lng: number, lat: number) => void;
  time: number;
  focus: CameraFocus | null;
}

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    labels: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
    },
    // Real elevation for the whole country — free AWS Terrarium DEM tiles (no API
    // key), the same source prep_waterlab_dem.py uses. Gives every part of
    // Bangladesh real hills and low spots, not just one city.
    /* terrain: {
      type: 'raster-dem',
      tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 10,
      attribution: 'Elevation © AWS Terrain Tiles / SRTM, Mapzen',
    }, */
    // Free, no-key vector tiles (OpenFreeMap) — used only for real 3D building
    // footprints extruded on top of the satellite + terrain.
    // openmaptiles is added lazily at city zoom to keep first load small.
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    },
    // Real NASA population overlay — SEDAC "Gridded Population of the World v4"
    // (2020 density), served as public WMTS tiles via NASA GIBS (no API key /
    // no Earthdata login). Toggled on from the overlay controls.
    sedac: {
      type: 'raster',
      tiles: ['https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPW_Population_Density_2020/default/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png'],
      tileSize: 256,
      maxzoom: 7,
      attribution: 'Population © NASA SEDAC / CIESIN — GPWv4, via NASA GIBS',
    },
  },
  // Drape the satellite imagery over real 3D terrain geometry.
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#06121c' } },
    { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 0.1 } },
    // subtle relief shading so the flat delta still reads as 3D
    /* {
      id: 'hillshade',
      type: 'hillshade',
      source: 'terrain-hillshade',
      paint: {
        'hillshade-exaggeration': 0.35,
        'hillshade-shadow-color': '#04121f',
        'hillshade-highlight-color': '#dCEBFF',
      },
    }, */
    { id: 'scrim', type: 'background', paint: { 'background-color': '#04101a', 'background-opacity': 0.2 } },
    // NASA SEDAC population density (hidden until toggled on)
    { id: 'sedac-pop', type: 'raster', source: 'sedac', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } },
  ],
};

const CENTER: [number, number] = [90.36, 23.7];
const INITIAL_ZOOM = 7.5;
const BANGLADESH_MAX_BOUNDS: [[number, number], [number, number]] = [[87.65, 20.2], [93.15, 27.1]];
const TIERS = ['4h', '20h', '7d'] as const;
const NATIONAL_WATER_OPACITY = 0.38;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function facilityColor(f: Facility): [number, number, number, number] {
  if (f.type === 'clinic') return f.at_risk ? [220, 58, 70, 220] : [70, 185, 205, 205];
  return f.at_risk ? [218, 126, 44, 220] : [222, 184, 82, 205];
}

function facilityRoofColor(f: Facility): [number, number, number, number] {
  if (f.type === 'clinic') return f.at_risk ? [255, 176, 184, 235] : [230, 252, 255, 225];
  return f.at_risk ? [255, 205, 126, 235] : [92, 156, 214, 225];
}

function humanTerrainScore(hex: Hexagon, risk: number) {
  const clinicGap = hex.nearest_clinic_m == null ? 0.65 : clamp01(hex.nearest_clinic_m / 30000);
  const serviceGap = clamp01((clinicGap + (hex.nearby_clinics ? 0 : 0.7) + (hex.nearby_schools ? 0 : 0.35)) / 2.05);
  const uncertainty = clamp01(hex.uncertainty);
  return clamp01((risk * 0.32) + (serviceGap * 0.34) + (uncertainty * 0.18) + (hex.population_u5 > 5000 ? 0.16 : 0.08));
}

// Iconic "population spikes" map (cf. Kontur / Topi Tjukanov): a dense field of
// thin needles over real TOTAL population (WorldPop ppp, ~550 m cells). Height +
// colour both encode population, so cities erupt into sharp glowing peaks over a
// near-flat rural carpet. One spike = [lng, lat, total_population].
export type Spike = [number, number, number, number, number, number]; // lng, lat, pop, poverty(0..1), rwi, rwi_err
const SPIKE_BASE_M = 30;     // near-flat rural floor → cities clearly tower
const SPIKE_MAX_M = 20000;   // tallest cell ~20 km → dramatic, readable height

// Lighting rig: low ambient + strong directional key so tower faces shade
// distinctly from tops → solid 3D read. Fill light softens the shadow side.
// (_shadow is best-effort under interleaved overlay; the directional contrast
// alone carries the 3D look even if cast shadows don't render.)
// Gentle rig: high ambient preserves the data colour (Inferno = height), a soft
// directional key just adds 3D shading on the sides. Keeping total intensity ~1
// avoids blowing colour channels out to yellow/green.
const ambientLight = new AmbientLight({ color: [255, 255, 255], intensity: 1.0 });
const keyLight = new DirectionalLight({
  color: [255, 250, 240],
  intensity: 0.6,
  direction: [-1, -3, -1],
});
const fillLight = new DirectionalLight({
  color: [220, 235, 255],
  intensity: 0.25,
  direction: [2, -1, 1],
});
const lightingEffect = new LightingEffect({ ambientLight, keyLight, fillLight });
// "Inferno" ramp (low → high): near-black → purple → magenta → red → orange →
// amber → near-white. Brightness rises MONOTONICALLY with height, so a tall
// spike glows white and a short one is almost black — you read height as
// brightness even looking straight down. This is the key to legibility.
const HEAT: Array<[number, number, number]> = [
  [4, 2, 18],
  [40, 11, 84],
  [101, 21, 110],
  [159, 42, 99],
  [212, 72, 66],
  [245, 125, 21],
  [250, 193, 39],
  [255, 252, 190],
];

function spikeHeatColor(t: number): [number, number, number] {
  const x = clamp01(t) * (HEAT.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = HEAT[i];
  const b = HEAT[Math.min(i + 1, HEAT.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

// √ scale so dense cities tower while the rural carpet stays low and readable.
function spikeHeight(pop: number, maxPop: number) {
  return SPIKE_BASE_M + Math.sqrt(clamp01(pop / maxPop)) * SPIKE_MAX_M;
}

// Wealth ramp for the poverty overlay: green (better-off) → yellow → red (poorer).
// Input v = modeled poverty 0..1 (1 = poorest, from Meta RWI).
const WEALTH: Array<[number, number, number]> = [
  [42, 170, 92],
  [140, 200, 70],
  [240, 220, 60],
  [240, 150, 45],
  [214, 50, 40],
];

function povertyColor(v: number): [number, number, number] {
  const x = clamp01(v) * (WEALTH.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = WEALTH[i];
  const b = WEALTH[Math.min(i + 1, WEALTH.length - 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export default function Globe({
  country, hexagons, floodBounds, overlay, layers: layerCfg, riskLens, facilities, userLocation, route,
  selectedHex, onSelectHex, onSelectFacility, onMapClick, time, focus,
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; hex: Hexagon; risk: number; mode: 'flood' | 'human' } | null>(null);
  const [spikeTip, setSpikeTip] = useState<{ x: number; y: number; s: Spike } | null>(null);
  const [mapZoom, setMapZoom] = useState(INITIAL_ZOOM);
  const cb = useRef({ onSelectHex, onSelectFacility, onMapClick });
  cb.current = { onSelectHex, onSelectFacility, onMapClick };
  const humanTerrainRef = useRef(overlay.showHumanTerrain || overlay.showPoverty);
  humanTerrainRef.current = overlay.showHumanTerrain || overlay.showPoverty;

  const floodedHexagons = useMemo(
    () => hexagons.filter((h) => isFloodedAtTime(h, time)),
    [hexagons, time],
  );

  // standing nationwide risk grid: every cell that could flood (return-period
  // hazard), independent of the event timeline.
  const maxU5 = useMemo(() => Math.max(1, ...hexagons.map((h) => h.population_u5)), [hexagons]);
  const riskCells = useMemo(() => hexagons.filter((h) => hazardOf(h) > 0.05), [hexagons]);

  const [spikeData, setSpikeData] = useState<{ spikes: Spike[]; max: number }>({ spikes: [], max: 1 });
  useEffect(() => {
    let cancelled = false;
    fetch('/data/population_spikes_Bangladesh.json')
      .then((r) => r.json())
      .then((d: { spikes: Spike[]; max: number }) => {
        if (!cancelled) setSpikeData({ spikes: d.spikes, max: Math.max(1, d.max) });
      })
      .catch((err) => console.error('population spikes load failed', err));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 60,
      bearing: 0,
      maxPitch: 70,
      maxBounds: BANGLADESH_MAX_BOUNDS,
      minZoom: 5.9,
      attributionControl: { compact: true },
    });
    map.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    const deck = new MapboxOverlay({ interleaved: true, layers: [], effects: [lightingEffect] });
    map.addControl(deck as unknown as maplibregl.IControl);

    map.on('load', () => {
      if (!map.getLayer('buildings-3d')) {
        try {
          map.addLayer({
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
          });
        } catch (err) { console.error('building layer failed', err); }
      }
      // Real 3D buildings — OpenFreeMap vector footprints extruded on the
      // terrain. Zoom-gated so the national view stays fast; they appear as you
      // zoom into any town/city, not just Sirajganj.
      // Tint neighbouring countries (India / Myanmar / Bay of Bengal) faint blue
      // so Bangladesh pops — a world-minus-Bangladesh mask built from the adm0
      // boundary.
      fetch('/bgd_adm0.geojson')
        .then((r) => r.json())
        .then((adm0) => {
          if (map.getSource('neighbors')) return;
          map.addSource('neighbors', { type: 'geojson', data: buildNeighborMask(adm0) });
          map.addLayer({
            id: 'outside-bangladesh-mask',
            type: 'fill',
            source: 'neighbors',
            paint: { 'fill-color': '#02070d', 'fill-opacity': 0.68 },
          }, 'buildings-3d');
        })
        .catch((err) => console.error('neighbor tint failed', err));

      if (!map.getLayer('labels')) {
        map.addLayer({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } });
      }
      // Population-spikes mode wants a dark map so the spikes read as city lights.
      if (map.getLayer('satellite')) {
        map.setPaintProperty('satellite', 'raster-opacity', humanTerrainRef.current ? 0.1 : 1);
      }
      if (map.getLayer('labels')) {
        map.setPaintProperty('labels', 'raster-opacity', humanTerrainRef.current ? 0.25 : 0.85);
      }
    });

    const updateZoom = () => setMapZoom(map.getZoom());
    map.on('zoomend', updateZoom);
    map.on('moveend', updateZoom);

    map.on('click', (e) => {
      const picked = deck.pickObject({
        x: e.point.x,
        y: e.point.y,
        radius: 10,
        layerIds: ['human-settlements', 'flood-hexagons', 'facility-rings', 'clinic-roofs', 'school-roofs', 'clinic-buildings', 'school-buildings'],
      });
      if ((picked?.layer?.id === 'human-settlements' || picked?.layer?.id === 'flood-hexagons') && picked.object) {
        cb.current.onSelectHex(picked.object as Hexagon);
        return;
      }
      if (picked?.layer?.id === 'facility-rings' || picked?.layer?.id?.includes('clinic') || picked?.layer?.id?.includes('school')) {
        if (!picked.object) return;
        cb.current.onSelectFacility(picked.object as Facility);
        return;
      }
      cb.current.onSelectHex(null);
      cb.current.onMapClick(e.lngLat.lng, e.lngLat.lat);
    });

    mapRef.current = map;
    overlayRef.current = deck;
    return () => {
      map.off('zoomend', updateZoom);
      map.off('moveend', updateZoom);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // Dim the satellite basemap while the population spikes are on, so the dark
  // background reads as night and the spikes glow like city lights. (Initial dim
  // is applied in the map 'load' handler above; this handles later toggles.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const dark = overlay.showHumanTerrain || overlay.showPoverty;
    if (map.getLayer('satellite')) {
      map.setPaintProperty('satellite', 'raster-opacity', dark ? 0.1 : 1);
    }
    if (map.getLayer('labels')) {
      map.setPaintProperty('labels', 'raster-opacity', dark ? 0.25 : 0.85);
    }
  }, [overlay.showHumanTerrain, overlay.showPoverty]);

  useEffect(() => {
    const deck = overlayRef.current;
    if (!deck) return;

    const tierOp = tierOpacity(time);
    const zoomOk = mapZoom < 10.7;
    const spikesAlpha = opacityOf(layerCfg, 'spikes');
    const povertyAlpha = opacityOf(layerCfg, 'poverty');
    // Population spikes: ~450k thin 3D needles over real total population (WorldPop).
    // Height + Inferno colour both encode people — cities erupt into glowing peaks.
    const humanBlockLayer = overlay.showHumanTerrain && spikeData.spikes.length
      ? new ColumnLayer<Spike>({
          id: 'population-spikes',
          data: spikeData.spikes,
          visible: overlay.showHumanTerrain && zoomOk,
          pickable: true,
          extruded: true,
          filled: true,
          stroked: false,
          // needles: ~210 m radius vs ~550 m cell spacing → sharp but visible spikes.
          diskResolution: 4,
          radius: 210,
          angle: 0,
          elevationScale: 1,
          getPosition: (d) => [d[0], d[1]],
          getElevation: (d) => spikeHeight(d[2], spikeData.max),
          getFillColor: (d) => {
            // log scale: population is hugely skewed, so log spreads rural→city
            // across the whole ramp (rural purple, towns orange, cities white).
            const t = Math.log1p(d[2]) / Math.log1p(spikeData.max);
            const [r, g, b] = spikeHeatColor(clamp01(t));
            return [r, g, b, Math.round(255 * spikesAlpha)]; // opacity baked into alpha → real fade
          },
          material: { ambient: 0.7, diffuse: 0.5, shininess: 10, specularColor: [40, 40, 40] },
          updateTriggers: { getElevation: [spikeData.max], getFillColor: [spikeData.max, spikesAlpha] },
        })
      : null;

    // Poverty: its own FLAT ground layer (green→red modeled wealth, Meta RWI),
    // so it stacks under/with the 3D spikes. Cell-filling disks form a choropleth.
    const povertyLayer = overlay.showPoverty && spikeData.spikes.length
      ? new ColumnLayer<Spike>({
          id: 'poverty-flat',
          data: spikeData.spikes,
          visible: overlay.showPoverty && zoomOk,
          pickable: true,
          extruded: false,
          filled: true,
          stroked: false,
          diskResolution: 4,
          radius: 300, // fills the ~557 m cell → continuous green→red carpet
          angle: 0,
          getPosition: (d) => [d[0], d[1]],
          getFillColor: (d) => {
            const [r, g, b] = povertyColor(d[3]); // green (richer) → red (poorer)
            return [r, g, b, Math.round(255 * povertyAlpha)];
          },
          updateTriggers: { getFillColor: [povertyAlpha] },
        })
      : null;

    const floodLayers = overlay.showRiverExtent && floodBounds
      ? TIERS.map((tier) => new BitmapLayer({
          id: `flood-${tier}`,
          image: api.floodImageUrl(country, tier),
          bounds: floodBounds,
          opacity: tierOp[tier] * NATIONAL_WATER_OPACITY * opacityOf(layerCfg, 'floodExtent'),
          desaturate: 0,
          pickable: false,
        }))
      : [];

    const hexLayer = overlay.showFloodCells && riskCells.length
      ? new H3HexagonLayer<Hexagon>({
          id: 'flood-hexagons',
          data: riskCells,
          opacity: opacityOf(layerCfg, 'riskGrid'),
          pickable: true,
          stroked: true,
          filled: true,
          extruded: false,
          wireframe: false,
          highPrecision: false,
          getHexagon: (d) => d.h3_id,
          getFillColor: (d) => {
            // colour by the chosen risk lens (overall / hazard / exposure / …)
            const v = riskValue(riskFactors(d, maxU5), riskLens);
            const [r, g, b] = riskColor(v);
            const selected = selectedHex?.h3_id === d.h3_id;
            const hovered = hoveredId === d.h3_id;
            if (selected) return [255, 240, 150, 255];
            const a = hovered ? 240 : Math.round(60 + 180 * v); // higher risk = more opaque
            return [r, g, b, a];
          },
          getLineColor: (d) => {
            if (selectedHex?.h3_id === d.h3_id) return [255, 255, 255, 230];
            if (hoveredId === d.h3_id) return [255, 255, 255, 200];
            return [255, 255, 255, 35];
          },
          getLineWidth: (d) => (selectedHex?.h3_id === d.h3_id ? 2.5 : 1),
          lineWidthUnits: 'pixels',
          updateTriggers: {
            getFillColor: [riskLens, maxU5, selectedHex?.h3_id, hoveredId],
            getLineColor: [selectedHex?.h3_id, hoveredId],
            getLineWidth: [selectedHex?.h3_id],
          },
        })
      : null;

    const clinicFacilities = facilities.filter((f) => f.type === 'clinic');
    const schoolFacilities = facilities.filter((f) => f.type === 'school');
    // only the enabled types, for the dot/ring layer (so dots show at any zoom)
    const shownFacilities = facilities.filter(
      (f) => (f.type === 'clinic' && overlay.showClinics) || (f.type === 'school' && overlay.showSchools),
    );

    const facilityRings = new ScatterplotLayer<Facility>({
      id: 'facility-rings',
      data: shownFacilities,
      radiusMinPixels: 3.5,
      radiusMaxPixels: 16,
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: 'meters',
      lineWidthUnits: 'pixels',
      getPosition: (d) => [d.lng, d.lat],
      getRadius: (d) => d.at_risk ? 118 : 92,
      getFillColor: (d) => {
        const c = facilityColor(d); // clinics cyan/red, schools amber/orange — solid dots
        return [c[0], c[1], c[2], 235];
      },
      getLineColor: [255, 255, 255, 150],
      getLineWidth: 0.6,
      parameters: { depthCompare: 'always' }, // float dots on top of the 3D spikes (luma v9)
    });

    const clinicBuildings = new ColumnLayer<Facility>({
      id: 'clinic-buildings',
      data: clinicFacilities,
      opacity: opacityOf(layerCfg, 'clinics'),
      pickable: true,
      diskResolution: 8,
      radius: 48,
      extruded: true,
      stroked: true,
      filled: true,
      elevationScale: 1,
      getPosition: (d) => [d.lng, d.lat],
      getElevation: (d) => (d.at_risk ? 250 : 190),
      getFillColor: facilityColor,
      getLineColor: (d) => d.at_risk ? [255, 235, 235, 255] : [110, 215, 255, 230],
      getLineWidth: 1.2,
      lineWidthUnits: 'pixels',
      material: { ambient: 0.38, diffuse: 0.62, shininess: 42, specularColor: [255, 255, 255] },
    });

    const clinicRoofs = new ColumnLayer<Facility>({
      id: 'clinic-roofs',
      data: clinicFacilities,
      opacity: opacityOf(layerCfg, 'clinics'),
      pickable: true,
      diskResolution: 4,
      radius: 23,
      extruded: true,
      stroked: false,
      filled: true,
      elevationScale: 1,
      getPosition: (d) => [d.lng, d.lat],
      getElevation: (d) => (d.at_risk ? 325 : 255),
      getFillColor: facilityRoofColor,
      material: { ambient: 0.45, diffuse: 0.6, shininess: 70, specularColor: [255, 255, 255] },
    });

    const schoolBuildings = new ColumnLayer<Facility>({
      id: 'school-buildings',
      data: schoolFacilities,
      opacity: opacityOf(layerCfg, 'schools'),
      pickable: true,
      diskResolution: 4,
      radius: 50,
      extruded: true,
      stroked: true,
      filled: true,
      elevationScale: 1,
      getPosition: (d) => [d.lng, d.lat],
      getElevation: (d) => (d.at_risk ? 210 : 155),
      getFillColor: facilityColor,
      getLineColor: (d) => d.at_risk ? [255, 230, 170, 245] : [255, 245, 190, 220],
      getLineWidth: 1.1,
      lineWidthUnits: 'pixels',
      material: { ambient: 0.42, diffuse: 0.58, shininess: 35, specularColor: [255, 242, 190] },
    });

    const schoolRoofs = new ColumnLayer<Facility>({
      id: 'school-roofs',
      data: schoolFacilities,
      opacity: opacityOf(layerCfg, 'schools'),
      pickable: true,
      diskResolution: 3,
      radius: 25,
      extruded: true,
      stroked: false,
      filled: true,
      elevationScale: 1,
      getPosition: (d) => [d.lng, d.lat],
      getElevation: (d) => (d.at_risk ? 282 : 218),
      getFillColor: facilityRoofColor,
      material: { ambient: 0.45, diffuse: 0.58, shininess: 55, specularColor: [255, 255, 255] },
    });

    // Assemble in user-chosen stacking order. Panel index 0 = top of the stack;
    // deck draws later array items on top, so we sort by DESCENDING rank (top last).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups: { rank: number; items: any[] }[] = [
      { rank: rankOf(layerCfg, 'spikes'), items: [humanBlockLayer] },
      { rank: rankOf(layerCfg, 'poverty'), items: [povertyLayer] },
      { rank: rankOf(layerCfg, 'riskGrid'), items: [hexLayer] },
      { rank: rankOf(layerCfg, 'floodExtent'), items: floodLayers },
      { rank: rankOf(layerCfg, 'clinics'), items: overlay.showClinics ? [clinicBuildings, clinicRoofs] : [] },
      { rank: rankOf(layerCfg, 'schools'), items: overlay.showSchools ? [schoolBuildings, schoolRoofs] : [] },
    ];
    groups.sort((a, b) => b.rank - a.rank);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any[] = groups.flatMap((g) => g.items).filter(Boolean);
    // facility dots/rings always ride on top (visible at any zoom) when either type is on
    if (overlay.showClinics || overlay.showSchools) layers.push(facilityRings);

    if (route) {
      layers.push(new PathLayer<EvacRoute>({
        id: 'route',
        data: [route],
        getPath: (d) => d.path,
        getColor: route.mode === 'road' ? [0, 229, 255, 235] : [255, 213, 10, 235],
        getWidth: 6,
        widthUnits: 'pixels',
        widthMinPixels: 4,
        capRounded: true,
        jointRounded: true,
      }));
    }
    if (userLocation) {
      layers.push(new IconLayer<UserLocation>({
        id: 'user',
        data: [userLocation],
        getPosition: (d) => [d.lng, d.lat],
        getIcon: () => ({ url: '/m-user.png', width: 128, height: 128, anchorY: 64 }),
        getSize: 40,
        sizeUnits: 'pixels',
      }));
    }

    deck.setProps({
      layers,
      getCursor: (state) => {
        const s = state as { layer?: { id?: string }; object?: unknown };
        if (s.layer?.id === 'human-settlements' && s.object) return 'pointer';
        if ((s.layer?.id === 'population-spikes' || s.layer?.id === 'poverty-flat') && s.object) return 'pointer';
        if (s.layer?.id === 'flood-hexagons' && s.object) return 'pointer';
        if ((s.layer?.id === 'facility-rings' || s.layer?.id?.includes('clinic') || s.layer?.id?.includes('school')) && s.object) return 'pointer';
        return 'crosshair';
      },
      onHover: (info) => {
        if ((info.layer?.id === 'population-spikes' || info.layer?.id === 'poverty-flat') && info.object) {
          setSpikeTip({ x: info.x, y: info.y, s: info.object as Spike });
          setTooltip(null);
          return;
        }
        setSpikeTip(null);
        if ((info.layer?.id === 'human-settlements' || info.layer?.id === 'flood-hexagons') && info.object) {
          const hex = info.object as Hexagon;
          setHoveredId(hex.h3_id);
          setTooltip({
            x: info.x,
            y: info.y,
            hex,
            risk: riskAtTime(hex, time),
            mode: info.layer.id === 'human-settlements' ? 'human' : 'flood',
          });
        } else {
          setHoveredId(null);
          setTooltip(null);
        }
      },
    });
  }, [
    country, floodBounds, overlay, layerCfg, riskLens, riskCells, maxU5, floodedHexagons, facilities, route, userLocation,
    time, selectedHex, hoveredId, spikeData, mapZoom,
  ]);

  useEffect(() => {
    if (focus && mapRef.current) {
      mapRef.current.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 1500, essential: true });
    }
  }, [focus]);

  // toggle the NASA SEDAC population overlay from the overlay controls
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer('sedac-pop')) {
        map.setLayoutProperty('sedac-pop', 'visibility', overlay.showPopulation ? 'visible' : 'none');
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('idle', apply);
  }, [overlay.showPopulation]);

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {tooltip && (
        <div
          className="map-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          {tooltip.mode === 'human' ? (
            <>
              <strong>Human terrain</strong>
              <span>{tooltip.hex.district}</span>
              <span>{tooltip.hex.population_u5.toLocaleString()} children under 5</span>
              <span>Vulnerability {Math.round(humanTerrainScore(tooltip.hex, tooltip.risk) * 100)}%</span>
              <span>Evidence confidence {Math.round((1 - clamp01(tooltip.hex.uncertainty)) * 100)}%</span>
              <span className="map-tooltip-hint">Click for evidence chain</span>
            </>
          ) : (() => {
            const f = riskFactors(tooltip.hex, maxU5);
            return (
              <>
                <strong>{riskLabel(f.overall)} risk · {Math.round(f.overall * 100)}%</strong>
                <span>{tooltip.hex.district}</span>
                <span>Flood hazard {Math.round(f.hazard * 100)}%</span>
                <span>{tooltip.hex.population_u5.toLocaleString()} under-5 exposed</span>
                <span>Access cut-off {Math.round(f.access * 100)}% · service gap {Math.round(f.service * 100)}%</span>
                <span className="map-tooltip-hint">Click for full evidence</span>
              </>
            );
          })()}
        </div>
      )}
      {spikeTip && (
        <div className="map-tooltip" style={{ left: spikeTip.x + 14, top: spikeTip.y + 14 }}>
          <strong>{spikeTip.s[2].toLocaleString()} people</strong>
          <span>in this ~0.3 km² cell</span>
          <span>Wealth (RWI): {spikeTip.s[4].toFixed(2)} ± {spikeTip.s[5].toFixed(2)}</span>
          <span>
            Poverty {Math.round(spikeTip.s[3] * 100)}% —{' '}
            {spikeTip.s[3] >= 0.66 ? 'poorer area' : spikeTip.s[3] <= 0.33 ? 'wealthier area' : 'middle'}
          </span>
          <span className="map-tooltip-hint">Meta RWI · modeled, ~2.4 km tile</span>
        </div>
      )}
      {(overlay.showPopulation || overlay.showFloodCells || overlay.showRiverExtent || ((overlay.showHumanTerrain || overlay.showPoverty) && mapZoom < 10.7)) && (
        <div className="map-legend-stack">
          {overlay.showFloodCells && (
            <div className="human-terrain-key">
              <div className="htk-title">Flood risk</div>
              <div className="htk-row htk-sub">where could be hit · colour = {RISK_LENSES.find((r) => r.id === riskLens)?.label ?? 'risk'}</div>
              <div className="htk-row"><i style={{ background: '#285a78', color: '#285a78' }} /> low</div>
              <div className="htk-row"><i style={{ background: '#78aa78', color: '#78aa78' }} /> moderate</div>
              <div className="htk-row"><i style={{ background: '#f0dc46', color: '#f0dc46' }} /> high</div>
              <div className="htk-row"><i style={{ background: '#f28c28', color: '#f28c28' }} /> severe</div>
              <div className="htk-row"><i style={{ background: '#d62826', color: '#d62826' }} /> extreme</div>
              <div className="htk-row htk-sub">hover a cell for the “why” breakdown</div>
            </div>
          )}
          {overlay.showRiverExtent && (
            <div className="human-terrain-key">
              <div className="htk-title">Flood extent</div>
              <div className="htk-row htk-sub">GloFAS inundation · rp10 → rp100 → rp500</div>
              <div className="htk-row"><i style={{ background: '#7acdff', color: '#7acdff' }} /> shallow / fringe inundation</div>
              <div className="htk-row"><i style={{ background: '#2c84e8', color: '#2c84e8' }} /> moderate depth</div>
              <div className="htk-row"><i style={{ background: '#163a96', color: '#163a96' }} /> deepest / persistent water</div>
            </div>
          )}
          {overlay.showPopulation && (
            <div className="human-terrain-key">
              <div className="htk-title">Population density</div>
              <div className="htk-row htk-sub">NASA SEDAC · GPWv4 (2020) · persons / km²</div>
              <div className="htk-row"><i style={{ background: '#fff2d1', color: '#fff2d1' }} /> &lt;1 — uninhabited</div>
              <div className="htk-row"><i style={{ background: '#fab855', color: '#fab855' }} /> ~10–25 — rural / villages</div>
              <div className="htk-row"><i style={{ background: '#fc933f', color: '#fc933f' }} /> ~150–250 — dense towns</div>
              <div className="htk-row"><i style={{ background: '#f03b20', color: '#f03b20' }} /> ~500–750 — urban</div>
              <div className="htk-row"><i style={{ background: '#bd0026', color: '#bd0026' }} /> 1000+ — city cores</div>
            </div>
          )}
          {overlay.showHumanTerrain && !overlay.showPoverty && mapZoom < 10.7 && (
            <div className="human-terrain-key">
              <div className="htk-title">Population (3D)</div>
              <div className="htk-row htk-sub">WorldPop 2020 · people per ~0.3 km² cell · taller &amp; brighter = more people</div>
              <div className="htk-row"><i style={{ background: '#280b54', color: '#280b54' }} /> ~50–200 — sparse / rural</div>
              <div className="htk-row"><i style={{ background: '#9f2a63', color: '#9f2a63' }} /> ~500–2,000 — villages</div>
              <div className="htk-row"><i style={{ background: '#f57d15', color: '#f57d15' }} /> ~5,000–15,000 — towns</div>
              <div className="htk-row"><i style={{ background: '#fffcbe', color: '#fffcbe' }} /> 30,000+ — city cores (Dhaka)</div>
            </div>
          )}
          {overlay.showPoverty && mapZoom < 10.7 && (
            <div className="human-terrain-key">
              <div className="htk-title">Poverty / wealth</div>
              <div className="htk-row htk-sub">Modeled relative wealth (Meta RWI) — a proxy for housing quality &amp; assets, not any one household. Height still = people, so tall + red = many vulnerable people.</div>
              <div className="htk-row"><i style={{ background: '#2aaa5c', color: '#2aaa5c' }} /> green = wealthier — sturdier housing, more able to cope</div>
              <div className="htk-row"><i style={{ background: '#f0dc3c', color: '#f0dc3c' }} /> yellow = middle</div>
              <div className="htk-row"><i style={{ background: '#d63228', color: '#d63228' }} /> red = poorer — likely weaker housing, fewer resources to recover</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
