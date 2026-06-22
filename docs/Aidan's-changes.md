# Aidan's Changes — BEACON Sylhet 2022 Decision Sandbox

**Branch:** `akhil/sylhet-2022-and-reskin`
**What this doc is:** a narrative + reference of everything I changed, plus the context
behind the **response protocols** and *why* they exist.

> Framing discipline used throughout: this is a **real-incident replay / decision
> sandbox**, *not* a "backtest." One real flood, replayed, with response decisions run on
> top of it. The word "backtest" appears nowhere in the code.

---

## 1. The big picture — what we built and why

BEACON started as a flood *visualisation*. We turned the **Sylhet 2022** story module into a
**decision sandbox**: replay the real June 2022 Sylhet/haor flood as a causal timeline
(Bay monsoon → orographic lift → extreme rain → river surge → haor basin fills → peak
extent), then at peak flood add a **Response** step where humanitarian **protocols** run
*on that exact scenario* — and **every number clicks through to a real source**.

That last part is the whole thesis of UN Tech Over Challenge 2 ("From Data to Action"):
fuse **where the need is** (UN Data Commons statistics) with **what is actually being done**
(operational/geospatial data) to produce a decision the system can't make quickly today —
and make the evidence chain visible so it's trustworthy.

Everything sits on **one shared spine of real data**, computed once and frozen into a
`ScenarioContext` that every protocol reads:
- **Flood hazard** — GloFAS / JRC modelled flood risk per H3 cell (res-7, ~1.2 km).
- **Population** — WorldPop under-5 counts.
- **Vulnerability** — a real **UN Data Commons** indicator per district (Bangladesh **MICS
  2019 under-5 stunting**, `dcid sdg/SH_STA_STNT`), cached offline.
- **Facilities** — schools/clinics with at-risk flags.
- **Coverage (de-confliction)** — the **2022 HCTT Flash-Floods HRP** geographic
  prioritisation (which districts the coordinated response named "priority").

