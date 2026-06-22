# BEACON Sylhet 2022 — THE EVERYTHING BUILD BIBLE

> One document that covers **everything that needs to be done**: the product, the architecture, **every dataset** (with exact URLs, formats, access, ingest steps, caveats — including **GeoSight**), how to build **each overlay** (population density as **3D bars** front-and-center), the **model**, the **story engine**, the **water physics**, the **backend**, the **task plan**, and the **honesty/ethics** rules.
>
> **Status:** PLAN ONLY (no build yet). **Branch/base:** `sylhet-case-study` (force-pulled from `codex/sylhet-case-study-map` — the 3D-terrain Globe + `waterlab` GPU sim + prep scripts). Local only; `main` untouched.
> **Companion docs:** product vision = `docs/2022-sylhet-flood-beacon-case-study-plan.md`; team split = `2026-06-20-sylhet-build-and-team-split.md`.

---

## TABLE OF CONTENTS
1. Product & thesis
2. The base we're building on (codex)
3. Architecture & data flow
4. **The dataset catalog (everything, with ingest)** — incl. GeoSight
5. Overlay A — **Population density as 3D bars** (flagship)
6. Overlay B — Flood progression over time
7. Overlay C — Economic vulnerability (green→red)
8. Overlay D — Facilities & access
9. Overlay E — Disease / aftermath risk
10. Context beats — rainfall, rivers/hydrology, DEM/haor
11. The water-physics deep-dive
12. The decision model (priority, vulnerability index, aftermath, cost, siting)
13. The story engine (12 beats)
14. GeoSight integration (data + alignment + export)
15. Backend endpoints & data-prep scripts
16. Build phases (how to make everything, in order)
17. Honesty, ethics, caveats
18. Success criteria

---

## 1. Product & thesis

BEACON is a **focused, evidence-grade reconstruction of the June 2022 Sylhet/Sunamganj flood** — story-first, then free-explore (Hybrid). It answers, in order: **what happened → where the water went → who was exposed → who was hit hardest → what responders should do**, ending in a **costed, village-level response protocol** where every number is **click-to-source**.

**Real anchors (cite all):** ~7.2M affected; ~4M stranded incl. **1.6M children**; **84% of Sylhet / 94% of Sunamganj** underwater; 481,827 evacuated to **1,615 shelters**; **90% of Sylhet-division clinics inundated**; appeal **US$58.4M, ~23.5% funded**; **19,918** waterborne disease cases by late July.
Sources: UN RC Sit Update #1 (19 Jun 2022); UNICEF press release & SitRep No.4/6; Flash Floods HRP 2022; bdnews24 (20 Jul 2022).

---

## 2. The base we're building on (codex — already on this branch)

- `frontend/src/components/Globe.tsx` — MapLibre + deck.gl with **AWS Terrarium 3D terrain**, **OpenFreeMap 3D buildings** (`fill-extrusion`), **neighbour-country blue mask** (`utils/neighborMask.ts`), flood `BitmapLayer`, `H3HexagonLayer`, facility `IconLayer`, route `PathLayer`, NASA SEDAC population WMTS.
- Water physics: `public/waterlab.html` (Three.js virtual-pipes shallow-water over real **Sirajganj** DEM+OSM+satellite), `src/components/PhysicsView.tsx`, `src/water/MapWaterLayer.ts` + `public/sirajganj_dem.json`; prep scripts `public/prep_waterlab_{dem,osm,sat}.py`.
- `src/components/Reality3DModule.tsx` — Cesium Google 3D Tiles (optional; needs key).
- Shell: `App.tsx`, `BeaconShell.tsx`, `FloodModule.tsx`, `TopBar.tsx`, `SidePanel.tsx`.
- `public/data/` — `hexagons_Bangladesh.json`, `regions_Bangladesh.json`, `countries.json`, `bgd_adm0.geojson`; flood PNGs. Dep: **three.js ^0.160**.
- Stack: MapLibre GL v5 + deck.gl v9.3.x + three.js; React 19 + Vite + TS. Backend: FastAPI + GeoPandas/rasterio/h3 (in `backend/`).

