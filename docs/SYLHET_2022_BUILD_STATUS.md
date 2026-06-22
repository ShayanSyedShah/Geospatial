# Sylhet 2022 Flood Build Status

Date written: 2026-06-21
Project checkout: `C:\Users\akhil\Downloads\Geospatial-main\Geospatial-main`

This file records what has actually been built for the BEACON `Sylhet 2022` incident reconstruction, what is real data, what is illustrative, what phases are done, and what should be built next.

## Goal

The goal is not just to show a flood polygon. The goal is to explain how the 2022 Sylhet flood happened as a causal sequence that can later become a predictive model:

1. Moist monsoon air comes from the Bay of Bengal.
2. The air is forced upward over the Khasi/Jaintia Hills in Meghalaya.
3. Orographic lift produces extreme rainfall around Sohra/Cherrapunji and Mawsynram.
4. That rainfall enters the Barak basin and routes through the Surma and Kushiyara rivers.
5. Water reaches the low Sylhet/Sunamganj haor basin and spreads across the floodplain.
6. UNOSAT satellite observations provide the measured flood evidence.

The current app is now moving in that direction: real satellite basemap, real 3D terrain, real NASA rainfall layer, real OSM rivers, real UNOSAT flood evidence, and a real DEM-derived water surface for the river-surge scene.

## Current Phase Status

The current incident-story build should be counted as four completed causal phases, plus supporting evidence layers.

| Phase | Status | Scene label | What it shows | Data / method |
|---|---:|---|---|---|
| 1 | Done | Bay monsoon | Moisture moving north from the Bay of Bengal toward Bangladesh and Meghalaya | Real satellite basemap, animated moisture particles, narrative overlay |
| 2 | Done | Orographic lift | Bay air reaches the Khasi/Jaintia Hills and is forced upward by terrain | Real 3D terrain, ridge line, lift marker, explanation panel |
| 3 | Done | Extreme rain | Rainburst focus around Sohra/Cherrapunji and Mawsynram | Real 3D terrain, site markers, optional NASA rain layer |
| 4 | Done | River surge | Rain becomes river surge through Barak -> Surma/Kushiyara -> Sylhet/Sunamganj | Real OSM river geometry, animated surge route, real DEM-derived water surface |
| 5 | Partial | Haor basin fills | First observed flood extent over Sylhet lowlands | Real UNOSAT 2022-05-25 polygon is present |
| 6 | Partial | Peak extent | Peak flood summary after upstream rain and surge | Real UNOSAT 840 km2 figure is shown, but full 18 Jun SAR polygon is not shipped |
| 7 | Partial | 3D Water Lab | Separate real-terrain rising-water lab exists | Built as separate `/sylhet_waterlab.html`, not yet embedded into main map |
| 8 | Not started | Impact layer | Facilities/roads affected by flood | Needs intersection logic and markers |
| 9 | Not started | Evidence panel | UN Data Commons / population / WASH / children evidence | Needs API wiring and panel UI |
| 10 | Not started | Response panel | BEACON action/cost/supply response | Needs sourced response assumptions and UI |

Short version: the first four story scenes are done. The observed flood evidence exists. The final impact/evidence/response parts are still open.

## What Was Built

### 1. Sylhet 2022 module

Main files:

- `frontend/src/components/Sylhet2022Module.tsx`
- `frontend/src/components/SylhetFloodMap.tsx`
- `frontend/public/data/sylhet_2022/event_manifest.json`
- `frontend/src/styles/globals.css`

The app now has a `Sylhet 2022` tab that plays through the incident as a timeline. The bottom scene bar contains:

- `Bay monsoon`
- `Orographic lift`
- `Extreme rain`
- `River surge`
- `Haor basin fills`
- `Peak extent`

The timeline can be played or clicked manually.

### 2. Scene 1: Bay monsoon

Purpose: show the beginning of the event.

What happens in the story:

- Moist monsoon air moves north from the Bay of Bengal.
- This moisture stream is the upstream trigger before the flood.
- BEACON treats this as an early warning signal: moisture plus terrain plus river routing can indicate future flood risk.

What is shown:

- Real satellite basemap.
- Camera pulled back over Bay of Bengal / Bangladesh / Meghalaya.
- Animated moisture particles over the map.
- Text panel explaining the forecast logic.

Current limitation:

