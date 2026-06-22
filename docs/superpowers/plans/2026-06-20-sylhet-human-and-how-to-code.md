# BEACON Sylhet 2022 — The Human Story + How To Code It (with a working 3D-bars demo)

> A plain-language companion that pairs **the human story** with **how the thing is actually coded**, anchored to a **real, openable prototype**: `frontend/public/sylhet_bars.html` (3D population bars over Sylhet, with flood + vulnerability overlays). Open it and you understand the whole idea in 30 seconds.
> **Branch:** `sylhet-case-study`. Companion build docs: `…EVERYTHING-build-bible.md`, `…build-and-team-split.md`.

---

## PART 1 — THE HUMAN STORY (why this exists)

**June 2022, Sylhet.** Rain that started hundreds of kilometres away — over Meghalaya and Assam in India — poured down the Barak river system into Bangladesh's low haor basin. Within a day or two, water was in the streets. By the peak, **84% of Sylhet and 94% of neighbouring Sunamganj were underwater.** About **7.2 million people** were affected, **4 million stranded — 1.6 million of them children.** Nine in ten clinics in the division were flooded. Families climbed onto roofs; 481,827 people crowded into 1,615 shelters that quickly ran short of clean water and dry food.

**One child.** Picture a five-year-old in a Sunamganj village. Yesterday: school, a clinic down the road, dry ground. Today: the school is a shelter, the road is a river, the nearest working clinic is across water she can't cross. She isn't a statistic — she's the reason the map exists. *(In the app this is shown as a clearly-labelled "composite child story based on documented 2022 impacts" — we never invent a real named child's medical details.)*

**Why it's personal — Aiden.** One of us, Aiden, was caught in a flash flood in Myanmar (Typhoon Yagi, 2024) — knocked unconscious, then days in an overcrowded camp living on instant noodles, with too little clean water. That experience is the gut-check behind BEACON: **when water rises fast, people don't need a pretty map full of abstract colours — they need clear, local, "go here / send this" answers.** (Myanmar is a parallel anecdote, not Sylhet data — kept separate and honest.)

**What went wrong, and the gap BEACON fills.** The response was huge and brave (army rescues, shelters, a UN appeal) — but the appeal for **US$58.4M was only ~23.5% funded**, warnings were late, and help wasn't aimed where the most vulnerable people actually were. Responders spent days hand-stitching maps to answer: *who's in the water? who can least cope? what do we send, and where?* **BEACON answers those in one screen, from real data, and shows its sources.**

**The promise.** Every number is real and click-to-source. The "who's poorest" layer is honest ("modelled vulnerability," not "this house is poor"). Disease estimates are ranges, not fake precision. It ends in a **decision**: who to help first, what to send, where to shelter people — not just a map.

---

## PART 2 — WHAT THE DEMO SHOWS (open it first)

File: **`frontend/public/sylhet_bars.html`** — a single self-contained page. It loads MapLibre + deck.gl from a CDN and has **275 real Sylhet-division cells inlined** (Sylhet, Sunamganj, Maulvibazar, Habiganj — under-5 population from WorldPop; total estimated; flood risk from the existing pipeline; vulnerability illustrative).

