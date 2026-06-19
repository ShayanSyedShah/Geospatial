# BEACON Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn BEACON from a single flood dashboard into a multi-module platform with an Overview home, a collapsible left rail, and three new modules (Supply Chain, Complaints, Education) all derived from the real flood parquet.

**Architecture:** A `BeaconShell` owns `activeModule` client-side state and renders a fixed left icon rail (`--rail-w`) + one module at a time. The existing flood UI is extracted into `FloodModule` and offset right by the rail. Three new FastAPI endpoints derive demo data from the existing `DataPipeline` (hexagons + facilities); three new React modules render them.

**Tech Stack:** FastAPI + pandas (backend), React 19 + TypeScript + MapLibre/deck.gl + Vite (frontend). No new deps, no router.

## Global Constraints

- No new runtime dependencies (no react-router; no charting lib — use CSS bars/SVG).
- All new module data derives from `DataPipeline` (`p.df` hexagons, `p.facilities`). No new raw downloads.
- Keep BEACON dark theme: `--bg #0b1d2a`, amber/coral accents, glassy panels, rounded cards, pills.
- Verification per task: backend → `python -c "from app import main"` imports clean + curl 200; frontend → `npx tsc -b` clean + `npm run build` succeeds.
- Frontend uses Vite proxy to `localhost:8001` in dev (already configured).
- Edits to shared files (`App.tsx`, `globals.css`, `main.py`, `models.py`, `services/api.ts`, `types/index.ts`) are serialized — do not parallelize tasks that touch the same shared file.

---

### Task 1: Supply Chain backend

**Files:**
- Create: `backend/app/supply.py`
- Modify: `backend/app/models.py` (add `SupplyResponse`)
- Modify: `backend/app/main.py` (add `/api/supply`)
- Test: `backend/tests/test_api.py` (add smoke test)

**Interfaces:**
- Produces: `supply.build_supply(df, country, district) -> dict` with keys
  `country, district, items[], districts[], routes[], efficiency{naive,optimized,coverage_pct,unmet}`.
  - `items[]`: `{id, name, unit, stock}`
  - `districts[]`: `{district, children_exposed, max_risk, demand, allocated, coverage_pct}`
  - `routes[]`: `{depot, district, distance_km, eta_h, status}` (status `open|cut`)

- [ ] **Step 1:** Create `backend/app/supply.py`:

```python
"""Supply-chain allocation derived from flood exposure per district.

Demand tracks the flood scenario: districts with more exposed children at
higher risk need more relief. A naive even split is compared to a
priority-weighted allocation to make "optimize" legible.
"""
from __future__ import annotations

import pandas as pd

from . import config

ITEMS = [
    {"id": "ors", "name": "ORS sachets", "unit": "kits", "stock": 9000},
    {"id": "water", "name": "Water-purification units", "unit": "units", "stock": 120},
    {"id": "tarp", "name": "Tarpaulin / shelter kits", "unit": "kits", "stock": 4000},
    {"id": "food", "name": "Food rations (family/wk)", "unit": "packs", "stock": 6000},
]
# total deliverable "units of relief" available to allocate this cycle
TOTAL_STOCK = sum(i["stock"] for i in ITEMS)


def build_supply(df: pd.DataFrame, country: str, district: str | None) -> dict:
    sub = df[df["country"] == country]
    if district and district != "All":
        sub = sub[sub["district"] == district]

    rows = []
    for name, g in sub.groupby("district"):
        exposed = int(g["population_u5"].sum())
        max_risk = float(g["flood_risk_7d"].max())
        # demand weight = exposed children scaled by severity
        demand = int(round(exposed * (0.6 + 0.4 * max_risk)))
        rows.append({"district": str(name), "children_exposed": exposed,
                     "max_risk": round(max_risk, 3), "demand": demand})
    rows.sort(key=lambda r: r["demand"], reverse=True)
    rows = rows[:8]  # focus on the worst-hit for a legible board

    total_demand = sum(r["demand"] for r in rows) or 1
    # priority allocation: fill highest-demand districts first
    remaining = TOTAL_STOCK
    for r in rows:
        give = min(r["demand"], remaining)
        r["allocated"] = give
        r["coverage_pct"] = round(100 * give / r["demand"], 1) if r["demand"] else 100.0
        remaining -= give
    optimized_cov = round(100 * sum(r["allocated"] for r in rows) / total_demand, 1)

    # naive even split for comparison
    even = TOTAL_STOCK / len(rows)
    naive_cov = round(100 * sum(min(even, r["demand"]) for r in rows) / total_demand, 1)

    routes = []
    depots = {"Bangladesh": "Dhaka hub", "Uganda": "Kampala hub"}
    depot = depots.get(country, "National hub")
    for i, r in enumerate(rows):
        cut = r["max_risk"] > 0.8 and i % 3 == 0
        routes.append({
            "depot": depot, "district": r["district"],
            "distance_km": 40 + i * 22, "eta_h": round(1.5 + i * 0.8, 1),
            "status": "cut" if cut else "open",
        })

    return {
        "country": country, "district": district, "items": ITEMS,
        "districts": rows, "routes": routes,
        "efficiency": {
            "naive": naive_cov, "optimized": optimized_cov,
            "coverage_pct": optimized_cov,
            "unmet": max(0, total_demand - sum(r["allocated"] for r in rows)),
        },
    }
```

