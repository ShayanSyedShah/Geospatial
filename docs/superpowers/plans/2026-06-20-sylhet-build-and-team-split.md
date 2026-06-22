# BEACON Sylhet 2022 — Build Plan + 4-Person Conflict-Free Work Split

> **Status:** PLAN ONLY (no build yet).
> **Branch / base:** `sylhet-case-study` (force-pulled from `codex/sylhet-case-study-map`). This IS the foundation. Local only; do not push; `main` untouched. Prior crisis-console work is parked on `crisis-response`.
> **Product vision:** see `docs/2022-sylhet-flood-beacon-case-study-plan.md` (the codex case-study plan). This document is the **build breakdown + team division**, built ON the codex code.

---

## 1. What we're starting from (the codex base — confirmed on this branch)

The app already has, in `frontend/`:
- **`src/components/Globe.tsx`** — MapLibre + deck.gl map with: AWS **Terrarium 3D terrain** (+hillshade/sky, currently partly commented), **OpenFreeMap 3D buildings** (`fill-extrusion`, zoom ≥14), **neighbour-country blue mask** (`utils/neighborMask.ts` from `bgd_adm0.geojson`), flood `BitmapLayer` tiers, `H3HexagonLayer`, facility `IconLayer`, route `PathLayer`, NASA SEDAC population WMTS overlay.
- **Water physics (built):** `public/waterlab.html` (Three.js virtual-pipes shallow-water sim over real **Sirajganj** DEM+OSM+satellite, depth-graded water, click probe), `src/components/PhysicsView.tsx` (modal wrapper), `src/water/MapWaterLayer.ts` (in-map water custom layer) + `public/sirajganj_dem.json`, prep scripts `public/prep_waterlab_{dem,osm,sat}.py`.
- **`src/components/Reality3DModule.tsx`** — Cesium Google Photorealistic 3D Tiles clipped to Bangladesh (optional; needs Google key).
- **Shell:** `App.tsx` + `BeaconShell.tsx` (modules: overview/flood/supply/complaints/education), `FloodModule.tsx` (orchestrator), `TopBar.tsx`, `SidePanel.tsx` (Map-layers incl. population toggle).
- **`public/data/`** — `hexagons_Bangladesh.json`, `regions_Bangladesh.json`, `countries.json`, `bgd_adm0.geojson`; flood PNGs.
- Dep already added: **three.js ^0.160**.

**Gap to the vision:** the codex base is whole-Bangladesh + a Sirajganj water deep-dive. The case-study plan wants a **Sylhet 2022, story-first** experience with **flood-progression-over-time**, **population 3D bars**, **vulnerability green→red**, a **priority/aftermath model**, and the **chapter narrative** (child + Aiden). That's what this build adds.

---

## 2. The story we're building (12 beats — the spine; full detail in the vision doc)

Hybrid mode: the story auto-plays (camera flies + overlays toggle per beat), then "Explore" unlocks free layer control + the water deep-dive.

1. **Open** — Bangladesh in 3D, neighbours blue, fly to the NE.
2. **The Basin** — Sylhet/Sunamganj, Surma/Kushiyara, haor lowland, villages/clinics/schools.
3. **The Rain** — upstream rainfall (Meghalaya/Assam) animation + flow arrows.
4. **Rivers Rise** — Barak→Surma/Kushiyara, gauge hydrograph, danger-level crossing.
5. **The Water Spreads** — flood progression 25 May→18/19 Jun (timeline); permanent vs anomaly water; 84%/94% under.
6. **Into the Streets** — zoom into a town → the GPU water sim (Sirajganj built; Sylhet town added).
7. **The People** — population 3D bars; toggle under-5; ~4M stranded, 1.6M children.
8. **Who's Hit Hardest** — Vulnerability Screening Index green→red over the flood.
9. **One Child + Aiden** — composite child vignette (labelled) + Aiden/Myanmar motivation bridge.
10. **BEACON Protocol** — village/union priority list + costed response vs the real response.
11. **Aftermath** — two-speed disease (waterborne 0–2 wk, vector 3–8 wk), WASH/cost/siting.
12. **Evidence & Sources** — every number click-to-source.

---

## 3. Data + model (what each beat needs — real, cited)

