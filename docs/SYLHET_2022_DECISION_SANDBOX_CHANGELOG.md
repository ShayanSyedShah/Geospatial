# Sylhet 2022 Decision Sandbox — Build Changelog

**Branch:** `akhil/sylhet-2022-and-reskin`
**Status:** built & QA-verified; uncommitted working tree at time of writing.
**Scope of this work:** turn the existing "Sylhet 2022" flood *story* into a **decision
sandbox** — replay the real June 2022 Sylhet flood, then at peak flood run response
**protocols** (Supply, Education, Complaints) on the scenario, with **every number
traceable to a real source** via a curated provenance layer.

> Framing discipline: this is a **replay / decision sandbox, not a "backtest."** One real
> incident, no claimed hit-rates. The string "backtest" appears nowhere in the code.

---

## 1. What this adds, in one paragraph

Before, the protocol modules returned ad-hoc seeded numbers and there was no shared
structure. We introduced a **protocol contract + registry**, a single **`ScenarioContext`**
(the frozen world-state of the 2022 flood), **three deep protocols** that compute on real
joins, a **curated UN Data Commons evidence layer** (every metric clicks through to a real
source), and a **generic frontend renderer** mounted as a new **"Response"** step in the
Sylhet story. We then **scoped the scenario to the real flood footprint** so the decisions
are about the actual incident (Sylhet/Sunamganj first), not all of Bangladesh.

---

## 2. Architecture (the contract)

Defined in `backend/app/protocols/base.py`, mirrored as TypeScript in
`frontend/src/types/index.ts`:

| Type | Meaning |
|---|---|
| `Provenance` | a source: `id, label, value, unit, source, publisher, dcid, date, url, method, caveat` |
| `Metric` | a clickable number → references a `provenance_id` |
| `Target` | a ranked place (district / school): `rank, score, metrics[], lat, lng` |
| `MapLayer` | what to draw: `kind('choropleth'|'points'|'path'), data, color_by, legend` |
| `ProtocolResult` | `headline, summary_metrics[], targets[], map_layer, evidence[], caveats[]` |
| `ScenarioContext` | frozen world-state: `cells, facilities, districts, flood_extent, vulnerability, access_difficulty, exposure_threshold, coverage` |