What you see and can do:
- **3D population bars** — each hexagon column rises with how many people live there (taller = more). Toggle **Total ↔ Under-5**.
- **Flood extent (2022)** — a blue tint that grows as you drag the **timeline** (Onset +24h → Rising +48h → Peak +72h), interpolating the flood across the cells.
- **Vulnerability (green→red)** — turn it on with the bars and the **bars recolour green→red** (height = people, colour = how hard they'd be hit) — the single strongest "who's hit hardest" picture. On its own it's a flat green→red choropleth.
- **Hover any bar** → a tooltip: district, people, under-5, flood risk %, vulnerability %.

**How to open it (two ways):**
```bash
# simplest — static server (so the CDN + map tiles load)
cd frontend/public && python3 -m http.server 8077
# then visit http://localhost:8077/sylhet_bars.html
```
(It also works opened directly as a file, as long as you have internet for the map tiles + CDN scripts.)

---

## PART 3 — HOW IT'S CODED (walk through the demo)

The whole demo is ~250 lines. The important parts:

**1. The data (inlined).** An array `CELLS` of `{h, lat, lng, p (total), u (under-5), f4/f20/f7 (flood risk by horizon), v (vulnerability 0–1), d (district)}`. In the real app this comes from `/api/sylhet/cells` (one shared H3 table — see the build bible §3/§5).

**2. The map (MapLibre).**
```js
const map = new maplibregl.Map({
  container:'map',
  style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', // free, no key
  center:[91.72,24.78], zoom:8.2, pitch:58, bearing:-12, antialias:true
});
```
Pitch is what makes it read as 3D.

**3. deck.gl on top of MapLibre (one overlay).**
```js
const overlay = new deck.MapboxOverlay({ interleaved:true, effects:[lighting], layers:[], getTooltip });
map.on('load', ()=>{ map.addControl(overlay); draw(); });
```
`interleaved:true` lets the 3D columns sit correctly against terrain/labels. We never recreate the overlay — we just call `overlay.setProps({layers})` when a toggle changes.

**4. The 3D population bars = `ColumnLayer`.** (We use `ColumnLayer` with `diskResolution:6` — hexagonal columns at each cell's lat/lng. We avoided `H3HexagonLayer` because the deck CDN bundle doesn't ship `h3-js`; in the real app, which has `h3-js`, you can use `H3HexagonLayer` with `getHexagon`.)
```js
new deck.ColumnLayer({
  id:'pop', data:CELLS, diskResolution:6, radius:2600, extruded:true,
  getPosition:d=>[d.lng,d.lat],
  getElevation:d=>Math.sqrt(d[metric]),     // √ scale so mid-size populations still read as bars
  elevationScale: 7000/Math.sqrt(max),       // tallest bar ~7 km at this zoom
  getFillColor:d=> colorByVuln ? vulnColor(d.v) : popColor(d[metric]/max),
  material:{ambient:0.55,diffuse:0.6,shininess:32,specularColor:[60,60,60]},
  pickable:true,
  updateTriggers:{ getElevation:[metric], getFillColor:[metric,colorByVuln] }
});
```
Key lessons baked in here:
- **Skewed data → use a √ (or log) elevation scale**, or one giant cell dwarfs everything and the rest look flat. This was the single most important fix to make the bars legible.
- **`elevationScale × getElevation = metres`** of bar height — tune `elevationScale` to your zoom/pitch.
- Colours are **`[r,g,b,a]` 0–255**.
- Any accessor that depends on state (metric, colour mode, time) **must** be listed in `updateTriggers` or deck won't recompute it.
- Add a **`LightingEffect`** (ambient + directional) or flat extrusions look ambiguous.

**5. Flat overlays = the same `ColumnLayer`, `extruded:false`.** Flood and vulnerability render as flat hex tiles under the bars.

**6. Flood over time** — interpolate risk across the horizons by the slider `time` (this mirrors the app's `riskAtTime`):
```js
function riskAt(c,f){
  const s=[0,c.f4,c.f20,c.f7];
  if(f<=1/3) return s[1]*(f/(1/3));
  if(f<=2/3) return s[1]+(s[2]-s[1])*((f-1/3)/(1/3));
  return s[2]+(s[3]-s[2])*((f-2/3)/(1/3));
}
// flood cell shows only if risk>0.05, blue deepens with risk
```
In the full app this becomes real dated flood polygons + `DataFilterExtension` (build bible §6).

**7. Colour ramps (no dependency).** Plain RGB lerps:
```js
const lerp=(a,b,t)=>a.map((x,i)=>Math.round(x+(b[i]-x)*t));
popColor(t)  = lerp([255,224,168],[200,80,20], t)                       // light→deep amber
vulnColor(v) = v<0.5 ? lerp(green,yellow,v*2) : lerp(yellow,red,(v-0.5)*2)  // green→yellow→red
floodColor(r)= lerp([120,200,255],[20,55,150], r)                       // shallow→deep blue
```

**8. Toggles** just flip booleans in `state` and call `draw()`, which rebuilds the `layers` array and calls `overlay.setProps({layers})`. That's the whole interaction model.

---

## PART 4 — FROM DEMO → THE REAL APP (how to code each piece)

The demo proves the visual; the build bible (`…EVERYTHING-build-bible.md`) has the full data + code for each. Mapping:

| Demo piece | Real version | Where |
|---|---|---|
| inlined `CELLS` | `/api/sylhet/cells` from Kontur H3 + WorldPop under-5 + Meta RWI, one H3 table | bible §5, §15 |
| `ColumnLayer` bars | `H3HexagonLayer` extruded (app has `h3-js`) — `getHexagon`, `getElevation`, `elevationScale` | bible §5.2 |
| slider `riskAt` flood | real dated UNOSAT/CEMS flood GeoJSON + `DataFilterExtension`, minus JRC permanent water | bible §4.1, §6 |
| `vulnColor(v)` | Vulnerability Screening Index = RWI + nightlights/road/housing proxies (normalised) | bible §4.4, §7 |
| (none) | facilities/roads + access model; rainfall + hydrograph beats; water-physics deep-dive | bible §8, §10, §11 |
| hover tooltip | click-to-source evidence panel + the priority/aftermath/cost model | bible §12 |
| static page | the 12-beat scrollytelling story (camera fly + overlay toggles per beat) | bible §13 |
| — | GeoSight enrichment + priority export | bible §14 |

**Next coding steps, in order:** (P0) turn the codex 3D Globe on for Sylhet; (P1) wire `/api/sylhet/cells` and put these exact bars into `Globe.tsx` via the overlay; (P2) real dated flood; (P3) real vulnerability index; then facilities, model, story, GeoSight. The demo's `draw()`/`ColumnLayer`/colour-ramp/`riskAt` code drops almost verbatim into the app's overlay module.

---

## PART 5 — HONESTY (keep it on screen)
- Vulnerability = **modelled** (RWI is relative within-country; proxies, not house-by-house truth).
- Flood = separate haor **seasonal** water from the **flood anomaly**; SAR misclassifies urban/wetland.
- Disease = **ranges**, cholera ×2 not ×6, calibrated to the real ~19,918 cases.
- The child is a **composite**; Aiden is team testimony; Myanmar is a parallel anecdote, not Sylhet data.
- **Every number click-to-source** — that's the whole point.

---

### TL;DR
Open `frontend/public/sylhet_bars.html` → you see Sylhet as **3D population bars**, drag the flood in, recolour by vulnerability. That's the heart of BEACON in one file. The build bible turns each piece into the real, fully-sourced app.