- The moisture particles are an explanatory animation, not a measured wind-vector product.
- Later improvement should use real wind / integrated vapor transport if available.

### 3. Scene 2: Orographic lift

Purpose: show why Meghalaya receives such extreme rainfall.

What happens in the story:

- Moist air from the Bay reaches the steep Meghalaya escarpment.
- The Khasi/Jaintia Hills force the air upward.
- Rising air cools and condenses.
- This creates intense orographic rainfall on the windward side.

What is shown:

- Camera zooms into the Khasi/Jaintia Hills.
- Real 3D terrain makes the hills visible.
- Ridge line highlights the escarpment.
- Lift marker shows air rising over the terrain.
- Explanation panel describes the process.

Current limitation:

- The lift marker is conceptual.
- It is placed over real terrain, but it is not a live atmospheric model.

### 4. Scene 3: Extreme rain

Purpose: show where the rain unloaded.

What happens in the story:

- Orographic lift produces extreme rain around Sohra/Cherrapunji and Mawsynram.
- These locations sit on the windward Khasi Hills.
- Rainwater drains into the upstream basin feeding Sylhet.

What is shown:

- Camera zooms into the Khasi Hills.
- Markers for `Sohra / Cherrapunji` and `Mawsynram`.
- Rain visual markers were simplified after the first version looked bad.
- Optional `Rain` toggle displays the NASA GPM IMERG precipitation raster.

Current limitation:

- The built-in rain marker is visual/conceptual.
- The real NASA rain layer is available through the `Rain` button, but the scene does not force it on by default because the user asked for satellite view when clicking scenes.

### 5. Scene 4: River surge

Purpose: show the missing causal link from upstream rain to downstream flood.

What happens in the story:

- Rain falling upstream concentrates into the Barak basin.
- The Barak system routes west and splits into Surma and Kushiyara near the Bangladesh border.
- Water moves toward Sylhet and Sunamganj.
- Low haor floodplains receive the surge and spread it outward.

What is shown now:

- Real 3D terrain.
- Bangladesh border highlighted.
- Real OSM river geometry for the Barak / Surma / Kushiyara pathway.
- Animated glowing surge route.
- Labels for:
  - `Barak basin`
  - `Surma River`
  - `Kushiyara River`
  - `Sylhet floodplain`
  - `Sunamganj haors`
- Real DEM-derived water surface over the Sylhet lowland basin.

Important fix made:

- The user noticed there was no visible real water, only route lines.
- The bug was fixed by adding visible `sylhet-water-fill` and `sylhet-water-shine` map layers from a DEM-derived water-surface GeoJSON.
- The River Surge scene now renders 2,576 water features in the browser.
- The camera was moved closer to the Sylhet floodplain so the water is visible immediately.

Current limitation:

- The water surface is DEM-derived and physically plausible, but it is not a calibrated hydrodynamic model with real 2022 river gauge boundary conditions.
- It should be described as real-terrain flood spread / predictive illustration, while UNOSAT remains the observed evidence.

## Real Data Currently Used

### Real satellite imagery

Used as the base map through Esri World Imagery.

Purpose:

- Make the viewer feel the geography is real.
- Avoid abstract schematic maps.

### Real terrain / elevation

Used through Terrarium / SRTM-style elevation tiles and a local Sylhet DEM.

Files / sources:

- `frontend/src/water/sylhet_dem.json`
- `frontend/public/sylhet_dem.js`
- `frontend/public/data/sylhet_2022/sylhet_water_surface.geojson`

Purpose:

- 3D hills for Meghalaya and Sylhet.
- Lowland water surface for Sylhet/Sunamganj haor basin.
- Future predictive model foundation.

### Real rainfall

NASA GPM IMERG precipitation layer is available through the `Rain` button.

Used in:

- `frontend/src/components/SylhetFloodMap.tsx`

Purpose:

- Show real rainfall over the region for the storm period.

Current UX decision:

- Rain is manually toggled. It does not cover the satellite by default when the user clicks a scene.

### Real river geometry

OSM river geometry was fetched and saved.

Files:

- `frontend/public/data/sylhet_2022/rivers.geojson`
- `backend/scripts/fetch_sylhet_rivers.py`

Purpose:

- Show the Barak / Surma / Kushiyara pathway as the real river system.

### Real UNOSAT flood evidence

Files:

- `frontend/public/data/sylhet_2022/flood_extent_2022-05-25.geojson`
- `frontend/public/data/sylhet_2022/event_manifest.json`