The scenario is **clipped to the 6 real haor districts** (Sylhet, Sunamganj, Maulvibazar,
Habiganj, Netrakona, Kishoreganj) so it reasons about the *actual incident* — not all of
Bangladesh (which would let Dhaka's population dominate every ranking). "In need" is gated
at the documented **decision threshold (flood risk > 0.6)**, giving ~8.2M modelled in-need
vs the ~7.2M reported affected (NAWG) — close, and honestly labelled.

---

## 2. The response protocols — what they are and *why*

The protocols are the "action" layer. Each is a **different humanitarian decision lens** on
the same real flood, and each emits the same contract (`ProtocolResult`: a headline, ranked
targets, a map layer, clickable metrics, and provenance), so one generic UI renders them
all. Why these four:

### 📦 Supply — *where to pre-position relief first*
The first logistics question in any flood. Ranks districts by **need ÷ access-difficulty**
(need = exposed under-5 × Commons vulnerability; access-difficulty = a documented proxy from
flood depth + distance to the nearest clinic, because no road/3W dataset exists). Builds a
relief manifest from **Sphere** per-capita standards and costs it against the **real $58.4M
2022 appeal (23.5% funded)**. *Why:* turns "where's the flood" into "where do the trucks go,
how much, and what's the funding gap."

### 🎓 Education — *which schools to restore first*
Education is the service cut first and restored last; every month closed, more children
(especially girls) drop out permanently. Ranks at-risk schools by
**children × vulnerability × flood exposure** and proposes phased reopening. *Why:* when
damaged schools dwarf the budget, the *order* you fix them in decides who returns to school.

### 📣 Complaints — *triage field reports / accountability*
Accountability to affected populations. Categorises and routes field/community reports over
the worst-hit cells and flags **"clustered-but-unserved"** areas (many reports, far from a
clinic). *Why:* surfaces where people are asking for help but coverage is thin. (Report
*wording* is illustrative and labelled; the spatial anchoring to worst-hit cells is real.)

### 🔄 De-confliction — *who got left out* (the flagship)
This is the protocol where the **UN Data Commons is structurally load-bearing**: the *need*
side comes from Commons-cited vulnerability × WorldPop exposure, the *coverage* side from the
2022 HRP prioritisation, and **the output is the gap between them**. It answers: *which
districts carried real flood-need yet sat outside the response's five priority districts?*
*Why:* coordination gaps ("everyone served Sylhet; who didn't get served?") are exactly the
decision a need-vs-coverage fusion can make and a single dataset can't.

---

## 3. The de-confliction fix (the substantive change)

De-confliction *ran* but led with the **wrong district**, and fixing it honestly was the
hardest call in the project.

**The journey:**
1. First version reasoned over **all of Bangladesh** → claimed *117M people in need, Dhaka
   first*. Wrong scenario scope.
2. Scoping + a `need_norm − coverage` formula then widened de-confliction to 8 districts and
   headlined **Brahamanbaria** — a generally flood-prone district GloFAS rates as exposed,
   but **not part of the observed 2022 haor flood**. That invites "that's not where the flood
   was," and it was an unexplained 8-vs-6 mismatch with Supply/Education.
3. **The fix (final):** scope de-confliction to the **same 6 haor districts** as the other
   protocols, and replace the normalisation-sensitive formula with a **principled rule**:

   > A district is **under-served** iff `exposed_u5 > 25,000` **AND** `coverage_score < 1.0`
   > (i.e. it carries real flood-need but sits *outside* the HRP's five priority districts).
   > Rank under-served by exposed children; the priority-5 read "covered."

   Within the 6 districts, only **Kishoreganj** qualifies — 3rd-most exposed children
   (~147,784 under-5), inside the real haor footprint, genuinely affected, yet only
   *secondary* HRP priority. That is a real, defensible coverage gap, straight from the data.

**Why this is honest, not tuned:** the rule is a binary "affected-but-not-prioritised,"
ranked by real exposed children — not a threshold nudged until a favourite district appears.
The three honesty caveats ride along with the result:
- "Coverage = HRP geographic prioritisation tier, not per-organisation 4W counts."
- "Exposure = GloFAS modelled flood risk; cf. the UNOSAT observed flood polygon on the map."
- "≈8.2M modelled in-need; cf. ~7.2M reported affected (NAWG)."

**Pitch line:** *"Kishoreganj had the third-most exposed children in the flood footprint, yet
sat outside the response's five priority districts — that's the gap our tool surfaces,
straight from UN data."*

---

## 4. The Response UI rework (Google-Maps model)

The Response step was a text-heavy light-theme side panel that clashed with the dark
cinematic map. Reworked to a **Google-Maps model**: **map is the hero**, a thin **layer
rail** switches protocols, **one bold decision line** states the call, and detail appears
**only on click** (marker/district → popup → evidence).

- **Layer rail** (left): the 4 protocols as radio toggles + a caption + an "ⓘ sources &
  caveats" affordance (holds the honesty lines).
- **Decision line** (top, pinned): the active protocol's headline — the single verdict.
- **Legend** (corner): built from the protocol's `map_layer.legend`.
- **Markers:** point protocols (Supply/Education/Complaints) = clickable labelled pills;
  **De-confliction = district choropleth** (6-district ADM2 polygons shaded by status,
  Kishoreganj highlighted). Click anything → a **≤4-line popup** → "source" → the
  **EvidencePanel** (reused in its provenance mode).
- Cinematic scenes 1–6 are untouched.

(Late polish: the decision banner was collapsing the headline into one-word-per-line because
the metric chips were `nowrap`; fixed the flex layout and dropped the redundant chips so the
banner is the single bold line the spec asked for.)

---

## 5. What's real vs modelled (honesty ledger)

- **Real:** GloFAS flood risk, WorldPop under-5, OSM facilities, the MICS-2019 stunting
  Commons indicator, the $58.4M / 23.5% appeal figures, Sphere standards, the HRP-2022
  priority districts, the UNOSAT observed flood polygon, the 6 affected-district scope.
- **Documented proxies / assumptions** (each carries a `caveat`): access-difficulty (depth +
  clinic distance — no road data), the under-5 → total-population scaling, complaint *wording*
  (illustrative; spatial anchoring real), the HRP tier as a coverage proxy (not 4W org counts).
- **Evidence model:** a **curated provenance registry** (verified DCID/source/date/URL),
  *not* a live API call — so the demo can't break on a network hiccup, while the Commons stays
  genuinely load-bearing.

---

## 6. Full change inventory

### Added — backend
| Path | Purpose |
|---|---|
| `backend/app/protocols/base.py` | The protocol contract (`Provenance`, `Metric`, `Target`, `MapLayer`, `ProtocolResult`). |
| `backend/app/protocols/__init__.py` | Protocol registry (`get_protocol`, `all_provenance`). |
| `backend/app/protocols/supply.py` | Supply protocol (need ÷ access, Sphere manifest, appeal gap). |
| `backend/app/protocols/education.py` | Education protocol (children × vulnerability × exposure). |
| `backend/app/protocols/complaints.py` | Complaints protocol (categorise → route → clustered-but-unserved). |
| `backend/app/protocols/deconfliction.py` | De-confliction (the Kishoreganj coverage-gap logic). |
| `backend/app/scenario/__init__.py`, `scenario/sylhet2022.py` | The `ScenarioContext` (one frozen world-state). |
| `backend/app/evidence.py` | Curated provenance registry → real Commons/source citations. |
| `backend/scripts/fetch_commons.py` | One-time fetch of the MICS vulnerability indicator → cache. |
| `backend/scripts/prepare_peak_extent.py` | Ship the 18 Jun peak flood polygon. |
| `backend/scripts/prep_deconfliction_districts.py` | Emit the 6-district choropleth geojson. |
| `backend/data/commons_bgd.json` | Cached per-district vulnerability (MICS 2019). |
| `backend/data/coverage_bgd_2022.json` | HRP-2022 coverage tiers per district. |

### Added — frontend
| Path | Purpose |
|---|---|
| `frontend/src/components/ProtocolPopup.tsx` | The ≤4-line click popup (→ evidence). |
| `frontend/src/hooks/useProtocol.ts` | Fetch hook for a `ProtocolResult`. |
| `frontend/src/components/ProtocolModule.tsx` | (Now demoted — superseded by the hook + rail.) |
| `frontend/public/data/sylhet_2022/deconfliction_districts.geojson` | 6 ADM2 polygons for the choropleth. |
| `frontend/public/data/sylhet_2022/flood_extent_2022-06-18.geojson` | Peak-extent impact layer. |

### Modified
| Path | What changed |
|---|---|
| `backend/app/main.py` | Generic routes: `/api/scenario/sylhet2022/context`, `/api/protocol/{id}`, `/api/evidence/{id}`. |
| `backend/app/models.py` | Contract response schemas. |
| `backend/app/supply.py` | (Legacy endpoint) removed fabricated distances → real haversine. |
| `frontend/src/components/Sylhet2022Module.tsx` | Response scene rework: rail + decision line + legend + popup/evidence wiring. |
| `frontend/src/components/SylhetFloodMap.tsx` | Clickable pills + de-confliction choropleth + `onSelectTarget`; scene-specific markers; animations; stacking fix. |
| `frontend/src/components/EvidencePanel.tsx` | Added provenance mode (renders any protocol's source). |
| `frontend/src/services/api.ts`, `types/index.ts` | Contract types + `protocol`/`scenarioContext`/`provenance` API methods. |
| `frontend/src/styles/globals.css` | Dark rail / decision-line / legend / popup / pill styles; removed light cards. |
| `frontend/public/data/sylhet_2022/event_manifest.json` | "Response" scene after Peak extent. |

*(Earlier reference doc: `docs/SYLHET_2022_DECISION_SANDBOX_CHANGELOG.md`.)*

---

## 7. Run & verify

```bash
# Backend (port 8001 — the Vite proxy expects 8001)
cd backend && ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
curl http://localhost:8001/api/protocol/deconfliction   # headline names Kishoreganj; 1 under-served
curl http://localhost:8001/api/evidence/<a provenance_id>   # real source + dcid + date + url

# Frontend
cd frontend && npm run dev          # http://localhost:5173
# Sylhet 2022 tab → play to "Peak extent" → "Response" → rail switches protocol →
# decision line updates → click a marker / shaded district → ≤4-line popup → "source" → EvidencePanel.
```

**Definition of done:** de-confliction headlines **Kishoreganj** on the same 6 districts as
the other protocols; the Response view is a clean dark map + rail + one decision line; every
number in a popup traces to a real source on click; cinematic scenes 1–6 still play.