**Reuse, don't rebuild:** terrain/buildings/mask, the H3 layer, the timeline, the waterlab sim, the prep scripts, the backend H3/zonal-stats pipeline.

---

## 3. Architecture & data flow

```
DATA PREP (offline, Python)                 RUNTIME
─────────────────────────────              ─────────────────────────────
UNOSAT/CEMS/S1  ─► flood GeoJSON (dated t) ─┐
Kontur H3 + WorldPop ─► cells.json (h3,pop,pop_u5) ─┤
Meta RWI + proxies ─► cells.json (rwi, vuln) ──────┤
OSM/HDX ─► facilities.json, roads.json ────────────┤   FastAPI  ─►  /api/sylhet/*  ─►  React app
GPM/CHIRPS ─► rainfall frames ─────────────────────┤   (serves cells, flood-progression,        (MapLibre + deck.gl
FFWC/GloFAS ─► hydrograph.json ────────────────────┤    priority, aftermath; computes model)     + three.js waterlab)
FABDEM/Terrarium ─► DEM (waterlab) ────────────────┘
```
- **Spatial unit:** H3 res 7–8 for modeling/overlays; union/upazila for reporting; village points for storytelling.
- **AOI:** Sylhet + Sunamganj bbox (≈ 90.9–92.5°E, 24.2–25.5°N). Town deep-dive bbox(es) for waterlab.
- **All map layers share ONE H3 cell table** (`cells.json`: `h3, population, pop_u5, rwi, vuln, flood_t, district`) so we can **extrude by population and color by vulnerability in a single layer**.

---

## 4. THE DATASET CATALOG (everything — name · URL · format · res · license · access · ingest · caveat)

### 4.1 Flood extent (observed, time series)
- **UNOSAT/UNITAR water-extent (this event)** — HDX. Dates: **25 May, 28 May, 18 Jun, 19 Jun 2022**. Polygons (Shapefile + GeoJSON) + PDF. Free, no login (HDX pages 403 to bots → use browser or **HDX CKAN API** `https://data.humdata.org/api/3/action/package_search?q=sylhet%20water%20extent`). Magnitudes: 25 May ~420 km²/~307k exposed; 18 Jun ~840 km²/~839k exposed. **Ingest:** download GeoJSON per date → clip to AOI → tag `t` (0,0.33,0.66,1) + ISO date → merge to `sylhet_flood_progression.geojson`. **Caveat:** discrete snapshots; separate haor permanent water.
- **Copernicus CEMS Global Flood Monitoring (GFM)** — `https://global-flood.emergency.copernicus.eu/`. Daily Sentinel-1 flood extent, ~20 m, GeoTIFF/WMS, free (registration). Best for smooth daily frames.
- **Sentinel-1 SAR via Google Earth Engine** — collection `COPERNICUS/S1_GRD`, free GEE account. Threshold/change-detection May–Jul 2022 → custom day-by-day stack; export GeoTIFF or vectorize. Method validated for this exact event (ScienceDirect GEE Sylhet 2022 study). **Most flexible for animation.**
- **NASA MODIS NRT flood** — `https://floodmap.modaps.eosdis.nasa.gov/` (secondary; coarse, cloud-limited).
- **Historical baseline:** NASA SEDAC Global Flood Database `https://sedac.ciesin.columbia.edu/data/set/pend-gfd-global-flood-database`.

### 4.2 Permanent/seasonal water (to subtract)
- **JRC Global Surface Water** (Pekel et al.) via GEE `JRC/GSW1_4/GlobalSurfaceWater` — `occurrence`/`seasonality` band → mask haor permanent water so the overlay shows the **flood anomaly**, not normal wetland.

### 4.3 Population (for 3D bars — see §5)
- **Kontur Population — Bangladesh, 400m H3** — HDX `https://data.humdata.org/dataset/kontur-population-bangladesh`. GeoPackage/GeoJSON/CSV, each hex has H3 id + population. **CC BY 4.0.** *Already H3 → drops into `H3HexagonLayer`.* **Primary.**
- **WorldPop Age & Sex 100m (BGD)** — `https://hub.worldpop.org/geodata/summary?id=16810` (repo already has `bgd_f_0/1_2020.tif`, `bgd_m_0/1_2020.tif`). GeoTIFF, CC BY 4.0. **For under-5 bars** (aggregate to the same H3).
- **WorldPop total 100m** — `https://data.worldpop.org/GIS/Population/Individual_countries/BGD/Bangladesh_100m_Population.7z`.
- **NASA SEDAC GPWv4** — `https://sedac.ciesin.columbia.edu/data/collection/gpw-v4` (NASA-credibility layer; already wired as a WMTS overlay in codex Globe).
- **Meta HRSL 30m** — HDX (very dense; only if city-scale needed; aggregate to H3 first).