What works:

- The 25 May observed flood polygon is shipped and rendered.
- Peak 18 June value is shown as the real UNOSAT 840 km2 figure.

Limitation:

- The raw 18 June SAR polygon was too dense for the local geopandas/pyogrio/shapely conversion path and was not shipped as a browser polygon.
- The app labels this correctly as a stat-only peak figure.

## Important Files Changed or Added

### Frontend components

- `frontend/src/components/Sylhet2022Module.tsx`
  - Owns scene timeline, text panels, Play/Rain controls, scene labels.

- `frontend/src/components/SylhetFloodMap.tsx`
  - Owns MapLibre map, 3D terrain, rain raster, country border, OSM rivers, animated surge route, water surface, and UNOSAT flood polygon.

### Water / terrain

- `frontend/src/water/SylhetMapWaterLayer.ts`
  - Custom real-terrain water layer. Currently used carefully so it cannot block normal MapLibre layers.

- `frontend/src/water/sylhet_dem.json`
  - Local DEM data for Sylhet water work.

- `frontend/public/sylhet_waterlab.html`
  - Separate 3D Water Lab page for Sylhet.

- `frontend/public/sylhet_dem.js`
  - DEM data for the standalone water lab.

- `frontend/public/prep_sylhet_dem.py`
  - Script that generated the Sylhet DEM.

- `frontend/public/data/sylhet_2022/sylhet_water_surface.geojson`
  - DEM-derived water polygons used directly in the map during River Surge / flood scenes.

### Data

- `frontend/public/data/sylhet_2022/event_manifest.json`
  - Timeline scene manifest.

- `frontend/public/data/sylhet_2022/rivers.geojson`
  - OSM river data.

- `frontend/public/data/sylhet_2022/flood_extent_2022-05-25.geojson`
  - UNOSAT observed flood extent.

### Styles

- `frontend/src/styles/globals.css`
  - Scene panels, map labels, rain markers, surge labels, and timeline styling.

## Current Verification

The latest checks passed:

- `npx tsc -b` passed with `TSC=0`.
- Browser screenshot test ran with no page errors.
- River Surge scene rendered:
  - 2,576 DEM-derived water features.
  - Visible animated surge route.
  - Real map canvas.
  - Labels for river/floodplain locations.

Latest screenshot path:

- `C:\Users\akhil\Desktop\un\sylhet_surge_scene.png`

## Known Problems / Technical Debt

### 1. Some generated JSON has a UTF-8 BOM

PowerShell writes can add a BOM. The browser can read the manifest, but PowerShell `ConvertFrom-Json` can fail on served content that starts with `ï»¿`.

Recommended fix:

- Rewrite JSON files with UTF-8 without BOM using a Node script or editor that preserves plain UTF-8.

### 2. River surge route is still partly schematic

The route is based on the real river system and OSM rivers are present, but the thick animated route itself is a simplified explanatory path.

Recommended fix:

- Drive the animation directly along the real OSM river geometries.
- Use separate flow pulses on Barak, Surma, and Kushiyara segments.

### 3. Water is real-terrain derived but not gauge calibrated

The visible water surface is derived from Sylhet DEM lowlands. It is appropriate for explaining how low haor basins fill, but it is not a calibrated 2022 hydrodynamic simulation.

Recommended fix:

- Add calibration inputs if available:
  - river gauge levels,
  - discharge estimates,
  - embankments/roads,
  - time series water-level observations.

### 4. Peak 18 June polygon is not shipped

The raw SAR polygon was too dense for the local conversion path.

Recommended fix options:

- Install GDAL/ogr2ogr and simplify the shapefile in native GDAL before loading into GeoPandas.
- Use a tiling/vector-tile pipeline.
- Pre-simplify externally and ship a small browser-safe GeoJSON.

### 5. The separate Water Lab is not embedded

`/sylhet_waterlab.html` exists, but it is separate from the main scene map.

Recommended fix:

- Either embed it as a modal/deep-dive panel, or port the useful water simulation behavior into the MapLibre scene.

## What To Do Next

### Next build: Phase 5, Haor basin fills

Goal:

- Make the transition from river surge to floodplain spread feel real.

Tasks:

