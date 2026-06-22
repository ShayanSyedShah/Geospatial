import { useEffect, useRef, useState } from 'react';

// Google "Photorealistic 3D Tiles" via CesiumJS, then CLIPPED to the Bangladesh
// border so everything outside the country is cut from the mesh.
// https://developers.google.com/maps/documentation/tile/3d-tiles
// Needs Cesium >= 1.114 (ClippingPolygonCollection, WebGL2), so we load a current
// build from the Cesium CDN rather than Google's old 1.105 sample build.
// Honest limit: Google streams a *global* tileset; we mask it client-side with
// inverse clipping — we cannot export a Bangladesh-only asset from Google.
const CESIUM_VERSION = '1.124';
const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;
const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const BGD_BOUNDS = { west: 88.0, south: 20.4, east: 92.9, north: 26.8 };
const BGD_CENTER = { lng: 90.36, lat: 23.7, height: 180000, heading: 0, pitch: -90 };
const DEFAULT_EXACT_CLIP = false;

// Default camera over Dhaka (most-covered Bangladesh city). Low + oblique so the
// real buildings stand up and it reads unmistakably as 3D, not a flat photo.
const DHAKA = { lng: 90.4074, lat: 23.7806, height: 430, heading: 30, pitch: -22 };
const SUNDARBANS = { lng: 89.45, lat: 22.05, height: 2200, heading: 50, pitch: -42 };

type LoadState = 'idle' | 'loading' | 'ready' | 'missing-key' | 'error';

declare global {
  interface Window {
    Cesium?: any;
  }
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (window.Cesium) resolve();
      else existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Cesium failed to load'));
    document.head.appendChild(script);
  });
}

function flyTo(Cesium: any, viewer: any, c: typeof DHAKA, duration = 0) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(c.lng, c.lat, c.height),
    orientation: {
      heading: Cesium.Math.toRadians(c.heading),
      pitch: Cesium.Math.toRadians(c.pitch),
      roll: 0,
    },
    duration,
  });
}

// Cut everything outside Bangladesh from the Google mesh, using the adm0 border
// as inverse clipping polygons. Requires Cesium >= 1.114 + WebGL2.
async function clipToBangladesh(Cesium: any, tileset: any) {
  try {
    const geo = await (await fetch('/bgd_adm0.geojson')).json();
    const polygons: any[] = [];
    for (const f of geo.features || []) {
      const g = f.geometry;
      if (!g) continue;
      const rings =
        g.type === 'Polygon' ? [g.coordinates[0]]
        : g.type === 'MultiPolygon' ? g.coordinates.map((p: number[][][]) => p[0])
        : [];
      for (const ring of rings) {
        if (!ring || ring.length < 3) continue;
        const flat: number[] = [];
        for (const pt of ring) flat.push(pt[0], pt[1]);
        polygons.push(new Cesium.ClippingPolygon({ positions: Cesium.Cartesian3.fromDegreesArray(flat) }));
      }
    }
    if (polygons.length && Cesium.ClippingPolygonCollection) {
      // inverse: true => keep what's INSIDE the polygons, clip the rest of the world
      tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({ polygons, inverse: true });
    }
  } catch (err) {
    console.warn('Bangladesh clip failed', err);
  }
}

function clampCameraToBangladesh(Cesium: any, viewer: any) {
  const c = viewer.camera.positionCartographic;
  const lng = Cesium.Math.toDegrees(c.longitude);
  const lat = Cesium.Math.toDegrees(c.latitude);
  const margin = 0.45;
  const clampedLng = Math.min(BGD_BOUNDS.east + margin, Math.max(BGD_BOUNDS.west - margin, lng));
  const clampedLat = Math.min(BGD_BOUNDS.north + margin, Math.max(BGD_BOUNDS.south - margin, lat));
  const clampedHeight = Math.min(260000, Math.max(80, c.height));
  if (Math.abs(clampedLng - lng) > 0.001 || Math.abs(clampedLat - lat) > 0.001 || clampedHeight !== c.height) {
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(clampedLng, clampedLat, clampedHeight),
      orientation: {
        heading: viewer.camera.heading,
        pitch: viewer.camera.pitch,
        roll: viewer.camera.roll,
      },
    });
  }
}

function addBangladeshBoundary(Cesium: any, viewer: any) {
  fetch('/bgd_adm0.geojson')
    .then((r) => r.json())
    .then((geojson) => {
      const ds = new Cesium.GeoJsonDataSource('Bangladesh boundary');
      return ds.load(geojson, {
        stroke: Cesium.Color.CYAN.withAlpha(0.95),
        strokeWidth: 3,
        fill: Cesium.Color.TRANSPARENT,
        clampToGround: false,
      });
    })
    .then((ds) => {
      viewer.dataSources.add(ds);
      for (const entity of ds.entities.values) {
        if (entity.polygon) {
          entity.polygon.fill = false;
          entity.polygon.outline = true;
          entity.polygon.outlineColor = Cesium.Color.CYAN.withAlpha(0.95);
          entity.polygon.outlineWidth = 3;
        }
      }
      viewer.scene.requestRender();
    })
    .catch((err) => console.warn('Bangladesh boundary failed', err));

  viewer.entities.add({
    rectangle: {
      coordinates: Cesium.Rectangle.fromDegrees(BGD_BOUNDS.west, BGD_BOUNDS.south, BGD_BOUNDS.east, BGD_BOUNDS.north),
      fill: false,
      outline: true,
      outlineColor: Cesium.Color.WHITE.withAlpha(0.75),
      outlineWidth: 2,
      height: 220,
    },
  });
}

