# BEACON — Whole-Bangladesh 3D Map (design)

Date: 2026-06-20
Status: approved (brainstorming)

## Goal

Today the BEACON national map (`frontend/src/components/Globe.tsx`) is **flat** and the
detailed flood physics only exists for **one city** (Sirajganj, via `waterlab.html` and the
`MapWaterLayer` locked to the Sirajganj bbox). The user wants the *whole country* to read like
the gorgeous `waterlab.html` scene — real 3D terrain, real 3D buildings, with neighbouring
countries (India / Myanmar) tinted faintly blue so Bangladesh pops.

The approach must use **online maps** (streamed tiles), not a hand-built DEM, so it covers all
of Bangladesh automatically. It is grounded in the official MapLibre examples the team selected,
which is also the project's "researched, not AI-invented" trust story for the UN judges.

## Approach — combine multiple online sources in ONE MapLibre map

All changes live in `Globe.tsx`'s `MAP_STYLE` / `map.on('load')`. MapLibre composites many
sources on the same coordinates:

1. **3D terrain (whole country).** Add a `raster-dem` source from the **free AWS Terrarium
   tiles** — `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png`,
   `encoding: 'terrarium'`, `tileSize: 256`, **no API key** (the same source
   `prep_waterlab_dem.py` already uses). Apply via `terrain: { source, exaggeration }` plus a
   `hillshade` layer and `sky: {}`. → every part of Bangladesh now has real hills and low spots.
   *(MapLibre "3D Terrain" example.)*

2. **Real 3D buildings.** Add an OpenFreeMap **vector** source (free, no key,
   `https://tiles.openfreemap.org/planet`) and a `fill-extrusion` layer on its `building`
   source-layer using `render_height` / `render_min_height`. Capped to higher zoom so the
   national view stays fast. *(MapLibre "Display buildings in 3D" example.)*

3. **Neighbour countries faint blue.** A `fill` layer whose geometry is **the world minus
   Bangladesh** — an outer world ring with the `bgd_adm0.geojson` polygon as a hole — tinted a
   soft translucent blue (`#1f6feb`-ish, low opacity), sitting above the basemap but below the
   flood/terrain features. India/Myanmar/Bay of Bengal read as water-ish; Bangladesh stays
   satellite-real.

4. **Keep what works.** The existing time/depth slider, the `MapWaterLayer` flood water, the
   hex flood cells, the flood-extent rasters, click-to-evidence popups, and the Sirajganj
   `waterlab.html` zoom-in deep-dive all stay. The slider keeps driving `MapWaterLayer.setLevel`.

## Scope decisions (locked)

- **Flooding stays as-is nationally**: national flood = existing hex cells + extent rasters,
  now draped on real 3D terrain. The interactive shallow-water *physics* sim stays scoped to the
  Sirajganj zoom-in (a real-time national sim is not browser-feasible and would be less
  defensible to judges than honest precomputed national layers).
- **No hand-built national DEM.** Terrain is streamed online.

## Components touched

- `frontend/src/components/Globe.tsx` — add terrain/hillshade/sky to `MAP_STYLE`; add DEM +
  OpenFreeMap vector sources; add building `fill-extrusion`, neighbour-blue `fill`; build the
  world-minus-Bangladesh mask from `bgd_adm0.geojson`.
- New helper `frontend/src/utils/neighborMask.ts` (or inline) — produce the masking polygon
  (world ring + Bangladesh hole) from the adm0 boundary.
- The Bangladesh boundary geojson must be reachable by the frontend (copy/import
  `bgd_adm0.geojson` into the frontend, or fetch from the backend `/geo` endpoint already used).

## Risks / mitigations

- **OpenFreeMap / AWS tile availability offline.** These are online sources; the offline-PMTiles
  story (the team's separate differentiator) is out of scope here. Terrain/buildings degrade
  gracefully (map still renders) if a source fails — wrap `addSource`/`setTerrain` in try/catch
  and log, matching the existing water-layer error handling.
- **Performance.** Buildings only above a zoom threshold; terrain exaggeration kept modest;
  `maxzoom` set on the DEM source.
- **`MapWaterLayer` z-fighting with terrain.** Water already renders with `depthTest:false` at
  zoom ≥ 9.2; verify it still sits correctly once terrain raises the ground. Adjust if needed.

## Success criteria

1. Loading the app shows all of Bangladesh in real 3D terrain (visible hills when pitched).
2. Neighbouring countries are tinted faint blue; Bangladesh is clearly delineated.
3. 3D buildings extrude when zoomed into towns/cities (not just Sirajganj).
4. The flood slider, popups, hex cells, and Sirajganj waterlab deep-dive still work.
5. No API keys required; all sources are free + online.
