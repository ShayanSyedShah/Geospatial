# Plan: Iconic spiky 3D population map (Kontur-style)

## Context

The "Human Terrain" population visual looks weak because of the **data**, not the rendering. The current source (`frontend/public/data/hexagons_Bangladesh.json`) is:
- **Coarse** — H3 res‑7, only 2,616 cells for all Bangladesh.
- **Under‑5 only** — `population_u5`, a small fraction of real population.
- **Fake density** — `backend/scripts/subdivide_res7.py` splits each res‑6 cell's count *evenly* across its children, so neighbouring cells are near-identical → no sharp variation → no real peaks.

The famous "population spike" maps (Kontur / Topi Tjukanov style) get their drama from a **fine grid of real total-population** values: thousands of thin needles where a few dense cities erupt into sharp peaks over near-flat countryside. We will switch to that: **real total population at a fine resolution, rendered as thin glowing spikes on the dark basemap.**

The basemap is already ideal — `MAP_STYLE` uses ESRI satellite over a `#06121c` near-black background. We'll dim the satellite while the spike layer is active so the spikes glow.

**Goal:** Replace the coarse under‑5 hex spikes with a dense field of thin, glowing, height‑and‑color‑coded **total‑population** spikes that read instantly as a 3D population map.

## Approach

### Part A — Better data (the real fix): a fine total-population spike dataset

New script **`backend/scripts/build_population_spikes.py`** (uses the libs already in the backend: `rasterio`, `numpy`):

1. Download WorldPop **total population**, constrained 2020, 100 m for Bangladesh — a single raster:
   `https://data.worldpop.org/GIS/Population/Global_2000_2020_Constrained/2020/BSGM/BGD/bgd_ppp_2020_UNadj_constrained.tif`
   (one ~tens‑of‑MB file; cache under `backend/data/`).
2. **Block‑sum downsample** the 100 m grid to ~300–500 m cells (e.g. 4×4 block reduce) → keeps real density variation while cutting cell count to a renderable size.
3. Keep only cells with `pop ≥ 10`; emit a **lean tuple array** to keep the asset small:
   ```json
   { "max": 41234, "cell_m": 400, "spikes": [[90.41, 23.78, 5210], [90.42, 23.78, 4870], ...] }
   ```
   (`[lng, lat, pop]` rounded to 4 dp; ~80–150k spikes for Bangladesh → ~3–6 MB raw, ~1 MB gzipped — served fine via existing GZip).
4. Write to **`frontend/public/data/population_spikes_Bangladesh.json`**.

> Fallback if the WorldPop download is unavailable at build time: sum the four existing WorldPop age/sex rasters the backend already fetches (`bgd_{m,f}_{0,1}_2020.tif` are under‑5 only — instead pull the full age range, or use the single `ppp` raster above). The `ppp` single-raster path is simplest and is the recommended one.

### Part B — Render thin glowing spikes (`frontend/src/components/Globe.tsx`)

1. **Load** the new dataset (lightweight fetch in the Globe data effect, or via `api.ts` static path like the others): parse `{ max, spikes }` into `Spike[] = {lng,lat,pop}`.
2. **Replace** the current `humanBlockLayer` (the res‑7 `ColumnLayer` on `population_u5`) with a new spikes `ColumnLayer`:
   ```ts
   new ColumnLayer<Spike>({
     id: 'population-spikes',
     data: spikes,
     visible: showHumanAnalysis,
     extruded: true, filled: true, stroked: false, pickable: false,
     diskResolution: 6,
     radius: 130,                         // thin needle vs ~400 m cell spacing
     elevationScale: 1,
     getPosition: d => [d.lng, d.lat],
     getElevation: d => 120 + Math.sqrt(d.pop / maxPop) * 14000,  // √ so cities tower, rural stays low
     getFillColor: d => spikeHeatColor(d.pop / maxPop),           // height-driven ramp
     material: { ambient: 0.35, diffuse: 0.85, shininess: 60, specularColor: [255,255,235] },
     updateTriggers: { getElevation: [maxPop], getFillColor: [maxPop] },
   })
   ```
3. **New color ramp** `spikeHeatColor(t)` (replaces `greensColor`) — the classic glowing gradient (low→high): deep indigo → magenta → orange → pale yellow‑white:
   ```ts
   const HEAT: [number,number,number][] = [
     [25, 20, 70], [90, 30, 120], [190, 50, 90], [240, 110, 40], [255, 190, 70], [255, 245, 200],
   ];
   ```
   (lerp identically to the existing `greensColor` helper — reuse that interpolation code, just swap the palette.)
4. **Dim the basemap while spikes are active** so they glow: when `overlay.showHumanTerrain`, set the `satellite` raster-opacity low (e.g. `map.setPaintProperty('satellite','raster-opacity', 0.22)`), restore to `1` when off. The `#06121c` background then reads as night, spikes as city lights.
5. Keep the existing `LightingEffect` (already added) and the `mapZoom < 10.7` visibility gate.

### Part C — cleanup
- Remove now-unused `GREENS`/`greensColor`, `humanBlockHeight`/`humanDensity` on `population_u5` (or repurpose), and the old `humanBlockLayer` block.
- Add `population_total` is **not** needed on the hex schema — spikes are their own dataset, decoupled from the flood hexagons. (Hex flood layer stays as-is.)

## Critical files

- **Create** `backend/scripts/build_population_spikes.py` — downloads WorldPop `ppp` raster, downsamples, emits lean JSON.
- **Create** `frontend/public/data/population_spikes_Bangladesh.json` — the spike dataset (script output).
- **Modify** `frontend/src/components/Globe.tsx` — load spikes, new spikes `ColumnLayer`, `spikeHeatColor`, basemap dimming; remove old under‑5 spike layer + greens.
- (Optional) `frontend/src/services/api.ts` — add a static path `population_spikes: (c) => '/data/population_spikes_'+c+'.json'`.

## Performance & demo-safety
- ~80–150k thin columns render smoothly in deck.gl 9.3 `ColumnLayer`; the JSON is a static asset (gzipped ~1 MB), no backend needed at demo time.
- If the spike count is too high on a weak laptop, the script can raise the `pop ≥ N` threshold or coarsen `cell_m` to 600 m to thin it out.

## Verification
1. Run `python backend/scripts/build_population_spikes.py` → confirm `population_spikes_Bangladesh.json` written with tens of thousands of spikes and a sane `max`.
2. `cd frontend && npm run dev`; hard‑refresh http://localhost:5173/. Enable Human Terrain.
3. Confirm: a **dense field of thin spikes**, near‑flat over rural land, with **sharp tall peaks over Dhaka/Chittagong/Sylhet**, glowing indigo→yellow by height, on a dimmed near‑black map — the iconic spiky look.
4. Tilt/rotate: spikes catch the directional light; cities read as bright mountain clusters.
5. Toggle Human Terrain off → satellite opacity restores to full; spikes disappear.