**Registry:** `backend/app/protocols/__init__.py` exposes
`PROTOCOL_IDS = ['supply','education','complaints']`, `get_protocol(pid)` (lazy importlib
load), and `all_provenance()` (defensively merges each protocol's `PROVENANCE` dict).

---

## 3. Files ADDED

### Backend
| File | Lines | Purpose |
|---|---:|---|
| `backend/app/protocols/base.py` | 75 | The contract: `Provenance`, `Metric`, `Target`, `MapLayer`, `ProtocolResult` (Pydantic). |
| `backend/app/protocols/__init__.py` | 47 | Protocol registry: `get_protocol()`, `all_provenance()`. |
| `backend/app/protocols/supply.py` | 346 | **Supply protocol** — rank districts by `need ÷ access-difficulty`; Sphere per-capita manifest; cost vs. real $58.4M / 23.5% appeal gap. |
| `backend/app/protocols/education.py` | 271 | **Education protocol** — rank schools to reopen by `children × vulnerability × exposure`; phased reopening (INEE domains). |
| `backend/app/protocols/complaints.py` | 311 | **Complaints protocol** — categorize → route → status; "clustered-but-unserved" flag (reports far from a clinic). |
| `backend/app/scenario/__init__.py` | 4 | Package init. |
| `backend/app/scenario/sylhet2022.py` | 188 | **`ScenarioContext`** built once from real data: flood cells, facilities, per-district vulnerability (Commons), per-cell access proxy, exposure gate. **Scoped to the 6 haor districts.** |
| `backend/app/evidence.py` | 106 | **Curated provenance registry** — base sources (GloFAS, WorldPop, OSM facilities, Commons vulnerability) merged with each protocol's provenance; `get_evidence(id)`. |
| `backend/scripts/fetch_commons.py` | 226 | One-time fetch of the per-district vulnerability indicator → `commons_bgd.json`. |
| `backend/scripts/prepare_peak_extent.py` | 174 | Simplify/derive the 18 Jun peak flood polygon for the map. |

### Data
| File | Purpose |
|---|---|
| `backend/data/commons_bgd.json` | Cached per-district vulnerability: **Bangladesh MICS 2019 under-5 stunting** (`dcid sdg/SH_STA_STNT`) with full `_meta` citation. Offline so the runtime never calls a live API. |
| `frontend/public/data/sylhet_2022/flood_extent_2022-06-18.geojson` | Shipped 18 Jun peak-extent polygon (the story's phase-8 impact layer). |

### Frontend
| File | Lines | Purpose |
|---|---:|---|
| `frontend/src/components/ProtocolModule.tsx` | 144 | **Generic renderer** for any `ProtocolResult`: headline, ranked targets, clickable metrics → `EvidencePanel`; emits `map_layer`. |

---

## 4. Files MODIFIED

### Backend
- **`backend/app/main.py`** (+57) — added generic routes:
  `GET /api/scenario/sylhet2022/context`, `GET /api/protocol/{id}`, `GET /api/evidence/{id}`.
- **`backend/app/models.py`** (+7) — response schema wiring for the new contract.
- **`backend/app/supply.py`** (+53/−24) — *legacy seeded* supply endpoint: **removed the
  fabricated route distances** (`40 + i*22`) and ETAs; replaced with real haversine
  depot→district-centroid distances (Dhaka hub), ETA at a documented `CONVOY_KMH=35`,
  reachability within `REACH_KM=200`. (This is the old `/api/supply`; the new logic lives
  in `protocols/supply.py`.)

### Frontend
- **`frontend/src/types/index.ts`** (+64) — TS mirror of the contract types.
- **`frontend/src/services/api.ts`** (+13) — `scenarioContext()`, `protocol(id)`, `evidence(id)`.
- **`frontend/src/components/EvidencePanel.tsx`** (+66) — render any protocol's
  `Provenance` (source, publisher, date, DCID, method, caveat, clickable URL).
- **`frontend/src/components/Sylhet2022Module.tsx`** (+35) — render branch for
  `cur.mode === 'response'` that mounts the protocols (Supply | Education | Complaints).
- **`frontend/public/data/sylhet_2022/event_manifest.json`** (+19) — new **"Response"**
  scene after "Peak extent".
- **`frontend/src/styles/globals.css`** (+86) — styles for the protocol module & evidence panel.
- **`frontend/src/components/SylhetFloodMap.tsx`** (+10) — minor wiring.
- **`frontend/src/water/SylhetMapWaterLayer.ts`** (+3/−1) — removed an unused field that
  broke the typecheck (`noUnusedLocals`).

---

## 5. The scenario-scoping fix (post-QA correctness)

The first build ran protocols over **all of Bangladesh**, producing
*"117M people in need — Dhaka first"*. Fixed inside `scenario/sylhet2022.py`:

1. **Geographic clip** — `SCENARIO_DISTRICTS` restricts cells/facilities/districts/
   vulnerability to the six real haor-basin districts of the 2022 event:
   **Sylhet, Sunamganj, Maulvibazar, Habiganj, Netrakona, Kishoreganj.**
2. **Realistic exposure gate** — added `exposure_threshold` on the context =
   `config.DECISION_THRESHOLD` (**0.6**). Supply and Education read it from context (not the
   old 0.05); `flood_extent` reports against it. "In need" now means genuinely high flood
   risk, not the rp500 worst-case envelope. Removed the now-unused `config` import in
   `protocols/supply.py`.

| Metric | Before (national) | After (Sylhet scoped) |
|---|---|---|
| People in need | 117,367,755 | **8,248,617** (~real ~7.2M affected) |
| Top priority | Dhaka | **Sylhet → Sunamganj → Kishoreganj** |
| Children out of class | national | **935,562** |
| Schools hit | national | **236 of 502** |
| Exposed cells | 97% (rp500) | **50%** (1,365 / 2,716 @ risk > 0.6) |

---

## 6. What's real vs. modeled (honesty ledger)

- **Real data:** GloFAS flood risk, WorldPop under-5 population, OSM facility locations,
  MICS 2019 stunting (Commons vulnerability), the $58.4M / 23.5% appeal figures, Sphere
  per-capita standards, the 2022 affected-district scope.
- **Documented proxies / assumptions** (each carries a `caveat` in its provenance):
  access-difficulty (flood depth + clinic distance — no road dataset exists), the
  under-5 → total-population scaling, and complaint *wording* (spatial anchoring is real;
  the text is illustrative and labelled).
- **Evidence model:** curated provenance registry (verified citations), **not** a live
  Data Commons API call — chosen so the demo can't break on a network hiccup.

---

## 7. Deferred (clean seam left)

- **De-confliction protocol** (need-vs-coverage gap map): requires OCHA **3W**
  operational-presence data we don't have. `ScenarioContext.coverage = None` is the seam;
  add a 3W source and a `protocols/deconfliction.py` to light it up.

---

## 8. How it was built

1. **Plan** (`/Users/aidanyap/.claude/plans/fizzy-dreaming-spark.md`) — research agents
   pressure-tested the branch; locked two decisions: *curated provenance* + *one Commons
   indicator for vulnerability*.
2. **Agent swarm** — a 9-agent workflow in 5 barrier-separated stages
   (data-prep → framework → 3 protocols in parallel → integration → QA). A final QA agent
   booted the stack, curled every endpoint, verified the contract + provenance click-through
   + build, and confirmed no "backtest" string. **Result: PASS** (3 safe auto-fixes applied).
3. **Scoping fix** — corrected the national-vs-incident bug described in §5.

---

## 9. Verify it yourself

```bash
# Backend (port 8001 — the Vite dev proxy expects 8001)
cd backend && ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
curl http://localhost:8001/api/protocol/supply        # headline, metrics(+provenance_id), targets
curl http://localhost:8001/api/protocol/education
curl http://localhost:8001/api/protocol/complaints
curl http://localhost:8001/api/scenario/sylhet2022/context   # flood_extent.threshold == 0.6
curl http://localhost:8001/api/evidence/<a provenance_id>    # real source + dcid + date + url

# Frontend
cd frontend && npm run dev          # http://localhost:5173
# Sylhet 2022 tab → play to "Peak extent" → "Response" step → Supply/Education/Complaints
# → click any metric → EvidencePanel shows the source.
```

**Definition of done:** in the Response step, every number traces to a real source on click,
and Supply ranks Sylhet/Sunamganj first with ~8.2M people in need.