- [ ] **Step 2:** Add to `backend/app/models.py` (after `ConnectRequest`):

```python
class SupplyResponse(BaseModel):
    country: str
    district: Optional[str] = None
    items: List[Dict]
    districts: List[Dict]
    routes: List[Dict]
    efficiency: Dict
```

- [ ] **Step 3:** In `backend/app/main.py`, add `supply` to the `from . import` line and `SupplyResponse` to the models import, then add the route before `@app.post("/api/brief")`:

```python
@app.get("/api/supply", response_model=SupplyResponse)
async def get_supply(
    country: str = Query(config.DEFAULT_COUNTRY),
    district: Optional[str] = Query(None),
):
    return SupplyResponse(**supply.build_supply(_pipeline().df, country, district))
```

- [ ] **Step 4:** Add smoke test to `backend/tests/test_api.py`:

```python
def test_supply():
    from app.supply import build_supply
    import pandas as pd
    from app import config
    df = pd.read_parquet(config.DATA_DIR / "hexagons.parquet")
    out = build_supply(df, "Bangladesh", None)
    assert out["districts"] and out["efficiency"]["optimized"] >= 0
```

- [ ] **Step 5:** Verify + commit:

```bash
cd backend && source .venv/bin/activate && python -c "from app import main" && \
  python -c "from app.supply import build_supply; import pandas as pd; from app import config; print(build_supply(pd.read_parquet(config.DATA_DIR/'hexagons.parquet'),'Bangladesh',None)['efficiency'])"
git add backend/app/supply.py backend/app/models.py backend/app/main.py backend/tests/test_api.py
git commit -m "feat(api): supply-chain allocation endpoint"
```
Expected: prints an efficiency dict; import clean.

---

### Task 2: Complaints backend

**Files:**
- Create: `backend/app/complaints.py`
- Modify: `backend/app/models.py` (add `ComplaintsResponse`)
- Modify: `backend/app/main.py` (add `/api/complaints`)

**Interfaces:**
- Produces: `complaints.build_complaints(df, country) -> dict` with
  `country, complaints[]` where each item is
  `{id, source, text, district, lat, lng, severity, status, category, age_h}`.
  `source ∈ {community, field}`, `severity ∈ {urgent, high, med}`,
  `status ∈ {reported, in_progress, resolved}`.

- [ ] **Step 1:** Create `backend/app/complaints.py`:

```python
"""Seeded complaint/issue intake anchored to the worst-hit flood cells.

Deterministic (no randomness) so the demo is stable. Two sources: affected
community members and field staff. The frontend mutates status client-side.
"""
from __future__ import annotations

import pandas as pd

_COMMUNITY = [
    ("No clean drinking water", "water", "urgent"),
    ("Family stranded, water rising fast", "rescue", "urgent"),
    ("Latrines flooded, disease fear", "sanitation", "high"),
    ("Children have no dry shelter", "shelter", "high"),
    ("Food ran out two days ago", "food", "med"),
    ("Elderly neighbour needs medicine", "health", "high"),
]
_FIELD = [
    ("Cold chain down at clinic", "health", "urgent"),
    ("Fuel shortage at depot", "logistics", "high"),
    ("Bridge cut, district unreachable", "access", "urgent"),
    ("Shelter kits exhausted", "logistics", "med"),
    ("Need boats for evacuation", "logistics", "high"),
]


def build_complaints(df: pd.DataFrame, country: str) -> dict:
    sub = df[df["country"] == country].sort_values("flood_risk_7d", ascending=False)
    cells = sub.head(20).reset_index(drop=True)
    out = []
    statuses = ["reported", "reported", "in_progress", "resolved"]
    for i, c in cells.iterrows():
        pool = _COMMUNITY if i % 2 == 0 else _FIELD
        text, cat, sev = pool[i % len(pool)]
        out.append({
            "id": f"C-{i+1:03d}",
            "source": "community" if i % 2 == 0 else "field",
            "text": f"{text} ({c['district']})",
            "district": str(c["district"]),
            "lat": float(c["lat"]), "lng": float(c["lng"]),
            "severity": sev, "status": statuses[i % len(statuses)],
            "category": cat, "age_h": int(2 + (i * 3) % 46),
        })
    return {"country": country, "complaints": out}
```

- [ ] **Step 2:** Add to `models.py`:

```python
class ComplaintsResponse(BaseModel):
    country: str
    complaints: List[Dict]
```

- [ ] **Step 3:** Add `complaints` to imports in `main.py`, then route:

```python
@app.get("/api/complaints", response_model=ComplaintsResponse)
async def get_complaints(country: str = Query(config.DEFAULT_COUNTRY)):
    return ComplaintsResponse(**complaints.build_complaints(_pipeline().df, country))
```

- [ ] **Step 4:** Verify + commit:

```bash
cd backend && source .venv/bin/activate && python -c "from app import main"
git add backend/app/complaints.py backend/app/models.py backend/app/main.py
git commit -m "feat(api): complaints intake endpoint"
```

---

### Task 3: Education backend

**Files:**
- Create: `backend/app/education.py`
- Modify: `backend/app/models.py` (add `EducationResponse`)
- Modify: `backend/app/main.py` (add `/api/education`)

**Interfaces:**
- Produces: `education.build_education(df, facilities, country, district) -> dict` with
  `country, district, schools_total, schools_hit, children_out, learning_centers, recovery[], curriculum[]`.
  - `recovery[]`: `{week, label, reopened_pct}`
  - `curriculum[]`: `{id, name, desc}`

- [ ] **Step 1:** Create `backend/app/education.py`:

```python
"""Education-in-emergencies view derived from at-risk schools + exposed kids."""
from __future__ import annotations

import pandas as pd

CURRICULUM = [
    {"id": "sel", "name": "Psychosocial / SEL", "desc": "Trauma-informed wellbeing sessions"},
    {"id": "catchup", "name": "Catch-up literacy & numeracy", "desc": "Accelerated learning packs"},
    {"id": "radio", "name": "Radio / SMS learning", "desc": "Lessons for no-connectivity zones"},
    {"id": "wash", "name": "Hygiene & safety", "desc": "Flood-season WASH and safety basics"},
]


def build_education(df: pd.DataFrame, facilities: pd.DataFrame,
                    country: str, district: str | None) -> dict:
    fac = facilities[(facilities["country"] == country) & (facilities["type"] == "school")]
    hx = df[df["country"] == country]
    if district and district != "All":
        fac = fac[fac["district"] == district]
        hx = hx[hx["district"] == district]
    schools_total = int(len(fac))
    schools_hit = int(fac["at_risk"].sum())
    # ~18% of exposed under-5 + school-age proxy out of class
    children_out = int(hx["population_u5"].sum() * 1.6 * 0.18)
    learning_centers = max(1, round(schools_hit / 3))
    recovery = [
        {"week": 1, "label": "Assess & psychosocial first aid", "reopened_pct": 0},
        {"week": 2, "label": "Temporary learning spaces open", "reopened_pct": 25},
        {"week": 4, "label": "Catch-up programme running", "reopened_pct": 55},
        {"week": 8, "label": "Schools reopening", "reopened_pct": 85},
    ]
    return {
        "country": country, "district": district,
        "schools_total": schools_total, "schools_hit": schools_hit,
        "children_out": children_out, "learning_centers": learning_centers,
        "recovery": recovery, "curriculum": CURRICULUM,
    }
```

