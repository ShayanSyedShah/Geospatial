# BEACON — Simple Plan (what to do, plain words)

## The one problem
Our app looks great but **does not use UN data**. The judges (Challenge 1) want:
**UN data shown on a map, with a clear trail of where each number came from.**
Right now we use WorldPop / JRC / OSM — not the UN Commons. That's the gap.

## The fix (one sentence)
**Pull real UNICEF numbers from GeoSight (their own website's API) and show them on our
map with a "source" label.** GeoSight's API is live and free — no login needed.

---

## Steps (in order, easy → done)

### Step 1 — Get UNICEF data (backend)  ⏱ ~1–2 hrs
- Add one file: `backend/app/geosight_client.py`.
- It calls GeoSight:
  - `GET https://geosight.unicef.org/api/v1/indicators/` → list of 2,100+ real indicators
  - `GET .../api/v1/indicators/{id}/data/` → the actual numbers per place
- Pick 1–2 indicators (e.g. child climate risk **CCRI**, or sanitation/WASH, or
  "people in need").
- **This is the most important step. Do this first.**

### Step 2 — Put it on the map  ⏱ ~1 hr
- Join those UNICEF numbers to our areas (admin districts / H3 cells).
- Color the map by the number (like our danger zones).

### Step 3 — Show the source (the "trust" part)  ⏱ ~1 hr
- When you click an area, show: **"Source: UNICEF GeoSight · indicator {name}"** +
  the exact query. This is the "evidence chain" judges are grading.

### Step 4 — Keep our story  ⏱ already built
- Flood prediction (Flood tab) → make a **protocol** (who to help, where) →
  **back-test** it on the real 2022 Bangladesh flood. Don't remove this — it's our edge.

### Step 5 — (Stretch, only if time) Chat copilot
- The two repos Sean shared = a ready **chat assistant** over GeoSight (`unicef-mcp-t4sg`
  + `unicef_mcp_frontend`, extracted at `C:\Users\akhil\Downloads\_mcp_inspect\`).
- Add a chat box: "which districts need help first?" → answers from the data.
- Nice-to-have, not required to win Challenge 1.

---

## Who does what (suggested split)
- **Person A:** Step 1 (GeoSight client + pick indicators) — most important.
- **Person B:** Step 2 + 3 (show on map + source label).
- **Aiden:** protocols (Step 4) — already on it.
- **Person C (stretch):** Step 5 copilot from the t4sg repos.

## Why this wins
Judges = UNICEF geospatial team (they built GeoSight). If our map shows **their data**
with a **visible source trail**, plus our **predict → protocol → back-test** story, we
hit Challenge 1 exactly — on their own platform. Few teams are even in this challenge.

## Do NOT
- Don't claim "UN Data Commons" anywhere until Step 1 is wired (right now it's fake).
- Don't rebuild the map — just add the UN data into what we have.
