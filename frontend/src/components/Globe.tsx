import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { BitmapLayer, IconLayer, PathLayer } from '@deck.gl/layers';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
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
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#06121c' } },
    { id: 'satellite', type: 'raster', source: 'satellite' },
    { id: 'scrim', type: 'background', paint: { 'background-color': '#04101a', 'background-opacity': 0.2 } },
  ],
};

const CENTER: [number, number] = [90.36, 23.7];
const TIERS = ['4h', '20h', '7d'] as const;
const RIVER_TINT = 0.42;

const iconUrl = (f: Facility) => `/m-${f.type}${f.at_risk ? '-risk' : ''}.png`;

export default function Globe({
  country, hexagons, floodBounds, overlay, facilities, userLocation, route,
  selectedHex, onSelectHex, onSelectFacility, onMapClick, time, focus,
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; hex: Hexagon; risk: number } | null>(null);
  const cb = useRef({ onSelectHex, onSelectFacility, onMapClick });
  cb.current = { onSelectHex, onSelectFacility, onMapClick };

  const floodedHexagons = useMemo(
    () => hexagons.filter((h) => isFloodedAtTime(h, time)),
    [hexagons, time],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: CENTER,
      zoom: 6.3,
      pitch: 52,
      bearing: 0,
      maxPitch: 80,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    const deck = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(deck as unknown as maplibregl.IControl);

    map.on('load', () => {
      if (!map.getLayer('labels')) {
        map.addLayer({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } });
      }
    });

    map.on('click', (e) => {
      const picked = deck.pickObject({
        x: e.point.x,
        y: e.point.y,
        radius: 10,
        layerIds: ['flood-hexagons', 'facilities'],
      });
      if (picked?.layer?.id === 'flood-hexagons' && picked.object) {
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
    const floodLayers = overlay.showRiverExtent && floodBounds
      ? TIERS.map((tier) => new BitmapLayer({
          id: `flood-${tier}`,
          image: api.floodImageUrl(country, tier),
          bounds: floodBounds,
          opacity: tierOp[tier] * RIVER_TINT,
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
          highPrecision: true,
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
    const layers: any[] = [...floodLayers, hexLayer, facLayer].filter(Boolean);

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
        if (s.layer?.id === 'flood-hexagons' && s.object) return 'pointer';
        if (s.layer?.id === 'facilities' && s.object) return 'pointer';
        return 'crosshair';
      },
      onHover: (info) => {
        if (info.layer?.id === 'flood-hexagons' && info.object) {
          const hex = info.object as Hexagon;
          setHoveredId(hex.h3_id);
          setTooltip({
            x: info.x,
            y: info.y,
            hex,
            risk: riskAtTime(hex, time),
          });
        } else {
          setHoveredId(null);
          setTooltip(null);
        }
      },
    });
  }, [
    country, floodBounds, overlay, floodedHexagons, facilities, route, userLocation,
    time, selectedHex, hoveredId,
  ]);

  useEffect(() => {
    if (focus && mapRef.current) {
      mapRef.current.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 1500, essential: true });
    }
  }, [focus]);

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {tooltip && (
        <div
          className="map-tooltip"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          <strong>{riskLabel(tooltip.risk)} flood</strong>
          <span>{Math.round(tooltip.risk * 100)}% depth risk</span>
          <span>{tooltip.hex.population_u5.toLocaleString()} children u5</span>
          <span className="map-tooltip-hint">Click for evidence</span>
        </div>
      )}
    </>
  );
}
