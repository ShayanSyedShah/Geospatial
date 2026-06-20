import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { BitmapLayer, IconLayer, PathLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { buildNeighborMask } from '../utils/neighborMask';
import { api } from '../services/api';
import type { EvacRoute, Facility, Hexagon, UserLocation } from '../types';
import type { FloodOverlaySettings } from './FloodOverlayControls';
import { hexFloodColor, isFloodedAtTime, riskAtTime, riskLabel, tierOpacity } from '../utils/risk';

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
    { id: 'satellite', type: 'raster', source: 'satellite' },
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
const INITIAL_ZOOM = 6.3;
const BANGLADESH_MAX_BOUNDS: [[number, number], [number, number]] = [[87.65, 20.2], [93.15, 27.1]];
const TIERS = ['4h', '20h', '7d'] as const;
const NATIONAL_WATER_OPACITY = 0.38;
const iconUrl = (f: Facility) => `/m-${f.type}${f.at_risk ? '-risk' : ''}.png`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function humanTerrainScore(hex: Hexagon, risk: number) {
  const clinicGap = hex.nearest_clinic_m == null ? 0.65 : clamp01(hex.nearest_clinic_m / 30000);
  const serviceGap = clamp01((clinicGap + (hex.nearby_clinics ? 0 : 0.7) + (hex.nearby_schools ? 0 : 0.35)) / 2.05);
  const uncertainty = clamp01(hex.uncertainty);
  return clamp01((risk * 0.32) + (serviceGap * 0.34) + (uncertainty * 0.18) + (hex.population_u5 > 5000 ? 0.16 : 0.08));
}

function humanTerrainColor(score: number, confidence: number, selected: boolean, hovered: boolean): [number, number, number, number] {
  const alpha = selected || hovered ? 235 : 196;
  if (confidence < 0.55) return [170, 105, 255, alpha];
  if (score > 0.72) return [255, 77, 92, alpha];
  if (score > 0.52) return [255, 151, 64, alpha];
  if (score > 0.34) return [255, 210, 90, alpha];
  return [76, 196, 255, alpha];
}

export default function Globe({
  country, hexagons, floodBounds, overlay, facilities, userLocation, route,
  selectedHex, onSelectHex, onSelectFacility, onMapClick, time, focus,
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; hex: Hexagon; risk: number; mode: 'flood' | 'human' } | null>(null);
  const cb = useRef({ onSelectHex, onSelectFacility, onMapClick });
  cb.current = { onSelectHex, onSelectFacility, onMapClick };

  const floodedHexagons = useMemo(
    () => hexagons.filter((h) => isFloodedAtTime(h, time)),
    [hexagons, time],
  );

  const maxHumanPopulation = useMemo(
    () => Math.max(1, ...hexagons.map((h) => h.population_u5)),
    [hexagons],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 55,
      bearing: 0,
      maxPitch: 70,
      maxBounds: BANGLADESH_MAX_BOUNDS,
      minZoom: 5.9,
      attributionControl: { compact: true },
    });
    map.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    const deck = new MapboxOverlay({ interleaved: true, layers: [] });
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
    });

    map.on('click', (e) => {
      const picked = deck.pickObject({
        x: e.point.x,
        y: e.point.y,
        radius: 10,
        layerIds: ['human-terrain', 'flood-hexagons', 'facilities'],
      });
      if ((picked?.layer?.id === 'human-terrain' || picked?.layer?.id === 'flood-hexagons') && picked.object) {
        cb.current.onSelectHex(picked.object as Hexagon);
        return;
      }
      if (picked?.layer?.id === 'facilities' && picked.object) {
        cb.current.onSelectFacility(picked.object as Facility);
        return;
      }
      cb.current.onSelectHex(null);
      cb.current.onMapClick(e.lngLat.lng, e.lngLat.lat);
    });

    mapRef.current = map;
    overlayRef.current = deck;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const deck = overlayRef.current;
    if (!deck) return;

    const tierOp = tierOpacity(time);
    const humanLayer = overlay.showHumanTerrain && hexagons.length
      ? new H3HexagonLayer<Hexagon>({
          id: 'human-terrain',
          data: hexagons,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: true,
          wireframe: false,
          highPrecision: false,
          getHexagon: (d) => d.h3_id,
          getElevation: (d) => {
            const normalized = Math.log1p(d.population_u5) / Math.log1p(maxHumanPopulation);
            return Math.max(80, normalized * 7600);
          },
          getFillColor: (d) => {
            const risk = riskAtTime(d, time);
            const confidence = 1 - clamp01(d.uncertainty);
            return humanTerrainColor(
              humanTerrainScore(d, risk),
              confidence,
              selectedHex?.h3_id === d.h3_id,
              hoveredId === d.h3_id,
            );
          },
          getLineColor: (d) => {
            if (selectedHex?.h3_id === d.h3_id) return [255, 255, 255, 240];
            if (hoveredId === d.h3_id) return [210, 244, 255, 220];
            const confidence = 1 - clamp01(d.uncertainty);
            return confidence < 0.55 ? [195, 145, 255, 180] : [255, 255, 255, 55];
          },
          getLineWidth: (d) => (selectedHex?.h3_id === d.h3_id ? 2.5 : 0.8),
          lineWidthUnits: 'pixels',
          material: {
            ambient: 0.34,
            diffuse: 0.62,
            shininess: 28,
            specularColor: [120, 160, 190],
          },
          updateTriggers: {
            getElevation: [maxHumanPopulation],
            getFillColor: [time, selectedHex?.h3_id, hoveredId],
            getLineColor: [selectedHex?.h3_id, hoveredId],
            getLineWidth: [selectedHex?.h3_id],
          },
        })
      : null;

    const floodLayers = overlay.showRiverExtent && floodBounds
      ? TIERS.map((tier) => new BitmapLayer({
          id: `flood-${tier}`,
          image: api.floodImageUrl(country, tier),
          bounds: floodBounds,
          opacity: tierOp[tier] * NATIONAL_WATER_OPACITY,
          desaturate: 0,
          pickable: false,
        }))
      : [];

    const hexLayer = overlay.showFloodCells && floodedHexagons.length
      ? new H3HexagonLayer<Hexagon>({
          id: 'flood-hexagons',
          data: floodedHexagons,
          pickable: true,
          stroked: true,
          filled: true,
          extruded: false,
          wireframe: false,
          highPrecision: false,
          getHexagon: (d) => d.h3_id,
          getFillColor: (d) => {
            const risk = riskAtTime(d, time);
            const selected = selectedHex?.h3_id === d.h3_id;
            const hovered = hoveredId === d.h3_id;
            return hexFloodColor(risk, selected, hovered);
          },
          getLineColor: (d) => {
            if (selectedHex?.h3_id === d.h3_id) return [255, 255, 255, 230];
            if (hoveredId === d.h3_id) return [180, 230, 255, 200];
            return [255, 255, 255, 60];
          },
          getLineWidth: (d) => (selectedHex?.h3_id === d.h3_id ? 2.5 : 1),
          lineWidthUnits: 'pixels',
          updateTriggers: {
            getFillColor: [time, selectedHex?.h3_id, hoveredId],
            getLineColor: [selectedHex?.h3_id, hoveredId],
            getLineWidth: [selectedHex?.h3_id],
          },
        })
      : null;

    const facLayer = new IconLayer<Facility>({
      id: 'facilities',
      data: facilities,
      pickable: true,
      getPosition: (d) => [d.lng, d.lat],
      getIcon: (d) => ({ url: iconUrl(d), width: 128, height: 128, anchorY: 128 }),
      getSize: 34,
      sizeUnits: 'pixels',
      sizeMinPixels: 20,
      sizeMaxPixels: 46,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layers: any[] = [humanLayer, ...floodLayers, hexLayer, facLayer].filter(Boolean);

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
        if (s.layer?.id === 'human-terrain' && s.object) return 'pointer';
        if (s.layer?.id === 'flood-hexagons' && s.object) return 'pointer';
        if (s.layer?.id === 'facilities' && s.object) return 'pointer';
        return 'crosshair';
      },
      onHover: (info) => {
        if ((info.layer?.id === 'human-terrain' || info.layer?.id === 'flood-hexagons') && info.object) {
          const hex = info.object as Hexagon;
          setHoveredId(hex.h3_id);
          setTooltip({
            x: info.x,
            y: info.y,
            hex,
            risk: riskAtTime(hex, time),
            mode: info.layer.id === 'human-terrain' ? 'human' : 'flood',
          });
        } else {
          setHoveredId(null);
          setTooltip(null);
        }
      },
    });
  }, [
    country, floodBounds, overlay, floodedHexagons, facilities, route, userLocation,
    time, selectedHex, hoveredId, maxHumanPopulation,
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
          ) : (
            <>
              <strong>{riskLabel(tooltip.risk)} flood</strong>
              <span>{Math.round(tooltip.risk * 100)}% depth risk</span>
              <span>{tooltip.hex.population_u5.toLocaleString()} children u5</span>
              <span className="map-tooltip-hint">Click for evidence</span>
            </>
          )}
        </div>
      )}
    </>
  );
}