### 4.4 Economic status / vulnerability (green→red — see §7)
- **Meta Relative Wealth Index (RWI) — Bangladesh** — HDX `https://data.humdata.org/dataset/relative-wealth-index`. **CSV `latitude,longitude,rwi,error`**, ~2.4 km, DHS-validated (PNAS 2022), CC BY 4.0. **Primary.** RWI ≈ −1.5…+1.5 relative within country.
- **VIIRS Nightlights** — NASA Black Marble / Earth Observation Group (proxy for activity/wealth).
- **Road access / building density** — from OSM (§4.5) + GHSL built-up `https://human-settlement.emergency.copernicus.eu/`.
- **Official poverty:** BBS/HIES `https://bbs.gov.bd/`, World Bank PIP `https://pip.worldbank.org/country-profiles/BGD`, DHS `https://dhsprogram.com/`, UNICEF MICS `https://mics.unicef.org/` (housing-material proxies). Use for the evidence panel + the index inputs.

### 4.5 Facilities, roads, admin (§8)
- **OSM / Geofabrik Bangladesh** — `https://download.geofabrik.de/asia/bangladesh.html` (buildings, roads, waterways; the waterlab OSM script already uses Overpass).
- **HDX Bangladesh** — `https://data.humdata.org/group/bgd` (health facilities, schools, roads, settlements).
- **Bangladesh GeoDASH** — `https://geodash.gov.bd/` (national geoportal).
- **geoBoundaries** — `https://www.geoboundaries.org/` (adm1/2/3 Sylhet/Sunamganj). Repo has `bgd_adm2.geojson`.
- **Giga (schools)** `https://maps.giga.global/` · **Healthsites.io (clinics)** `https://healthsites.io/`.

### 4.6 Rainfall (Beat 3)
- **NASA GPM IMERG** — `https://gpm.nasa.gov/data/imerg` (half-hourly/daily precip, ~10 km, GeoTIFF/NetCDF; GES DISC access). Animate accumulated rain May–Jun 2022 over Meghalaya/Assam/Sylhet.
- **CHIRPS** — `https://www.chc.ucsb.edu/data/chirps` (daily rainfall, 5 km, free).

### 4.7 Rivers & hydrology (Beat 4)
- **Bangladesh FFWC/BWDB** — `https://ffwc.gov.bd/`, historical 2022 station water levels `http://old.ffwc.gov.bd/flashflood/data_wl.php` (Surma/Kushiyara gauges → hydrograph + danger-level line).
- **GloFAS** — `https://www.globalfloods.eu/` (discharge reanalysis/forecast via Copernicus CDS, free API key) for the Barak-Surma-Kushiyara chain.
- **Google Flood Hub** — `https://sites.research.google/floods/` (gauge forecasts; API waitlist-gated — viewer is free).
- **River lines:** OSM waterways / HydroSHEDS for Barak→Surma/Kushiyara geometry + flow arrows.

### 4.8 Elevation / haor basin (Beats 4 & 11, waterlab)
- **FABDEM** (bare-earth — removes tree/building "dam" error, critical for flat haor) → fallback **Copernicus GLO-30** / **AWS Terrarium** (codex prep uses Terrarium). For lowland/haor mask + the water sim DEM.

