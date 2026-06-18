# Methodology & Evidence Chain

Every value shown in the app is reproducible from the steps below and traceable
to a source via `GET /api/evidence/{h3_id}`.

## 1. Spatial unit — H3 hexagons (resolution 6)
We fill Uganda's boundary with Uber H3 cells at **resolution 6** (~3.2 km edge,
~36 km² each). This is the decision-grade granularity for pre-positioning: fine
enough to localise risk, coarse enough to render thousands of cells on a phone.
(h3-py v4: `geo_to_h3shape` → `h3shape_to_cells`.)

## 2. Flood risk — GloFAS / JRC Global Flood Hazard
- Source: JRC Global River Flood Hazard maps (Copernicus EMS), produced with the
  **LISFLOOD** model — the same lineage as the operational GloFAS system used by
  UNOCHA/WFP/IFRC.
- Layers: return periods **rp10 / rp100 / rp500** (water depth in metres).
- Per hexagon we take the **mean** depth (zonal statistics) and normalise by a
  reference depth to a **0–1 risk score**, clipped at 1.0.
- The UI's **4h / 20h / 7d** horizons map to rp10 / rp100 / rp500 — shorter
  horizons = more frequent, lower-magnitude events; longer = rarer, severe events.
  (This replaces a fabricated time-decay with real, citable hazard tiers.)

## 3. Population — WorldPop 2020 age/sex structures
- 100 m gridded population counts, age- and sex-stratified.
- **Children under-5** = sum of four grids: female age 0, male age 0, female
  age 1–4, male age 1–4.
- Per hexagon we **sum** the people-per-pixel counts (zonal statistics).

## 4. Infrastructure — schools & clinics
- Schools: Giga (ITU/UNICEF) cross-referenced with OpenStreetMap.
- Clinics: Healthsites.io / OpenStreetMap community data.
- Geometry maths done in a **metric CRS (EPSG:3857)**: count facilities within
  5 km of each hexagon centroid (buffer + spatial join) and the **distance to the
  nearest clinic** (`sjoin_nearest`). Avoids the common degrees-as-metres bug.

## 5. Uncertainty & decision rule
- Surfaced uncertainty **±8 %** reflects weather-forecast, hydrological-model, and
  population-estimation error from the published validation literature.
- Decision rule: **if flood risk > 60 %, prioritise evacuation / pre-positioning.**

## 6. Why precompute?
Steps 1–4 run once (dev/build) and are cached to `data/hexagons.parquet`. The API
serves that table, so the deployed service is small, starts instantly, and needs
none of the multi-hundred-MB rasters at runtime.