- [ ] **Step 2:** Add to `models.py`:

```python
class EducationResponse(BaseModel):
    country: str
    district: Optional[str] = None
    schools_total: int
    schools_hit: int
    children_out: int
    learning_centers: int
    recovery: List[Dict]
    curriculum: List[Dict]
```

- [ ] **Step 3:** Add `education` to imports in `main.py`, then route:

```python
@app.get("/api/education", response_model=EducationResponse)
async def get_education(
    country: str = Query(config.DEFAULT_COUNTRY),
    district: Optional[str] = Query(None),
):
    p = _pipeline()
    return EducationResponse(**education.build_education(p.df, p.facilities, country, district))
```

- [ ] **Step 4:** Verify + commit:

```bash
cd backend && source .venv/bin/activate && python -c "from app import main"
git add backend/app/education.py backend/app/models.py backend/app/main.py
git commit -m "feat(api): education-in-emergencies endpoint"
```

---

### Task 4: Frontend types + API methods

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

**Interfaces:**
- Produces: types `SupplyData`, `ComplaintsData`, `Complaint`, `EducationData`;
  `api.supply(country, district)`, `api.complaints(country)`, `api.education(country, district)`.

- [ ] **Step 1:** Append to `types/index.ts`:

```typescript
export interface SupplyData {
  country: string; district: string | null;
  items: { id: string; name: string; unit: string; stock: number }[];
  districts: { district: string; children_exposed: number; max_risk: number; demand: number; allocated: number; coverage_pct: number }[];
  routes: { depot: string; district: string; distance_km: number; eta_h: number; status: 'open' | 'cut' }[];
  efficiency: { naive: number; optimized: number; coverage_pct: number; unmet: number };
}
export interface Complaint {
  id: string; source: 'community' | 'field'; text: string; district: string;
  lat: number; lng: number; severity: 'urgent' | 'high' | 'med';
  status: 'reported' | 'in_progress' | 'resolved'; category: string; age_h: number;
}
export interface ComplaintsData { country: string; complaints: Complaint[]; }
export interface EducationData {
  country: string; district: string | null;
  schools_total: number; schools_hit: number; children_out: number; learning_centers: number;
  recovery: { week: number; label: string; reopened_pct: number }[];
  curriculum: { id: string; name: string; desc: string }[];
}
```

- [ ] **Step 2:** Add to `api` object in `services/api.ts` (and to its type import line):

```typescript
  supply: (country: string, district: string | null) =>
    get<SupplyData>(`/api/supply?country=${encodeURIComponent(country)}` + (district ? `&district=${encodeURIComponent(district)}` : '')),
  complaints: (country: string) =>
    get<ComplaintsData>(`/api/complaints?country=${encodeURIComponent(country)}`),
  education: (country: string, district: string | null) =>
    get<EducationData>(`/api/education?country=${encodeURIComponent(country)}` + (district ? `&district=${encodeURIComponent(district)}` : '')),
```

- [ ] **Step 3:** Verify + commit:

```bash
cd frontend && npx tsc -b
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat(web): types + api methods for new modules"
```
Expected: tsc clean.

---

### Task 5: Shell + rail + extract FloodModule

**Files:**
- Create: `frontend/src/components/BeaconShell.tsx`
- Create: `frontend/src/components/FloodModule.tsx` (move current `App` body here)
- Modify: `frontend/src/App.tsx` (becomes shell host)
- Modify: `frontend/src/styles/globals.css` (rail + `--rail-w` offsets)

**Interfaces:**
- Produces: `ModuleId = 'overview'|'flood'|'supply'|'complaints'|'education'`;
  `BeaconShell` props `{ active: ModuleId; onNavigate: (m: ModuleId) => void; children: ReactNode }`.

- [ ] **Step 1:** Move the entire current `App()` body into `FloodModule.tsx` as
  `export default function FloodModule()` — identical imports/JSX, just renamed.
  (Copy the current `App.tsx` verbatim, rename the function.)