- **Flood progression:** UNOSAT dated water-extent (25 May, 28 May, 18 Jun, 19 Jun; HDX, free) + CEMS GFM / Sentinel-1; separate haor permanent water. Render: dated GeoJSON + deck `DataFilterExtension` driven by the timeline (fallback: PNG-per-date cross-fade).
- **Population:** Kontur H3 (HDX) + WorldPop age/sex (under-5) → H3 cells; `H3HexagonLayer` extruded.
- **Vulnerability:** Meta RWI (HDX CSV) + nightlights/road/housing proxies → H3 index; green→yellow→red lerp.
- **Facilities/access:** OSM/HDX/GeoDASH; nearest clinic, schools∩flood, roads∩flood, shelter candidates.
- **Priority model:** `priority = flood_severity × exposed_population × (1+vulnerability_index) × access_penalty × service_disruption × disease_risk` (sub-formulas in the vision doc).
- **Aftermath:** disease two-speed (diarrhoea ×1.5–2, cholera ×2 — not ×6; calibrate to real 19,918 cases); WASH/cost/siting per Sphere (15 L/person/day, 1 latrine/20, 3.5 m²/person; ORS $0.37, net $2, food $1.29/day…).
- **Honesty flags:** RWI relative; SAR misclassifies urban/wetland; child = composite; cite everything.

---

## 4. THE 4-PERSON SPLIT (designed so no two people edit the same file)

**Principle:** every "hot" shared file has **exactly one owner**; everyone else delivers via **new files** that the owner imports through a fixed **interface contract** (Section 5). Each person works in their own directory. The only integration edits live in the owner's files.

| Hot file | Sole owner |
|---|---|
| `App.tsx`, `BeaconShell.tsx` | **A** |
| `Globe.tsx`, `utils/neighborMask.ts`, `package.json` | **B** |
| (none — overlays are new files) | **C** |
| `backend/app/main.py`, `backend/app/models.py` | **D** |
| `FloodModule.tsx`, `SidePanel.tsx`, `TopBar.tsx`, `services/api.ts`, `types/index.ts`, `styles/globals.css` | **left untouched** — each person uses their own new files/CSS instead |

CSS rule: nobody edits `globals.css`; each owns a scoped CSS file imported by their components (`story.css`, `overlays.css`, `panels.css`; B styles inline/within Globe). Types rule: nobody edits `types/index.ts`; each defines types in their own dir.

---

### Person A — Story shell & narrative engine
**Owns:** `App.tsx`, `BeaconShell.tsx`, and a new dir `src/story/`:
`StoryModule.tsx` (the case-study experience), `StoryEngine.tsx` (scroll/Prev-Next driver), `steps.ts` (the 12 beats: camera view + overlay state + which panels show), `StoryPanel.tsx` (left narrative rail), `content/*.tsx` (narrative copy, the composite child vignette, the Aiden bridge), `story.css`.
**Does:** make `story` the default module; hold the shared state `{activeBeat, cameraView, overlayState}`; per beat call `mapController.flyTo(view)`, set `overlayState`, and show D's panels. Wires B's map + C's overlays + D's panels together via the contract. Writes all narrative content + ethics labels.
**Touches no one else's internals.**

### Person B — 3D map base & water physics
**Owns:** `Globe.tsx` (finish terrain/hillshade/sky + buildings + neighbour mask; **expose the contract**: accept `extraLayers` + `overlayState`, expose imperative `flyTo`), `utils/neighborMask.ts`, `package.json`; the water deep-dive: run `prep_waterlab_{dem,osm,sat}.py` for the **Sylhet town bbox** → `public/waterlab_sylhet.*`, wire `PhysicsView` (Sylhet + Sirajganj), `src/water/MapWaterLayer.ts` (+ a Sylhet DEM); optional `Reality3DModule.tsx`.
**Does:** the gorgeous 3D canvas + real flowing-water deep-dive. Publishes the `MapController` + `extraLayers` API that A and C depend on.
**Only edits Globe/water files + neighborMask + package.json.**

### Person C — Overlays & data ingestion
**Owns:** new dir `src/overlays/`: `floodProgression.ts`, `population3d.ts`, `vulnerability.ts`, `facilities.ts`, `disease.ts`, `registry.ts` (`buildOverlayLayers(overlayState, data) → Layer[]`), `OverlayControls.tsx`, `Legend.tsx`, `overlays.css`; backend data-prep scripts `backend/scripts/fetch_sylhet_{flood,pop,rwi,facilities}.py`; output data files under `frontend/public/data/sylhet_*` (or `backend/data/`).
**Does:** ingest the real datasets (UNOSAT flood dates, Kontur+WorldPop population, Meta RWI vulnerability, OSM facilities) into app-ready files; build the 3 hero overlay layers + facilities/disease as pure deck-layer factories; the overlay control panel + legend. A passes `buildOverlayLayers(...)` output into B's Globe via `extraLayers`.
**All new files — edits none of the hot files.**

