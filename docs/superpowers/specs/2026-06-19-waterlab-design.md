# Water Lab — Real-Time GPU Shallow-Water Flood (Sirajganj)

**Date:** 2026-06-19
**Status:** Design approved, ready for implementation plan
**Owner:** water-physics workstream

---

## 1. Goal

Show **real flowing water** in a real city — not colored hexagons, not a tinted
raster. Water that pours from the Jamuna river, flows downhill through real
Sirajganj streets, and pools in the low ground, **live**, responding to a
river-level / rainfall slider at interactive frame rates.

This is a self-contained workstream: the **water physics**. It is built in
isolation first, then integrated into the existing BEACON flood map.

## 2. What exists today (constraints)

- Frontend stack: **MapLibre GL JS + deck.gl** (React 19 + Vite + TypeScript).
  Verified: `npm ci` + `npm run build` + Vite dev all pass.
- Current flood display = a **raster BitmapLayer** + flat **H3 hexagons**
  (`extruded: false`). No water surface, no DEM, no 3D terrain.
- **No DEM** exists in `backend/data` (only flood PNGs, boundaries, hexagons).
  Real flow needs a fine elevation map → a data-prep step is part of this work.
- Backend (FastAPI) is currently unrunnable on the dev machine (broken Python).
  **The Water Lab does not depend on the backend** — it is pure frontend over a
  static DEM asset, so this is not a blocker.

## 3. Scope decisions (locked)

| Decision | Choice |
|---|---|
| Realism | Real-time **GPU shallow-water** (virtual-pipes), not full Navier-Stokes |
| Interactivity | **Live** — slider drives river level / rainfall, water reacts now |
| Area | **One city, high detail: Sirajganj** (Jamuna floodplain) |
| Where it lives | **Standalone view in-repo first**, integrate into MapLibre later (Phase 2) |
| Physics maps | **Build maps 1–4; CUT sediment + erosion (maps 5–6)** — not needed for flood, removes the riskiest math, looks identical |

## 4. The physics (virtual-pipes shallow-water, Mei et al.)

A structured grid. Each cell holds terrain height `b` and water depth `d`.
Per simulation step, GPU fragment shaders run these passes (ping-pong FBOs):

1. **Influx** — add water from rain and/or the river boundary: `d += dt·r·K`.
2. **Flux** — outflow to the 4 neighbors driven by total-height difference
   `h = b + d`: `f += dt·A·g·Δh / l`, clamped to ≥0, then scaled so total
   outflow ≤ available volume (mass conservation).
3. **Height + velocity** — `d += dt·(Σf_in − Σf_out)/area`; velocity `(u,v)`
   from averaged opposing fluxes.
4. **Wetting/drying** — cells with `d < d_min` (0.01 m) get zero velocity/flux
   (stops numerical oscillation on dry streets).
5. **Manning friction** — roughness map slows water in dense blocks vs. fast on
   open streets (optional polish; constant n acceptable for v1).

**Cut (not built):** suspended sediment, erosion/deposition, sediment advection,
sediment normal map. These belong to hydraulic-erosion demos, not flood viz.

**River boundary:** the east grid edge = the Jamuna. A Dirichlet condition sets
its water level from the slider (later: real BWDB Sirajganj gauge hydrograph).
When river level exceeds the embankment height, water spills onto the grid.

## 5. Data pipeline (DEM prep — one-time)

- Source: **FABDEM** (bare-earth — removes the tree/building "dam" error that
  wrecks flat-floodplain sims; the critical choice for Sirajganj). Fallback:
  Copernicus GLO-30 if FABDEM access is slow.
- Crop to the Sirajganj bbox, encode as **Terrain-RGB PNG**
  (`h = -10000 + (R·256·256 + G·256 + B)·0.1`, 0.1 m precision).
- Output static assets in `frontend/public/`:
  - `sirajganj_dem.png` (terrain-RGB heightmap)
  - `sirajganj_meta.json` (bbox, min/max elevation, river edge, embankment height)
  - optional later: `sirajganj_roughness.png` (Manning n from land use)

## 6. Architecture

```
frontend/src/components/WaterLab.tsx     # full-screen view, slider, camera, HUD
frontend/src/water/WaterSimulator.ts     # GPGPU engine (GPUComputationRenderer)
frontend/src/water/shaders/influx.glsl   # pass 1
frontend/src/water/shaders/flux.glsl     # pass 2
frontend/src/water/shaders/height.glsl   # pass 3 (depth + velocity)
frontend/src/water/shaders/render.glsl   # water surface material (depth-graded)
frontend/src/water/loadDem.ts            # decode terrain-RGB → sim terrain texture
frontend/public/sirajganj_dem.png        # static DEM asset
frontend/public/sirajganj_meta.json
```

- **Engine:** Three.js `GPUComputationRenderer` manages the ping-pong FBOs and
  texture dependencies. Start textures at **RGBA32F** (stability first — full
  precision while getting the math right), then drop to **RGBA16F** for
  performance once the sim is stable.
- **Grid:** start 512×512, raise to 1024×1024 if it holds 60fps.
- **Render:** water mesh at `terrain + d`, translucent, color graded by depth,
  light normal-based shading for a live shimmer. Dry cells render nothing.
- **Route:** reachable at `/waterlab` (or a dev toggle). Isolated — cannot break
  the existing BEACON app.
- **Reference implementation to adapt:** `github.com/aeplay/WebFlood`
  (open-source interactive shallow-water in city environments).

## 7. Phase 2 — integration (later, not now)

Wrap the **same** `WaterSimulator` in a MapLibre `CustomLayerInterface`:
- `onAdd`: attach Three.js renderer to MapLibre's GL context, `autoClear=false`.
- `render`: `renderer.resetState()` each frame; sync camera projection matrix to
  MapLibre's (Mercator translate/scale) so real 3D buildings occlude the water.
- The sim still loads its **own** DEM texture (MapLibre does not expose its
  terrain heightbuffer to custom layers — confirmed constraint).
- Entry point: a "Physics view" button in the existing Flood module.

## 8. Success criteria

1. Open `/waterlab` → real Sirajganj terrain renders in 3D.
2. Raise the river slider → water visibly **pours from the Jamuna and flows
   downhill**, filling low streets, pooling in depressions, **not** filling
   uniformly like a bathtub. Lower it → water drains/recedes.
3. Holds **≥ 30fps** (target 60) at 512² on a normal laptop.
4. Water depth is read from the **real FABDEM** terrain (low ground floods
   first), not a synthetic surface.
5. No crash, no NaN blow-up (wetting/drying threshold holds stability).

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Shader math instability (NaN/oscillation) | Wetting/drying `d_min`, flux clamp, start RGBA32F then optimize |
| FABDEM access/format friction | Fallback to Copernicus GLO-30; pre-bake the PNG once, commit it |
| Flat floodplain → little visible flow | Exaggerate vertical scale for the view; pick a bbox with the river + town relief |
| Perf on weak laptop | Drop grid to 256², fewer substeps; keep a baked-frames fallback in reserve |
| Scope creep back into erosion/sediment | Explicitly cut in this spec; revisit only if core is done early |

## 10. Out of scope (this workstream)

- Sediment / erosion / morphology.
- MapLibre integration (that is Phase 2, separate plan).
- Live BWDB gauge feed (later enhancement; slider stands in for v1).
- Backend / FastAPI changes.
