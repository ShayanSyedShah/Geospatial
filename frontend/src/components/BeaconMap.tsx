import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Feature } from 'geojson';
import { WaterLayer } from './WaterLayer';
import type { Selection } from '../types';

interface Props {
  buildings: FeatureCollection | null;
  zones: FeatureCollection | null;
  facilities: FeatureCollection | null;
  inundation: Feature | null;
  waterAltitudeM: number;
  onSelect: (sel: Selection) => void;
}

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri',
    },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium', tileSize: 256, maxzoom: 13,
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#0a1722' } },
    { id: 'sat', type: 'raster', source: 'sat' },
  ],
  terrain: { source: 'dem', exaggeration: 1.3 },
};

const CENTER: [number, number] = [89.71, 24.45];

export default function BeaconMap({ buildings, zones, facilities, inundation, waterAltitudeM, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const waterRef = useRef<WaterLayer | null>(null);
  const ready = useRef(false);
  const sel = useRef(onSelect);
  sel.current = onSelect;
  const dataRef = useRef({ buildings, zones, facilities });
  dataRef.current = { buildings, zones, facilities };

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current, style: STYLE, center: CENTER, zoom: 11.2,
      pitch: 55, bearing: -15, maxPitch: 80, attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      // flood footprint (flat fill, always visible incl. low-end)
      map.addSource('flood', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'flood-fill', type: 'fill', source: 'flood',
        paint: { 'fill-color': '#1f9bff', 'fill-opacity': 0.5 } });
      map.addLayer({ id: 'flood-line', type: 'line', source: 'flood',
        paint: { 'line-color': '#bfe6ff', 'line-width': 1.4, 'line-opacity': 0.85 } });

      // zones (clickable)
      map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'zones-line', type: 'line', source: 'zones',
        paint: { 'line-color': '#ffd166', 'line-width': 1, 'line-opacity': 0.5 } });
      map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones',
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.01 } });

      // 3D buildings
      map.addSource('buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'buildings-3d', type: 'fill-extrusion', source: 'buildings', minzoom: 12.5,
        paint: {
          'fill-extrusion-color': '#cdd6df',
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 6],
          'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.92,
        } });

      // facilities (clickable)
      map.addSource('facilities', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'facilities-pt', type: 'circle', source: 'facilities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 7],
          'circle-color': ['match', ['get', 'type'], 'clinic', '#ff5a52', 'school', '#ffd166', '#9fb1bd'],
          'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2,
        } });

      // Three.js rising water (added last → on top)
      const water = new WaterLayer();
      map.addLayer(water);
      waterRef.current = water;

      ready.current = true;
      mapRef.current = map;
      pushSources();

      // click → evidence
      map.on('click', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['facilities-pt'] })[0]
          || map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] })[0];
        if (!f) return;
        const p = (f.properties ?? {}) as Record<string, string | number>;
        const isZone = f.layer.id === 'zones-fill';
        sel.current({
          kind: isZone ? 'zone' : (p.type === 'clinic' ? 'clinic' : 'school'),
          name: String(p.name ?? p.shapeName ?? (isZone ? 'Zone' : 'Facility')),
          lng: e.lngLat.lng, lat: e.lngLat.lat, props: p,
        });
      });
      map.on('mouseenter', 'facilities-pt', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'facilities-pt', () => (map.getCanvas().style.cursor = ''));
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; ready.current = false; };
  }, []);

  const pushSources = () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const d = dataRef.current; // read latest (avoids stale closure in the load handler)
    if (d.buildings) (map.getSource('buildings') as maplibregl.GeoJSONSource)?.setData(d.buildings);
    if (d.zones) (map.getSource('zones') as maplibregl.GeoJSONSource)?.setData(d.zones);
    if (d.facilities) (map.getSource('facilities') as maplibregl.GeoJSONSource)?.setData(d.facilities);
  };

  useEffect(() => { pushSources(); }, [buildings, zones, facilities]);

  // update flood footprint + water mesh on level change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const fc: FeatureCollection = inundation
      ? { type: 'FeatureCollection', features: [inundation] }
      : { type: 'FeatureCollection', features: [] };
    (map.getSource('flood') as maplibregl.GeoJSONSource)?.setData(fc);
    waterRef.current?.setData(inundation, waterAltitudeM);
  }, [inundation, waterAltitudeM]);

  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
