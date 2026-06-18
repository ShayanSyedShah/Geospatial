import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { Hexagon } from '../types';
import { riskColor } from '../utils/risk';

interface GlobeProps {
  hexagons: Hexagon[];
  selectedHexagon: Hexagon | null;
  onSelectHexagon: (hex: Hexagon | null) => void;
}

// Keyless raster style (CARTO basemaps) so the demo needs no API token.
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap, © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0b1d2a' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
  projection: { type: 'globe' },
};

// Uganda
const CENTER: [number, number] = [32.3, 1.3];

export default function Globe({ hexagons, selectedHexagon, onSelectHexagon }: GlobeProps) {
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
      zoom: 5.4,
      pitch: 45,
      bearing: -10,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

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
      elevationScale: 1,
      getHexagon: (d) => d.h3_id,
      getFillColor: (d) =>
        d.h3_id === selectedId ? [255, 255, 255, 230] : riskColor(d.flood_risk),
      getElevation: (d) => d.flood_risk * 12000,
      updateTriggers: {
        getFillColor: [selectedId],
      },
      onClick: (info) => {
        selectRef.current((info.object as Hexagon) ?? null);
        return true;
      },
    });
    overlay.setProps({ layers: [layer] });
  }, [hexagons, selectedHexagon]);

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