1. Keep the camera over Sylhet/Sunamganj lowlands.
2. Show the DEM-derived water surface expanding from stage 1 to stage 3.
3. Overlay the real UNOSAT 25 May observed polygon as the evidence layer.
4. Add a short label: `Observed by UNOSAT on 2022-05-25`.
5. Make it clear that the cyan terrain-water is the physical/predictive model surface, while the UNOSAT polygon is measured observation.

Suggested text:

`The surge reaches the low haor basin. Because the terrain is flat and low, water spreads outward instead of staying inside one channel.`

### Phase 6: Peak extent

Goal:

- Show the 18 June catastrophic peak honestly.

Tasks:

1. Keep the scene over Sylhet/Sunamganj.
2. Increase water stage to maximum.
3. Show the UNOSAT 840 km2 number prominently.
4. Keep caveat short: `Peak number is observed by UNOSAT; full SAR polygon is not shipped yet.`
5. Do not show the long technical caveat in the main UI.

Suggested text:

`By 18 June, UNOSAT measured about 840 km2 flooded in the analyzed area after the upstream rain and river surge.`

### Phase 7: Predictive model explanation

Goal:

- Explain how the same chain becomes a future flood forecast.

Model chain:

1. Detect Bay of Bengal moisture / rainfall forecast.
2. Detect orographic rain over Meghalaya.
3. Accumulate rainfall over Barak basin.
4. Route water through Barak -> Surma/Kushiyara.
5. Fill low DEM cells in Sylhet/Sunamganj.
6. Estimate exposed people / facilities / roads.
7. Trigger supply-chain and response planning.

Important wording:

- Do not claim exact calibrated prediction yet.
- Say: `forecast logic`, `risk estimate`, `physically based on real terrain`, `calibrated when live rain and river gauges are connected`.

### Phase 8: Impact layer

Goal:

- Show what gets affected.

Tasks:

1. Use existing backend facilities API if available.
2. Load schools, clinics, shelters, and roads.
3. Intersect points/roads with flood polygons or DEM-derived water cells.
4. Color affected assets red/orange.
5. Add counts to the scene panel.

Suggested text:

`When the low basin fills, BEACON checks which facilities, roads, and communities fall inside the modeled or observed water area.`

### Phase 9: Evidence panel

Goal:

- Add trusted humanitarian evidence numbers.

Tasks:

1. Wire UN Data Commons / relevant humanitarian data source.
2. Show affected population, children, WASH, health, shelter indicators if available.
3. Keep every number sourced.
4. Let user click a flood area or district and see evidence.

Suggested panel fields:

- Population exposed.
- Children exposed.
- Health facilities exposed.
- Schools exposed.
- WASH risk.
- Main source and date.

### Phase 10: Response panel

Goal:

- Turn the prediction/evidence into action.

Tasks:

1. Recommend supply packages based on exposed people and access constraints.
2. Add source-based costing assumptions.
3. Show delivery route / warehouse / last-mile constraints.
4. Connect to BEACON supply-chain tab.

Example response logic:

- If floodwater intersects roads, increase boat/last-mile difficulty.
- If schools/clinics are exposed, flag education/health continuity.
- If WASH risk is high, prioritize water purification and hygiene kits.

## Recommended Next Immediate Step

Do Phase 5 next.

Reason:

- The user already has the first four causal phases.
- The user specifically wants the story to show how the incident happened.
- The natural next visual is the haor basin filling after the river surge.
- This can reuse the real DEM-derived water surface and the real UNOSAT 25 May polygon.

Implementation plan for Phase 5:

1. Add staged water animation when clicking `Haor basin fills`.
2. Keep the camera close to Sylhet/Sunamganj lowlands.
3. Draw DEM-derived water first, then fade in the UNOSAT observed polygon.
4. Add a small source badge: `Model surface: SRTM DEM. Observation: UNOSAT 2022-05-25.`
5. Keep the UI clean and avoid long caveats in the scene bar.

## Important Product Direction

The best version of this is not a static disaster map. It is a proof-of-forecast story:

`Bay moisture -> Meghalaya rain -> river surge -> haor filling -> exposed people/assets -> response plan`

That is what makes BEACON predictive.

But the language must stay honest:

- Real: satellite imagery, terrain, rainfall layer, river geometry, UNOSAT observation.
- Predictive/illustrative: DEM water-fill model until calibrated with gauges/discharge.
- Observed evidence: UNOSAT polygons and area figures.

Use that distinction everywhere so the demo feels powerful and defensible.