export default function Reality3DModule() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!hostRef.current) return;
    if (!GOOGLE_KEY) {
      setState('missing-key');
      setMessage('Add VITE_GOOGLE_MAPS_API_KEY to frontend/.env.local and restart the dev server.');
      return;
    }

    async function boot() {
      setState('loading');
      try {
        loadCss(`${CESIUM_BASE}/Widgets/widgets.css`);
        await loadScript(`${CESIUM_BASE}/Cesium.js`);
        if (cancelled || !hostRef.current || !window.Cesium) return;

        const Cesium = window.Cesium;

        // --- official Google doc example (verbatim shape) ---
        const viewer = new Cesium.Viewer(hostRef.current, {
          baseLayer: false,
          baseLayerPicker: false,
          requestRenderMode: true,
          // hide widgets we don't need (cosmetic, not part of the data path)
          animation: false,
          timeline: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
        });
        viewerRef.current = viewer;
        (window as unknown as Record<string, unknown>).__cesiumViewer = viewer;

        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_KEY}`,
          {
            showCreditsOnScreen: true,
            // Max-smooth default: higher screen-space error = fewer/coarser tiles.
            // Google photorealistic 3D is GPU-heavy; start fast, let users opt into
            // exact clipping / sharper quality only when needed.
            maximumScreenSpaceError: 64,
            // keep loaded tiles cached so panning doesn't re-stream constantly
            cacheBytes: 512 * 1024 * 1024,
            maximumCacheOverflowBytes: 512 * 1024 * 1024,
            // don't over-fetch detail while flying
            preloadWhenHidden: false,
            preloadFlightDestinations: false,
          },
        );
        if (cancelled) return;
        viewer.scene.primitives.add(tileset);

        viewer.scene.globe.show = false;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 80;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 260000;

        // SMOOTHNESS: render at 1x (not retina 2x = 4x the pixels), drop costly
        // scene effects, and stay in on-demand render mode so idle = 0 GPU.
        viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 0.75);
        viewer.scene.fog.enabled = false;
        viewer.scene.skyAtmosphere.show = false;
        viewer.scene.shadowMap.enabled = false;
        try { viewer.scene.postProcessStages.fxaa.enabled = false; } catch (e) { void e; }
        viewer.scene.requestRenderMode = true;
        viewer.scene.maximumRenderTimeChange = Infinity;
        // ----------------------------------------------------

        // Exact country clipping is visually clean but costs GPU. Default to a
        // Bangladesh-locked camera + boundary for smooth interaction; enable exact
        // clipping only when the user asks for the cutout.
        if (DEFAULT_EXACT_CLIP) await clipToBangladesh(Cesium, tileset);
        if (cancelled) return;
        addBangladeshBoundary(Cesium, viewer);
        viewer.camera.changed.addEventListener(() => clampCameraToBangladesh(Cesium, viewer));
        flyTo(Cesium, viewer, BGD_CENTER, 0);
        window.setTimeout(() => {
          if (!cancelled) flyTo(Cesium, viewer, DHAKA, 1.4);
        }, 500);
        setState('ready');
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setState('error');
          setMessage(err instanceof Error ? err.message : 'Could not start Reality 3D.');
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
      viewerRef.current?.destroy?.();
      viewerRef.current = null;
    };
  }, []);

  return (
    <div className="reality3d">
      <div ref={hostRef} className="reality3d-canvas" />
      <div className="reality3d-topbar">
        <div>
          <b>Reality 3D</b>
          <span>Bangladesh-locked Google Photorealistic 3D Tiles</span>
        </div>
        <a href="https://developers.google.com/maps/documentation/tile/3d-tiles" target="_blank" rel="noreferrer">
          Source
        </a>
      </div>
      {state === 'ready' && (
        <div className="reality3d-actions">
          <button onClick={() => window.Cesium && viewerRef.current && flyTo(window.Cesium, viewerRef.current, DHAKA, 0.8)}>
            Dhaka
          </button>
          <button onClick={() => window.Cesium && viewerRef.current && flyTo(window.Cesium, viewerRef.current, SUNDARBANS, 0.8)}>
            Coast
          </button>
          <button onClick={() => {
            if (!window.Cesium || !viewerRef.current) return;
            flyTo(window.Cesium, viewerRef.current, BGD_CENTER, 0.8);
          }}>
            Bangladesh
          </button>
          <button onClick={async () => {
            if (!window.Cesium || !viewerRef.current) return;
            const viewer = viewerRef.current;
            const tileset = viewer.scene.primitives.get(0);
            if (tileset?.clippingPolygons) {
              tileset.clippingPolygons.enabled = !tileset.clippingPolygons.enabled;
            } else {
              await clipToBangladesh(window.Cesium, tileset);
            }
            viewer.scene.requestRender();
          }}>
            Exact clip
          </button>
        </div>
      )}
      {state !== 'ready' && (
        <div className="reality3d-status">
          <b>{state === 'loading' ? 'Loading real 3D mesh…' : state === 'missing-key' ? 'API key needed' : 'Reality 3D unavailable'}</b>
          {message && <span>{message}</span>}
        </div>
      )}
    </div>
  );
}