- [ ] **Step 2:** Create `BeaconShell.tsx`:

```tsx
import { useState, type ReactNode } from 'react';

export type ModuleId = 'overview' | 'flood' | 'supply' | 'complaints' | 'education';
const NAV: { id: ModuleId; icon: string; label: string }[] = [
  { id: 'overview', icon: '⊞', label: 'Overview' },
  { id: 'flood', icon: '🌊', label: 'Flood' },
  { id: 'supply', icon: '📦', label: 'Supply chain' },
  { id: 'complaints', icon: '📣', label: 'Complaints' },
  { id: 'education', icon: '🎓', label: 'Education' },
];

export default function BeaconShell({ active, onNavigate, children }: {
  active: ModuleId; onNavigate: (m: ModuleId) => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <nav className={`rail ${open ? 'open' : ''}`}>
        <button className="rail-toggle" onClick={() => setOpen((o) => !o)}>☰</button>
        {NAV.map((n) => (
          <button key={n.id} className={`rail-item ${active === n.id ? 'active' : ''}`}
            onClick={() => onNavigate(n.id)} title={n.label}>
            <span className="ri-icon">{n.icon}</span>
            <span className="ri-label">{n.label}</span>
          </button>
        ))}
      </nav>
      <main className="shell-main">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3:** Replace `App.tsx` with the shell host:

```tsx
import { useState } from 'react';
import BeaconShell, { type ModuleId } from './components/BeaconShell';
import FloodModule from './components/FloodModule';
import Overview from './components/Overview';
import SupplyModule from './components/SupplyModule';
import ComplaintsModule from './components/ComplaintsModule';
import EducationModule from './components/EducationModule';
import './styles/globals.css';

export default function App() {
  const [active, setActive] = useState<ModuleId>('overview');
  return (
    <BeaconShell active={active} onNavigate={setActive}>
      {active === 'overview' && <Overview onNavigate={setActive} />}
      {active === 'flood' && <FloodModule />}
      {active === 'supply' && <SupplyModule />}
      {active === 'complaints' && <ComplaintsModule />}
      {active === 'education' && <EducationModule />}
    </BeaconShell>
  );
}
```

- [ ] **Step 4:** Add CSS to `globals.css`. Define `--rail-w: 56px` in `:root`, and:

```css
.shell { position: fixed; inset: 0; }
.rail { position: fixed; top: 0; left: 0; bottom: 0; width: var(--rail-w); z-index: 70;
  background: rgba(6,14,20,.96); border-right: 1px solid var(--line);
  display: flex; flex-direction: column; gap: 4px; padding: 8px 6px; transition: width .18s ease; overflow: hidden; }
.rail.open { width: 210px; }
.rail-toggle { height: 40px; border: none; background: none; color: var(--text); font-size: 18px; cursor: pointer; border-radius: 8px; }
.rail-toggle:hover { background: rgba(255,255,255,.06); }
.rail-item { display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 9px; border: none;
  background: none; color: var(--muted); cursor: pointer; border-radius: 9px; white-space: nowrap; }
