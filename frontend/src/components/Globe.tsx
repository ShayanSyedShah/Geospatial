import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { BitmapLayer, IconLayer, PathLayer } from '@deck.gl/layers';
import { api } from '../services/api';
import type { EvacRoute, Facility, UserLocation } from '../types';
import { tierOpacity } from '../utils/risk';

export interface CameraFocus {
  lng: number;
  lat: number;
  zoom: number;
}

type Bounds = [number, number, number, number];

interface GlobeProps {
  country: string;
  floodBounds: Bounds | null;
  facilities: Facility[];
  userLocation: UserLocation | null;
  route: EvacRoute | null;
  onSelectFacility: (f: Facility) => void;
  onMapClick: (lng: number, lat: number) => void;
  time: number; // timeline fraction 0..1
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
    { id: 'scrim', type: 'background', paint: { 'background-color': '#04101a', 'background-opacity': 0.25 } },
  ],
};

const CENTER: [number, number] = [90.36, 23.7];

const iconUrl = (f: Facility) => `/m-${f.type}${f.at_risk ? '-risk' : ''}.png`;

const TIERS = ['4h', '20h', '7d'] as const;

export default function Globe({
  country, floodBounds, facilities, userLocation, route, onSelectFacility, onMapClick, time, focus,
}: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const cb = useRef({ onSelectFacility, onMapClick });
  cb.current = { onSelectFacility, onMapClick };

  // init map once
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

    const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
    map.addControl(overlay as unknown as maplibregl.IControl);

    map.on('load', () => {
      if (!map.getLayer('labels')) {
        map.addLayer({ id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } });
      }
    });

    // Tap a facility -> select it; tap empty map -> drop "you are here".
    map.on('click', (e) => {
      const picked = overlay.pickObject({ x: e.point.x, y: e.point.y, radius: 8, layerIds: ['facilities'] });
      if (picked?.object) cb.current.onSelectFacility(picked.object as Facility);
      else cb.current.onMapClick(e.lngLat.lng, e.lngLat.lat);
    });
    map.getCanvas().style.cursor = 'crosshair';

    mapRef.current = map;
    overlayRef.current = overlay;
    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  // rebuild deck layers on data / time change
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // Smooth river/coast-following flood overlays (native ~1km raster), one per
    // return-period tier, cross-faded by the timeline so water spreads over time.
    const opacity = tierOpacity(time);
    const floodLayers = floodBounds
      ? TIERS.map((tier) => new BitmapLayer({
          id: `flood-${tier}`,
          image: api.floodImageUrl(country, tier),
          bounds: floodBounds,
          opacity: opacity[tier],
          desaturate: 0,
        }))
      : [];

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
    const layers: any[] = [...floodLayers, facLayer];

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
    overlay.setProps({ layers });
  }, [country, floodBounds, facilities, route, userLocation, time]);

  // fly to focus
  useEffect(() => {
    if (focus && mapRef.current) {
      mapRef.current.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom, duration: 1500, essential: true });
    }
  }, [focus]);

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />;
}
