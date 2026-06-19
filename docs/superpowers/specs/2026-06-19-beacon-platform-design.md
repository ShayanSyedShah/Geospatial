# BEACON Platform — Design Spec

**Date:** 2026-06-19
**Status:** Approved (pending spec review)
**Author:** brainstormed with the team

## 1. Summary

Evolve BEACON from a single flood dashboard into a **multi-module humanitarian
platform**. A new **Overview home screen** is the main entry; a collapsible left
icon rail switches between modules. The existing flood dashboard becomes one
module. Three new modules are added — **Supply Chain**, **Complaints**, and
**Education in Emergencies** — all powered by demo data **derived from the real
flood parquet** so every number stays coherent with the flood scenario.

Non-goals (YAGNI): no auth, no real persistence (complaint/board edits are
session-only), no live external APIs for the new modules, one demo country focus
(Bangladesh; Uganda still loads).

## 2. Architecture

### 2.1 Shell & navigation
- New `BeaconShell` component wraps the app and owns `activeModule` state
  (`'overview' | 'flood' | 'supply' | 'complaints' | 'education'`, default
  `'overview'`). **Client-side view state, no router** (fits the current SPA;
  avoids adding react-router for the hackathon).
- Fixed **left icon rail**, `--rail-w: 56px` collapsed. A `☰` toggle expands it
  to ~220px with labels; collapsed shows icons + hover tooltips.
- Rail items: Overview ⊞ · Flood 🌊 · Supply 📦 · Complaints 📣 · Education 🎓.
  Active item highlighted with the amber/coral accent.
- The rail is fixed at `left: 0`. All module content sits to its right. The
  existing flood panels (which are `position: fixed`) are offset by `--rail-w`
  via CSS variables so nothing overlaps.

### 2.2 Module rendering
`BeaconShell` renders exactly one module component in the main area based on
`activeModule`. Each module is a self-contained component with its own data
fetch. Modules:

| Module | Component | Data source |
|---|---|---|
| Overview | `Overview.tsx` | aggregates a stat from each module endpoint |
| Flood | existing `App` flood UI (Globe + TopBar + SidePanel + Timeline + modals) | existing endpoints |
| Supply | `SupplyModule.tsx` | `GET /api/supply` |
| Complaints | `ComplaintsModule.tsx` | `GET /api/complaints` |
| Education | `EducationModule.tsx` | `GET /api/education` |

### 2.3 Refactor of existing App
The current `App.tsx` body (flood dashboard) is extracted into a `FloodModule`
component. `App.tsx` becomes the shell host: renders `BeaconShell` + rail +
active module. Flood module behavior is unchanged; only its fixed-position CSS
offsets shift right by `--rail-w`.

## 3. Modules

### 3.1 Overview (home / main screen)
- Brand + scenario context line (`Sirajganj, Bangladesh · Flood forecast +72h`).
- A **situation banner**: people exposed, districts at risk, lead time.
- A **grid of 4 live tiles**, each showing 1–2 real stats from its module and a
  **"View more →"** button that sets `activeModule`:
  - 🌊 Flood — children exposed · hot zones → flood module
  - 📦 Supply — priority coverage % · routes cut → supply module
  - 📣 Complaints — open count · urgent count → complaints module
  - 🎓 Education — schools hit · children out of class → education module
- Tiles fetch their numbers from the module endpoints (or a small
  `/api/overview` aggregate; implementation may choose either — see Plan).

### 3.2 Flood module
Existing dashboard, unchanged in behavior. Globe + TopBar (country/district
dropdowns, Connect data, Make plan) + accordion SidePanel (Wave 1, Protocols,
Map layers, Districts) + Timeline + Connector/Plan modals. Shifted right by the
rail.

### 3.3 Supply Chain module — "optimize efficiency"
- **Items:** ORS, water-purification units, tarps, food kits — each with stock.
- **Demand per priority district** computed from flood data
  (children exposed × max risk), so demand tracks the flood scenario.
- **Optimizer:** allocate limited stock to districts in priority order; surface
  **coverage %**, **unmet need**, and an **efficiency score**. Show a
  before/after (naive even split vs. priority allocation) to make "optimize"
  legible.
- **Routes:** depot→district rows with distance, ETA, and status
  (`open` / `cut by flood`).
- **Coverage bar chart** by district.
- Backend: `GET /api/supply?country=&district=` returns depots, items, district
  demand, routes, and computed allocation + efficiency.

### 3.4 Complaints module — community + field staff
- Source toggle: **Community | Field staff | All**.
- **Map + kanban** (`Reported → In progress → Resolved`) + severity pills
  (urgent / high / med) + an SLA age indicator.
- Seeded near flooded high-risk zones (e.g. "No clean water — Zone A",
  "Cold chain down — Clinic X"). Each item: id, source, text, district,
  lat/lng, severity, status, category, age.
- Status changes are **interactive client-side** (optimistic; not persisted).
- Backend: `GET /api/complaints?country=` returns the seed list.

### 3.5 Education in Emergencies module — post-disaster
- **Schools hit** from the flood facilities layer (`type=school & at_risk`) +
  estimated **children out of class**.
- **Temporary Learning Spaces plan:** recommended # of centers + a **recovery
  timeline** (reopen schedule over weeks).
- **Curriculum kit checklist:** psychosocial / SEL, catch-up literacy/numeracy,
  radio/SMS learning for low connectivity — with progress tracking (client-side).
- Backend: `GET /api/education?country=&district=`.

## 4. Backend

New modules in `backend/app/`:
- `supply.py` — derive depots/items/demand/routes/allocation from the hexagon
  parquet (per district: children exposed, max risk → demand).
- `complaints.py` — seed a deterministic list anchored to high-risk cells /
  at-risk facilities.
- `education.py` — derive affected schools + children-out-of-class + a learning
  plan from facilities + hexagons.

New routes in `main.py`: `/api/supply`, `/api/complaints`, `/api/education`,
and optionally `/api/overview` (aggregate). New Pydantic models in `models.py`.
All read from the existing `DataPipeline` (no new raw data downloads).

## 5. Frontend

New components under `frontend/src/components/`:
- `BeaconShell.tsx` (rail + module host)
- `Overview.tsx`
- `FloodModule.tsx` (extracted from current App body)
- `SupplyModule.tsx`, `ComplaintsModule.tsx`, `EducationModule.tsx`
- supporting small components as needed (e.g. a reusable `StatTile`, `Kanban`).

New API methods in `services/api.ts`; new types in `types/index.ts`.
CSS additions in `styles/globals.css` (rail, overview grid, supply/complaints/
education styling) + `--rail-w` offsets for the flood panels.

## 6. Look & feel
Keep the BEACON dark theme everywhere: navy `#0b1d2a`, amber/coral accents,
glassy blurred panels, rounded cards, pills. Cohesive across all modules.

## 7. Data principle
Every new module's numbers derive from the real flood parquet (hexagons +
facilities). No random mock data; the whole platform tells one coherent
Sirajganj/Bangladesh flood story.

## 8. Success criteria
- Overview is the default screen; rail collapses/expands; switching modules works.
- Each module renders real-derived data without errors; `tsc -b` + `npm run build`
  clean; backend imports + endpoints return 200.
- Flood module behaves exactly as before, just offset by the rail.
- UI is cohesive and polished across modules.