.rail-item:hover { background: rgba(255,255,255,.06); color: var(--text); }
.rail-item.active { background: rgba(255,138,61,.16); color: #ffb37a; box-shadow: inset 0 0 0 1px rgba(255,138,61,.3); }
.ri-icon { font-size: 18px; width: 24px; text-align: center; flex: none; }
.ri-label { font-size: 13.5px; font-weight: 600; opacity: 0; transition: opacity .12s; }
.rail.open .ri-label { opacity: 1; }
.shell-main { position: fixed; inset: 0 0 0 var(--rail-w); overflow: auto; }
```
Then offset the flood panels: change `.topbar { left: 0; right: 0; }` →
`left: var(--rail-w);`, `.side-panel.dashboard { left: var(--rail-w); }`,
`.timeline { left: calc(var(--rail-w) + 348px); }`,
`.legend { left: calc(var(--rail-w) + 348px); }`,
`.evidence-panel`/`.modal-scrim` keep (they overlay full). Flood module renders
inside `.shell-main` but its panels are `position: fixed` to viewport — the
`--rail-w` offsets keep them clear of the rail.

- [ ] **Step 5:** Create stub `Overview.tsx`, `SupplyModule.tsx`, `ComplaintsModule.tsx`, `EducationModule.tsx` each returning `<div className="module-pad"><h1>NAME</h1></div>` so the app compiles. (Real content in Tasks 6-9.) Add CSS `.module-pad { padding: 24px 28px; }`.

- [ ] **Step 6:** Verify flood still works + commit:

```bash
cd frontend && npx tsc -b && npm run build
git add -A && git commit -m "feat(web): platform shell + rail, extract FloodModule"
```
Expected: build clean. Manual: rail toggles, Flood module shows full dashboard offset right of rail.

---

### Task 6: Overview home screen

**Files:**
- Create: `frontend/src/components/StatTile.tsx`
- Modify: `frontend/src/components/Overview.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: `api.supply`, `api.complaints`, `api.education`, existing `api.hexagons`/`api.regions`; `ModuleId` navigate.

- [ ] **Step 1:** `Overview.tsx` fetches Bangladesh data on mount and renders a brand header, a situation banner, and a 4-tile grid. Each tile shows 2 stats + a "View more →" button calling `onNavigate(id)`:
  - Flood: sum `population_u5` where `flood_risk_7d>0.05` (from `api.hexagons`) + count `>0.6`.
  - Supply: `efficiency.optimized`% + routes where `status==='cut'`.
  - Complaints: open (`status!=='resolved'`) + urgent count.
  - Education: `schools_hit` + `children_out`.

```tsx
import { useEffect, useState } from 'react';
import type { ModuleId } from './BeaconShell';
import { api } from '../services/api';

export default function Overview({ onNavigate }: { onNavigate: (m: ModuleId) => void }) {
  const [tiles, setTiles] = useState<any>(null);
  useEffect(() => {
    const c = 'Bangladesh';
    Promise.all([api.hexagons(c), api.supply(c, null), api.complaints(c), api.education(c, null)])
      .then(([hx, sup, comp, edu]) => {
        const exposed = hx.hexagons.filter((h) => h.flood_risk_7d > 0.05).reduce((a, h) => a + h.population_u5, 0);
        const hot = hx.hexagons.filter((h) => h.flood_risk_7d > 0.6).length;
        setTiles({
          flood: { a: exposed.toLocaleString(), al: 'children exposed', b: hot, bl: 'hot zones' },
          supply: { a: sup.efficiency.optimized + '%', al: 'priority coverage', b: sup.routes.filter((r) => r.status === 'cut').length, bl: 'routes cut' },
          complaints: { a: comp.complaints.filter((x) => x.status !== 'resolved').length, al: 'open issues', b: comp.complaints.filter((x) => x.severity === 'urgent').length, bl: 'urgent' },
          education: { a: edu.schools_hit, al: 'schools hit', b: edu.children_out.toLocaleString(), bl: 'children out of class' },
        });
      }).catch(() => setTiles({}));
  }, []);
  const T = ({ id, icon, title, d }: any) => (
    <div className="ov-tile">
      <div className="ovt-head"><span className="ovt-icon">{icon}</span><b>{title}</b></div>
      <div className="ovt-stats">
        <div><b>{d?.a ?? '—'}</b><span>{d?.al}</span></div>
        <div><b>{d?.b ?? '—'}</b><span>{d?.bl}</span></div>
      </div>
      <button className="tb-btn primary" onClick={() => onNavigate(id)}>View more →</button>
    </div>
  );
  return (
    <div className="overview">
      <header className="ov-head">
        <div className="tb-mark">◈</div>
        <div><h1>BEACON</h1><p>Sirajganj, Bangladesh · Flood forecast +72h</p></div>
      </header>
      <div className="ov-banner">One coherent picture: who's hit, what to send, what people need, how kids keep learning.</div>
      <div className="ov-grid">
        <T id="flood" icon="🌊" title="Flood impact" d={tiles?.flood} />
        <T id="supply" icon="📦" title="Supply chain" d={tiles?.supply} />
        <T id="complaints" icon="📣" title="Complaints" d={tiles?.complaints} />
        <T id="education" icon="🎓" title="Education" d={tiles?.education} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Add Overview CSS (`.overview`, `.ov-head`, `.ov-banner`, `.ov-grid` 2-col responsive grid, `.ov-tile` glassy card, `.ovt-stats` two big numbers). Reuse `.tb-mark`, `.tb-btn`.

- [ ] **Step 3:** Verify + commit:

```bash
cd frontend && npx tsc -b && npm run build
git add -A && git commit -m "feat(web): overview home with live module tiles"
```

---

### Task 7: Supply module UI

**Files:** Modify `frontend/src/components/SupplyModule.tsx`, `globals.css`.

- [ ] **Step 1:** Fetch `api.supply('Bangladesh', null)`. Render:
  - Header + an **efficiency hero**: optimized% vs naive% (two bars) + unmet need.
  - **Items** row: stock chips.
  - **District coverage table**: district, children exposed, demand, allocated, coverage% as a mini CSS bar.
  - **Routes** list: depot→district, distance, ETA, status pill (`open` green / `cut` red).
  Use existing `.pill`, table, and bar patterns. Full component code mirrors Overview's fetch+render shape; coverage bar = `<i style={{width: pct+'%'}}/>` inside a track div.

- [ ] **Step 2:** Add CSS (`.supply`, `.eff-hero`, `.eff-bar`, `.cov-bar`/track).

- [ ] **Step 3:** Verify + commit (`tsc -b`, `npm run build`).

---

### Task 8: Complaints module UI

**Files:** Modify `frontend/src/components/ComplaintsModule.tsx`, `globals.css`.

- [ ] **Step 1:** Fetch `api.complaints('Bangladesh')` into local state. Render:
  - Source toggle (`All | Community | Field staff`) — filters list.
  - **Kanban**: 3 columns (`Reported`, `In progress`, `Resolved`). Each card: text, district, severity pill, age (`{age_h}h`). Buttons `→` advance status (client-side `setState`), updating the card's column. Order of statuses: reported→in_progress→resolved.
  - A header summary: open count, urgent count.

- [ ] **Step 2:** Add CSS (`.complaints`, `.kanban` 3-col grid, `.kan-col`, `.kan-card`, severity pill colors urgent=coral/high=amber/med=muted, `.src-toggle`).

- [ ] **Step 3:** Verify + commit.

---

### Task 9: Education module UI + final polish

**Files:** Modify `frontend/src/components/EducationModule.tsx`, `globals.css`; final pass on all modules.

- [ ] **Step 1:** Fetch `api.education('Bangladesh', null)`. Render:
  - Header + **3 stat cards**: schools hit / total, children out of class, learning centers recommended.
  - **Recovery timeline**: horizontal steps from `recovery[]` with `reopened_pct` progress bar.
  - **Curriculum kit checklist**: `curriculum[]` items as toggleable checkboxes (client-side progress), with a progress count.

- [ ] **Step 2:** Add CSS (`.education`, `.edu-stats`, `.edu-timeline`/step, `.edu-kit`).

- [ ] **Step 3:** Polish: confirm theme consistency across modules, responsive grid breakpoints (mobile: 1-col grids, rail stays), no console errors.

- [ ] **Step 4:** Final verify + commit:

```bash
cd frontend && npx tsc -b && npm run build
git add -A && git commit -m "feat(web): education module + final polish"
```
Expected: clean build; all five rail items render their module; screenshots look cohesive.

---

## Self-Review

- **Spec coverage:** shell+rail (T5) ✓, overview (T6) ✓, flood unchanged+offset (T5) ✓, supply (T1/T7) ✓, complaints (T2/T8) ✓, education (T3/T9) ✓, derived-data principle (T1-3) ✓, theme (all) ✓, types/api (T4) ✓.
- **Placeholder scan:** module UIs in T7/T8 reference "full component mirrors Overview's shape" — acceptable since the fetch+render pattern is fully shown in T6 and the data shapes are fully typed in T4; the executor has exact fields.
- **Type consistency:** `ModuleId` defined in BeaconShell (T5), imported by App/Overview; data types defined T4 and consumed T6-9; `status`/`severity`/`source` literal unions match backend strings in T1-3.
- **Overview data source** (deferred in spec): resolved → tiles fetch the module endpoints directly (no separate `/api/overview`).
