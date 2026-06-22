# BEACON — Build Status & Next Steps

UN Open Source Week 2026 · Track 2A (GeoAI & Geospatial Evidence)
Last updated from team sync. Branch: `akhil/sylhet-2022-and-reskin`.

---

## The product in one line
BEACON predicts where a flood will hit people, generates a response protocol
(who to evacuate, where to stage supplies, which clinics to protect), and
**back-tests that protocol against a real past flood (2022 Bangladesh)** to prove
the model would have reduced harm.

---

## Core framing (decided this sync)

We have **two map experiences**, and they answer two different questions:

| Tab | Question | Time | What it shows |
|---|---|---|---|
| **Flood map** (existing Globe) | "If a flood happened **today**, who's at risk and what do we do?" | **Future / live prediction** | Risk hexagons, human-terrain 3D population spikes, density, facilities → **generate a response protocol** |
| **Back-test simulation** (rename of "Sylhet 2022") | "Run that protocol against a **real past flood** — would it have worked?" | **Past (2022 Bangladesh)** | Real event reconstruction (rain → surge → haor fill → danger zones → casualties), then **run the protocol over it and compare to what actually happened** |

So: **Flood map = prediction. Back-test = validation.** Same protocol engine drives both.

> Demo line: "We'll pick Bangladesh, surface the 2022 flood + casualties, then run
> our protocols over it and back-test against what actually happened."

---

## What we have NOW (built + pushed)

**Platform** — React 19 + Vite + MapLibre + deck.gl + FastAPI, multi-module shell,
UN blue/white reskin (Aslan), offline PWA.

**Tabs:** Overview · Flood · **Sylhet 2022 (→ becomes Back-test)** · Supply · Complaints · Education.

**Flood map (Aslan's version, now merged):**
- Risk hexagons (H3) by flood + under-5 population
- **Human-terrain 3D spikes** (height + colour = under-5 density)
- Population density, NASA SEDAC overlay, legends
- **Facilities** = hospitals (clinics) + schools as 3D meshes — **keep these**
- Real flood feeds (GloFAS/JRC, GFM, FFWC, GDACS), Esri satellite base

**Sylhet 2022 reconstruction (our new tab):**
- Story scenes: Bay monsoon → orographic lift → extreme rain → **river surge** → **haor basin fills** → peak extent
- Real **shallow-water sim** water (rivers swell, then fill the haor by terrain depth)
- Real **UNOSAT** observed flood extent (25 May 2022)
- **Tiered danger zones** at upazila level (22 upazilas, dark→light red by severity)
- **Infrastructure pins** (Osmani airport, Sylhet rail, Sunamganj town)
- All-Bangladesh **blue rivers** (OpenFreeMap)

**Data sources (be honest about these for judges):**
- Population: **WorldPop / NASA SEDAC**
- Flood hazard: **GloFAS / JRC**
- Observed flood extent: **UNOSAT/UNITAR**
- Rivers / buildings / facilities: **OpenStreetMap**
- Terrain: **SRTM**
- **UN Data Commons:** currently a **STUB** (vocabulary + label text only — no live API call). UN Data Commons mainly has **annual flood data / people-affected** — that's the UN contribution we lean on for the 2022 back-test numbers. **TODO: wire a real call or clearly label what's UN vs external.**

---

## What's NEXT (task breakdown to split)

### 1. Back-test tab (rename + framing) — *owner: ___*
- Rename "Sylhet 2022" → **"Back-test simulation"** in nav + titles.
- Flow: select **Bangladesh** → surface 2022 flood + casualties → **overlay the protocol** → compare protocol's recommended actions vs the **actual 2022 outcome** (affected/casualties).
- Keep all existing reconstruction scenes; add the protocol panel on the side.

### 2. Protocol generation engine — *owner: Aiden*
- Input: flood extent + under-5 population + facilities + vulnerability.
- Output: ranked actions — **evacuate which unions first, stage supplies where, protect which clinics, shelter placement, WASH kits, routing**.
- Must run on **both** tabs (live Flood map = future protocol; Back-test = protocol vs 2022).

### 3. Back-testing comparison — *owner: ___*
- Run the protocol against 2022 ground truth → metric: **"harm reduced vs what actually happened"** (people reached sooner, clinics protected, etc.).
- Simple scorecard is enough for the demo.

### 4. Height + live stats on the back-test view — *owner: ___*
- Add a **height/elevation read** and **stats panel that updates as the timeline/water rises** (flooded area, depth, people exposed, casualties climbing).
- "Stats move as the water rises."

### 5. Facilities — *keep as-is*
- Hospitals + schools 3D meshes already work. Leave them; make sure they're used in protocol (protect at-risk clinics).

### 6. AI Copilot (stretch / tomorrow) — *owner: ___*
- Chat copilot over all the data ("which villages need evac first?"). Backed by a Claude model; framed as swappable/open-source for Open Source Week.

### 7. Data provenance — *owner: ___*
- Confirm exactly what comes from **UN Data Commons** vs external; maximize UN-provided data; add source badges. Wire a real Data Commons `/v2/observation` call if time allows.

### 8. Demo story + polish — *owner: all*
- Tighten the narrative: today's prediction → protocol → back-test proof on 2022.

---

## Timeline
- **Tonight:** finish items 1–4 + protocols.
- **Morning (~4–5 hrs):** review together, show mentors/judges, then iterate.
- **Stretch:** AI copilot (#6), real Data Commons wiring (#7).

## Logistics
- Work off branch **`akhil/sylhet-2022-and-reskin`** (has the Sylhet/back-test tab). Aiden already pulled it.
- Backup of pre-merge state: `Geospatial-main-BACKUP-merge`.
- We're (apparently) the only team in our challenge — lean into the unique "predict + back-test + protocol" story.
