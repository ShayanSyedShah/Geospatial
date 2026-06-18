import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { Hexagon } from '../types';
import { riskAtTime, riskColor } from '../utils/risk';

export interface CameraFocus {
  lng: number;
  lat: number;
  zoom: number;
}

interface GlobeProps {
  hexagons: Hexagon[];
  selectedHexagon: Hexagon | null;
  onSelectHexagon: (hex: Hexagon | null) => void;
  time: number; // timeline fraction 0..1
  focus: CameraFocus | null;
}

// Keyless raster style (CARTO basemaps) so the demo needs no API token.
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap, © CARTO',
    },
    labels: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b1d2a' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};

// Uganda
const CENTER: [number, number] = [32.3, 1.3];

export default function Globe({ hexagons, selectedHexagon, onSelectHexagon, time, focus }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const selectRef = useRef(onSelectHexagon);
  selectRef.current = onSelectHexagon;

  // init map once
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CENTER,
      zoom: 5.6,
      pitch: 50,
      bearing: 0,
      maxPitch: 75,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    // interleaved => deck hexagons render INTO the map's 3D scene (correct depth
    // and alignment), not as a floating overlay canvas.
    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    // Place labels drawn ON TOP of the hexagons (added after the deck overlay)
    // so geography reads clearly without cluttering the risk surface beneath.
    map.on('load', () => {
      if (!map.getLayer('labels')) {
        map.addLayer({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } });
      }
    });

    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // update deck layer when data / selection changes
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const selectedId = selectedHexagon?.h3_id;
    const layer = new H3HexagonLayer<Hexagon>({
      id: 'flood-hexagons',
      data: hexagons,
      pickable: true,
      extruded: true,
      filled: true,
      stroked: false,
      highPrecision: false,
      // slight gaps so individual cells read as a crisp hex grid
      coverage: 0.92,
      elevationScale: 1,
      getHexagon: (d) => d.h3_id,
      getFillColor: (d) => {
        if (d.h3_id === selectedId) return [255, 255, 255, 235];
        return riskColor(riskAtTime(d, time));
      },
      // towers rise with the interpolated, time-varying risk
      getElevation: (d) => {
        const r = riskAtTime(d, time);
        return r <= 0.001 ? 0 : 400 + r * 6000;
      },
      material: { ambient: 0.6, diffuse: 0.6, shininess: 16, specularColor: [40, 60, 80] },
      autoHighlight: true,
      highlightColor: [255, 255, 255, 120],
      transitions: { getElevation: 180, getFillColor: 180 },
      updateTriggers: {
        getFillColor: [selectedId, time],
        getElevation: [time],
      },
      onClick: (info) => {
        selectRef.current((info.object as Hexagon) ?? null);
        return true;
      },
    });
    overlay.setProps({ layers: [layer] });
  }, [hexagons, selectedHexagon, time]);

  // fly to a focused district / country
  useEffect(() => {
    if (focus && mapRef.current) {
      mapRef.current.flyTo({
        center: [focus.lng, focus.lat],
        zoom: focus.zoom,
        duration: 1500,
        essential: true,
      });
    }
  }, [focus]);

  // fly to selected hexagon
  useEffect(() => {
    if (selectedHexagon && mapRef.current) {
      mapRef.current.flyTo({
        center: [selectedHexagon.lng, selectedHexagon.lat],
        zoom: 7.5,
        duration: 1400,
        essential: true,
      });
    }
  }, [selectedHexagon]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