### Person D — Model, backend endpoints & decision panels
**Owns:** `backend/app/sylhet.py` (priority model + aftermath disease/cost/siting), `backend/app/main.py` + `backend/app/models.py` (adds `/api/sylhet/*`); new frontend dir `src/sylhet/`: `sylhetApi.ts` (own fetch wrapper — does NOT touch `services/api.ts`), `PriorityPanel.tsx`, `AftermathPanel.tsx`, `EvidenceePanel.tsx`, `panels.css`, `model.ts` (shared formulas/types).
**Does:** compute the village/union priority list, the costed response, the two-speed disease aftermath, and the evidence/source panel; serve them from `/api/sylhet/cells`, `/flood-progression`, `/priority`, `/aftermath`. A imports the panels into the story right-rail.
**Only edits backend + its own `src/sylhet/` dir.**

---

## 5. Interface contract (the glue — defined ONCE, up front, so all 4 unblock)

Agree these signatures in hour 1; then everyone codes to them in parallel.

```ts
// B publishes (Globe.tsx):
export interface MapController { flyTo(v: CameraView): void; }
interface Globe3DProps {
  overlayState: OverlayState;          // from A
  extraLayers: import('@deck.gl/core').Layer[];  // from C
  onReady(c: MapController): void;      // A captures the controller
  onZoomIntoTown(town: string): void;  // triggers B's PhysicsView (beat 6)
}

// A publishes (story/steps.ts):
export interface CameraView { lng:number; lat:number; zoom:number; pitch?:number; bearing?:number }
export interface OverlayState { flood:number /*0-1 time*/; showFlood:boolean; showPopulation:boolean;
  showVulnerability:boolean; showFacilities:boolean; showDisease:boolean }

// C publishes (overlays/registry.ts):
export function buildOverlayLayers(state: OverlayState, data: SylhetData): Layer[];
// + <OverlayControls state onChange/> and <Legend state/>

// D publishes (sylhet/):
sylhetApi.cells(): Promise<Cell[]>; sylhetApi.priority(): Promise<PriorityItem[]>;
sylhetApi.aftermath(p): Promise<Aftermath>;   // + <PriorityPanel/> <AftermathPanel/> <EvidenceePanel/>
// backend: GET /api/sylhet/cells | /flood-progression | /priority | /aftermath
```
Shared data shape (`SylhetData`: cells with `h3, population, pop_u5, rwi`, flood-progression GeoJSON, facilities) lives in C's `overlays/types.ts`; D mirrors what it needs in `sylhet/model.ts`. No shared type file is edited.

---

## 6. Sequencing

- **Hour 1 (together):** lock Section 5 contract + the Sylhet AOI bbox + H3 resolution + the 12 beats list in `steps.ts` (A) so types exist.
- **Then fully parallel:** A builds the shell against stub layers/panels; B finishes the 3D Globe + Sylhet waterlab; C ingests data + builds overlays; D builds backend + panels. Each can run/test independently (A with stubs, B standalone map, C with sample data, D with curl).
- **Integration (A-led, end of each day):** A swaps stubs for real B/C/D modules through the contract. Because only A's files do the wiring, integration is conflict-free.

---

## 7. Per-person deliverables checklist

- **A:** story default route; 12-beat `steps.ts`; scroll + Prev/Next engine; narrative copy; child (labelled composite) + Aiden beats; mounts map+overlays+panels; ethics labels. Verify: story plays, flies, toggles.
- **B:** 3D terrain+buildings+neighbour mask on by default; `MapController.flyTo`; `extraLayers` rendering; Sylhet `waterlab_sylhet.html` from prep scripts; PhysicsView from beat 6. Verify: pitched 3D, water pours in the sim, layers from C render.
- **C:** `fetch_sylhet_*` produce data files; flood-progression animates by date; population 3D bars; vulnerability green→red; facilities; OverlayControls+Legend. Verify: each overlay toggles + the flood animates.
- **D:** `/api/sylhet/*` 200; priority list + costed response + two-speed aftermath computed (calibrated to real 2022 numbers); panels render with click-to-source. Verify: curl + panels.

## 8. Success criteria
- App opens as the **Sylhet 2022 case study**, story-first (Hybrid), in 3D.
- Flood **animates day-by-day**; **population 3D bars** + **vulnerability green→red** render over the same cells; **water deep-dive** works for a Sylhet town.
- **Priority list + costed response + two-speed aftermath** compute from real, cited data.
- 4 people worked in parallel with **zero merge conflicts** (disjoint ownership + contract).
- `tsc -b` + `npm run build` clean; backend endpoints 200; screenshots of every beat, no console errors.

## 9. Risks
HDX bot-block → browser/CKAN + PNG fallback · haor seasonal water → subtract baseline · GPU perf → 256² fallback · contract drift → freeze Section 5 in hour 1 · accidental hot-file edits → enforce the ownership table in review.