### 4.9 Disease, cost, standards (§12)
- **icddr,b flood studies** (PMC8629377; PubMed 16760521/18981509) — multipliers: diarrhoea ×1.5–2, cholera ×2 proportion (NOT ×6).
- **IHME GBD geospatial** `https://ghdx.healthdata.org/` — under-5 diarrhoea baseline incidence.
- **Sphere Handbook 2018** `https://spherestandards.org/handbook-2018/` — 15 L/person/day, 1 latrine/20, 3.5 m²/person, 2,100 kcal.
- **UNICEF Supply Catalogue** `https://supply.unicef.org/` — ORS+zinc ~$0.37, LLIN ~$2, measles ~$0.20, IEHK ~$0.31/person/mo; food ~$1.29/person/day (WFP/UNHCR); shelter kit ~$30–80.
- **Response context:** ReliefWeb `https://reliefweb.int/country/bgd`, IFRC `https://www.ifrc.org/emergency/bangladesh-floods`, UNICEF Bangladesh, WHO, DGHS `https://dghs.gov.bd/`.

### 4.10 GeoSight (UNICEF) — see §14
- Platform `https://geosight.unicef.org/` · API docs `https://geosight.unicef.org/en-us/api/v1/docs/` · OSS `https://github.com/unicef-drp/GeoSight-OS` · docs `https://unicef-drp.github.io/GeoSight-OS-Documentation/`. Use as (a) an indicator/admin data source via its REST API, (b) the alignment/deployment target (judges' ecosystem), (c) an **export** destination for BEACON's computed priority layers.

---

## 5. OVERLAY A — POPULATION DENSITY AS 3D BARS (flagship)

**Goal:** extruded hexagon "bars" rising from the map — taller = more people — so "who the water reaches" is instantly legible, and (killer move) **color the same bars by vulnerability** so height = people, color = how hard they'd be hit.

### 5.1 Data → cells
1. Load **Kontur 400m H3** for the AOI → `(h3, population)`.
2. Aggregate **WorldPop under-5** (4 rasters) into the same H3 cells → `pop_u5` (backend `spatial_operations.population_under5` already does zonal sums; reuse).
3. Optionally roll H3 res-8→res-7 for the regional view (`h3.cell_to_parent`) to keep bar count sane.
4. Write `frontend/public/data/sylhet_cells.json` = `[{h3, population, pop_u5, rwi, vuln, district}]` (shared by overlays A & C).

### 5.2 Render — deck.gl `H3HexagonLayer` (extruded)
```ts
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';

const metric = showUnder5 ? 'pop_u5' : 'population';
const maxVal = Math.max(...cells.map(c => c[metric]), 1);

new H3HexagonLayer({
  id: 'population-bars',
  data: cells,
  getHexagon: d => d.h3,
  extruded: true,
  elevationScale: 12,                         // tune so tallest bar reads at zoom ~9–11
  getElevation: d => d[metric],               // height = people
  elevationRange: [0, 1],                      // we pre-scale via getElevation*elevationScale
  getFillColor: d => popColor(d[metric] / maxVal),   // or vulnColor(d.vuln) for the combo view
  coverage: 0.92,
  pickable: true,
  material: { ambient: 0.5, diffuse: 0.6, shininess: 32, specularColor: [60,60,60] },
  updateTriggers: { getElevation: [metric], getFillColor: [metric, colorMode] },
});

// one LightingEffect on the Deck so bars read as 3D
const lighting = new LightingEffect({
  ambientLight: new AmbientLight({ intensity: 1.0 }),
  dirLight: new DirectionalLight({ intensity: 1.0, direction: [-1, -3, -1] }),
});
```
**Gotchas:** colors are `[r,g,b,a]` 0–255; keep ONE H3 resolution (mixed res → slow `highPrecision`); wrap changing accessors in `updateTriggers`; `elevationScale × getElevation = meters` of bar height — tune `elevationScale` to the chosen camera pitch (codex Globe uses pitch ~55°).
**Toggle:** Total ↔ Under-5 ↔ (combo: extrude pop, color vuln). **Legend:** a height key (people) + the color key.
**Alt:** `ColumnLayer` (diskResolution 6) if you want free-standing bars off the H3 grid; `HexagonLayer` only if binning raw points live (heavier).

### 5.3 Story use (Beat 7)
Camera pitches over the flooded AOI; bars fade up (animate `elevationScale` via deck `transitions`); the tallest bars sitting inside the flood extent = the human priority. Caption: "~4M stranded, 1.6M children."

---

## 6. OVERLAY B — FLOOD PROGRESSION OVER TIME

**Data:** §4.1 merged into `sylhet_flood_progression.geojson` (feature `t` ∈ [0,1] + ISO date); subtract JRC permanent water (§4.2) so it's the anomaly.
**Render (recommended):** one `GeoJsonLayer` + `DataFilterExtension`:
```ts
import { DataFilterExtension } from '@deck.gl/extensions';
new GeoJsonLayer({
  id: 'flood', data: floodGeojson, filled: true, getFillColor: [60,130,230,150],
  getFilterValue: f => f.properties.t, filterRange: [0, time],     // time from the slider
  filterSoftRange: [time - 0.05, time],                            // feathered flood front
  extensions: [new DataFilterExtension({ filterSize: 1 })],
  updateTriggers: { getFillColor: [time] },
});
```
Drive `time` from a timeline (reuse `TimelineControl` pattern). Water "rises" = expand `filterRange` + ramp alpha. **Fallback:** pre-bake one PNG per date (reuse `flood_raster.py` colorizer) and cross-fade two `BitmapLayer`s.
**Timeline states:** baseline → rainfall buildup → river rise → peak (18–19 Jun) → persistence → recession. Show permanent water in muted grey/blue beneath.

---

## 7. OVERLAY C — ECONOMIC VULNERABILITY (green→red)

**Data:** Meta RWI (§4.4) binned into the H3 cells (mean rwi per cell), plus optional proxies → a **Vulnerability Screening Index** `vuln ∈ [0,1]`:
```
vuln = norm( w1*(-rwi_z) + w2*nonDurableHousing + w3*lowNightlight + w4*poorRoadAccess + w5*highDependency )
```
**Render:** flat `H3HexagonLayer` (`extruded:false`) colored by `vuln` (or the combo: extrude pop, color vuln). Domain = 5–95th pct of the AOI for contrast. Manual diverging lerp (no dep):
```ts
function vulnColor(t){ // t 0(low)->1(high) ; green->yellow->red
  const a=[26,152,80], b=[255,255,191], c=[215,48,39];
  const lerp=(x,y,k)=>Math.round(x+(y-x)*k);
  const [p,q,k]= t<0.5 ? [a,b,t*2] : [b,c,(t-0.5)*2];
  return [lerp(p[0],q[0],k),lerp(p[1],q[1],k),lerp(p[2],q[2],k),170];
}
```
**Language (ethics):** label "modeled vulnerability," never "this house is poor."

---

## 8. OVERLAY D — FACILITIES & ACCESS
Clinics, schools, shelters (`IconLayer`), roads cut by flood + safe/boat routes (`PathLayer`). Data: OSM/HDX/GeoDASH/Giga/Healthsites. **Model outputs:** nearest safe clinic, schools/clinics ∩ flood, villages beyond a health-access threshold, roads ∩ flood, candidate shelter sites above the flood line (reuse `facility_metrics`).

## 9. OVERLAY E — DISEASE / AFTERMATH RISK
A tinted H3 layer / `HeatmapLayer` from flood-duration × population × WASH-gap × shelter-crowding (§12). Two-speed: waterborne early, vector-borne later.

## 10. CONTEXT BEATS — rainfall, rivers, DEM/haor
- **Rainfall (Beat 3):** GPM IMERG/CHIRPS accumulated-rain raster animation + flow arrows from Meghalaya/Assam (a `BitmapLayer` sequence or an animated colormap; arrows via `PathLayer`/icons).
- **Rivers (Beat 4):** Barak→Surma/Kushiyara lines (OSM/HydroSHEDS) + gauge markers + a hydrograph side-panel (FFWC water levels with the danger-level line; GloFAS discharge optional).
- **DEM/haor (Beat 2/4):** Terrarium/FABDEM lowland mask to show the basin that collects and holds water.

## 11. WATER-PHYSICS DEEP-DIVE (Beat 6)
Reuse the codex Three.js virtual-pipes sim (`waterlab.html`). **Add Sylhet town:** run `prep_waterlab_dem.py` / `_osm.py` / `_sat.py` with a Sylhet-town bbox → `waterlab_dem_sylhet.js`, `waterlab_osm_sylhet.js`, `sylhet_sat.js` → copy `waterlab.html` → `waterlab_sylhet.html` (swap script srcs) → open via `PhysicsView src="/waterlab_sylhet.html" place="Sylhet"`. Optionally use `MapWaterLayer` for in-map water at zoom ≥9.2 (needs a Sylhet `*_dem.json`). The river boundary slider = the Surma/Kushiyara level (later: real BWDB gauge).

## 12. THE DECISION MODEL
**Priority (per cell/village):**
```
priority = flood_severity × exposed_population × (1 + vuln) × access_penalty × service_disruption × disease_risk
flood_severity      = depth_score + duration_score + likelihood_score
exposed_population  = population + under5_weight × pop_u5
access_penalty      = dist_to_safe_road + dist_to_clinic + road_cut
service_disruption  = flooded_schools + flooded_clinics + shelter_gap
disease_risk        = wash_gap + shelter_crowding + stagnant_water
```
**Aftermath disease (two-speed, ranges only):** `extra = pop_exposed × baseline × multiplier × (window_weeks/52)`; waterborne 0–2 wk (diarrhoea ×1.5–2, cholera ×2 proportion), vector-borne 3–8 wk; calibrate to the real **19,918** cases.
**WASH/cost/siting (Sphere/UNICEF):**
```
safe_water_gap_l_day = affected × 15 − verified_supply
emergency_toilets    = ceil(affected / 20)
food_kcal_day        = affected × 2100
covered_area_m2      = displaced × 3.5
ORS_need             = expected_diarrhea_cases × sachets_per_case
total_cost           = Σ(people_needing_item × unit_cost)   // vs real $58.4M @ 23.5%
site_score           = elevation_above_flood × proximity_to_clinic_road × existing_building_capacity  // exclude below flood line
```
Output categories: rescue/evac · WASH · food/cash · mobile health · shelter siting · disease surveillance · school continuity.

## 13. THE STORY ENGINE (12 beats)
`steps.ts` = array of `{ camera, overlays, narrative, panels }`. Drive with `IntersectionObserver` (scroll) + Prev/Next; fly camera with deck `FlyToInterpolator` (or `map.flyTo`); toggle overlay state per beat. Beats: Open → Basin → Rain → Rivers → Water Spreads → Into the Streets (waterlab) → People (3D bars) → Who's Hit Hardest (vuln) → Child + Aiden → Protocol → Aftermath → Evidence. Hybrid: story first, then "Explore" frees the layer controls.

## 14. GEOSIGHT INTEGRATION (UNICEF)
GeoSight is UNICEF's open geospatial dashboard platform — the judges' ecosystem.
- **As a data source:** pull indicators/admin layers via the REST API (`https://geosight.unicef.org/en-us/api/v1/docs/`) — e.g., admin boundaries, child indicators — to enrich the vulnerability index / evidence panel. Cache responses into `sylhet_cells.json` during prep (don't hard-depend on it at runtime).
- **As alignment/credibility:** frame BEACON as "GeoSight-compatible" — same admin units, same indicator provenance; cite GeoSight-OS (`github.com/unicef-drp/GeoSight-OS`).
- **As an export target:** generate a GeoSight-style indicator (the per-union priority score) as a CSV/GeoJSON that could be uploaded to a GeoSight project — show "BEACON → GeoSight" as the deployment story.
- Caveat: GeoSight write/API auth may need a key; for the demo, treat read as enrichment + export as a generated file, with a clear note.

## 15. BACKEND ENDPOINTS & DATA-PREP SCRIPTS
**Prep (Python, `backend/scripts/`):** `fetch_sylhet_flood.py` (UNOSAT/GFM → dated GeoJSON), `fetch_sylhet_pop.py` (Kontur+WorldPop → cells), `fetch_sylhet_rwi.py` (Meta RWI + proxies → vuln), `fetch_sylhet_facilities.py` (OSM/HDX), `fetch_rainfall.py` (GPM/CHIRPS frames), `fetch_hydro.py` (FFWC/GloFAS hydrograph), plus the waterlab prep for the Sylhet bbox.
**API (`backend/app/sylhet.py` + `main.py`):** `GET /api/sylhet/cells` (h3+pop+pop_u5+rwi+vuln), `GET /api/sylhet/flood-progression`, `GET /api/sylhet/hydrograph`, `GET /api/sylhet/priority`, `GET /api/sylhet/aftermath?weeks=&depth=`, `GET /api/sylhet/facilities`. Reuse `spatial_operations.py`, `trust.py` patterns. (For a pure-frontend fallback, the prep can write straight into `frontend/public/data/` and the app reads static files — matches codex's `public/data/` approach.)

## 16. BUILD PHASES (how to make everything, in order)
- **P0 — Foundation:** confirm codex base runs; turn on terrain/buildings/mask; set the Sylhet AOI; make the app **story-first** (Sylhet default).
- **P1 — Cells:** ingest Kontur + WorldPop under-5 → `sylhet_cells.json`; render **population 3D bars** (§5). *(highest visual payoff first)*
- **P2 — Flood progression:** ingest UNOSAT/GFM (+permanent-water subtract) → animate over the timeline (§6).
- **P3 — Vulnerability:** Meta RWI + proxies → `vuln`; green→red + combo (extrude pop, color vuln) (§7).
- **P4 — Facilities & access:** OSM/HDX → facilities/roads + access model (§8).
- **P5 — Context beats:** rainfall (GPM/CHIRPS) + rivers/hydrograph (FFWC/GloFAS) + DEM/haor (§10).
- **P6 — Water deep-dive:** Sylhet waterlab via prep scripts + `PhysicsView` (§11).
- **P7 — Model + backend:** `/api/sylhet/*`, priority, aftermath, cost, siting (§12, §15).
- **P8 — Story engine:** 12-beat scrollytelling + Hybrid free-explore (§13).
- **P9 — Decision panels:** priority list, costed response, two-speed aftermath, evidence/click-to-source.
- **P10 — GeoSight:** enrichment pull + priority export + alignment framing (§14).
- **P11 — Content + ethics:** narrative copy, composite child (labelled), Aiden bridge, citations.
- **P12 — Polish + verify:** `tsc -b` + `npm run build` clean; endpoints 200; Playwright screenshots of every beat; perf (animate uniforms, one H3 res, `visible` toggles).
(For a 4-person parallel split of these, see `2026-06-20-sylhet-build-and-team-split.md`.)

## 17. HONESTY, ETHICS, CAVEATS
- **Vulnerability:** "modeled vulnerability from poverty/housing/access/remote-sensing proxies," not household truth; RWI is relative within-country; DHS GPS displaced; nightlights/footprints are proxies.
- **Flood:** SAR misclassifies urban/vegetation/wetland; MODIS coarse/cloud-limited; **separate haor seasonal water from flood anomaly** (use JRC GSW).
- **Disease:** waterborne early, dengue post-recession, malaria localized/surveillance-based; ranges + confidence; **cholera ×2 not ×6**; calibrate to real numbers.
- **Personal:** composite/anonymized child ("Composite child story based on documented 2022 Sylhet impacts"); Aiden = team testimony; Myanmar is a parallel anecdote, not Sylhet data.
- **Access flags:** HDX bot-block → browser/CKAN + PNG fallback; Google Flood Hub API / Cesium / GeoSight write may need keys → free alternatives (Terrarium/OpenFreeMap/UNOSAT/static export).
- **Every on-screen number is click-to-source** (the evidence chain — the whole point).

## 18. SUCCESS CRITERIA
1. App opens as the **Sylhet 2022 case study**, story-first (Hybrid), in real 3D.
2. **Population renders as 3D bars** (toggle total/under-5/combo), colored by vulnerability; flood **animates day-by-day** with permanent water separated; vulnerability green→red; facilities/roads; rainfall + hydrograph context.
3. The **water deep-dive** shows real flowing water in a Sylhet town from a real DEM.
4. The **priority list + costed response + two-speed aftermath** compute from real, cited data, calibrated to the real 2022 figures; GeoSight enrichment + export demonstrated.
5. `tsc -b` + `npm run build` clean; backend endpoints 200; screenshots of every beat, zero console errors; every number click-to-source.
6. It reads as **one coherent humanitarian-intelligence story**, not a generic map.
```
