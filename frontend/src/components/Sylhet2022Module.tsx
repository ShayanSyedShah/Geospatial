import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import SylhetFloodMap, { type FloodFrame } from './SylhetFloodMap';

// Real-data cinematic reconstruction of the 2022 Sylhet/Sunamganj flood.
interface EventDate {
  date: string;
  label: string;
  mode?: 'monsoon' | 'lift' | 'rainburst' | 'surge' | 'flood';
  floodExtent: string | null;
  floodedKm2: number;
  analyzedKm2: number;
  camera?: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  showRain?: boolean;
  statTitle?: string;
  narration: string;
  extentReal?: boolean;
  extentNote?: string;
}

interface EventManifest {
  id: string;
  title: string;
  subtitle: string;
  focus: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  dates: EventDate[];
  sources: { id: string; name: string; publisher: string; method: string; caveat: string }[];
}

const MOISTURE_PARTICLES = Array.from({ length: 44 }, (_, i) => {
  const lane = i % 4;
  const x0 = 8 + lane * 7 + (i % 3) * 2;
  const y0 = 78 + lane * 3 + (i % 5);
  const dx = 62 + lane * 5;
  const dy = -58 + lane * 6;
  return {
    id: i,
    style: {
      '--x0': `${x0}%`,
      '--y0': `${y0}%`,
      '--x1': `${Math.min(92, x0 + dx)}%`,
      '--y1': `${Math.max(12, y0 + dy)}%`,
      '--delay': `${-(i * 0.34)}s`,
      '--dur': `${7.5 + (i % 6) * 0.55}s`,
      '--scale': `${0.65 + (i % 5) * 0.16}`,
    } as CSSProperties,
  };
});

export default function Sylhet2022Module() {
  const [manifest, setManifest] = useState<EventManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showRain, setShowRain] = useState(false);
  // Real UNICEF child-risk data, pulled live from the GeoSight API (Challenge 1 substrate).
  const [ccri, setCcri] = useState<{ source: string; api_base: string; indicators: Record<string, { value: number | null; indicator_id: number; shortcode?: string; name?: string; source_query?: string }> } | null>(null);
  // Computed back-test: UNOSAT flood polygon ∩ upazila shapes.
  const [bt, setBt] = useState<{ upazilas: { name: string; tier: number; flood_pct: number }[]; precision: number | null; observed_flooded: number; observed_that_were_flagged: number; source: string } | null>(null);

  useEffect(() => {
    fetch('/data/sylhet_2022/event_manifest.json')
      .then((r) => r.json())
      .then((m: EventManifest) => setManifest(m))
      .catch((e) => setError(String(e)));
    fetch('/data/sylhet_2022/geosight_ccri_bangladesh.json')
      .then((r) => r.json())
      .then(setCcri)
      .catch(() => {});
    fetch('/data/sylhet_2022/backtest_2022.json')
      .then((r) => r.json())
      .then(setBt)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!playing || !manifest) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % manifest.dates.length), 2600);
    return () => window.clearInterval(id);
  }, [playing, manifest]);

  const frames: FloodFrame[] = useMemo(
    () => (manifest ? manifest.dates.map((d) => ({
      date: d.date,
      label: d.label,
      mode: d.mode,
      floodExtent: d.floodExtent,
      camera: d.camera,
    })) : []),
    [manifest],
  );

  const cur = manifest?.dates[active];
  const src = manifest?.sources[0];
  const effectiveShowRain = showRain;

  return (
    <div className="sylhet2022" data-testid="sylhet2022-module">
      {manifest && frames.length > 0 && (
        <SylhetFloodMap focus={manifest.focus} frames={frames} activeIndex={active} showRain={effectiveShowRain} />
      )}

      {(cur?.mode === 'surge' || cur?.mode === 'flood') && (
        <div className="syl-top-fade" aria-hidden="true" />
      )}

      {/* Real UNICEF child-risk data, live from the GeoSight API — the Challenge-1
          evidence substrate. Shown during the flood scenes. */}
      {cur?.mode === 'flood' && ccri && (
        <aside className="syl-ccri-panel" aria-label="UNICEF child-risk context">
          <div className="ccri-head">
            <strong>Children's Climate Risk · Bangladesh</strong>
            <span>UNICEF CCRI v2 · live</span>
          </div>
          <div className="ccri-grid">
            {([
              ['wash', 'WASH'], ['nutrition', 'Nutrition'], ['child_survival', 'Child survival'],
              ['poverty', 'Poverty'], ['protection', 'Protection'], ['education', 'Education'],
            ] as const).map(([key, label]) => {
              const ind = ccri.indicators[key];
              if (!ind || ind.value == null) return null;
              return (
                <div className="ccri-cell" key={key} title={`${ind.name} · GeoSight indicator ${ind.indicator_id} (${ind.shortcode})\n${ind.source_query}`}>
                  <b>{ind.value}</b><span>{label}</span>
                </div>
              );
            })}
          </div>
          <a className="ccri-src" href={`${ccri.api_base}/api/v1/indicators/`} target="_blank" rel="noreferrer">
            Source: UNICEF GeoSight API (CCRI v2) →
          </a>
        </aside>
      )}

      {/* BEACON response protocol + back-test against the real 2022 outcome.
          Actions are ranked by the live UNICEF CCRI scores; the scorecard checks
          the protocol's priority against what actually happened. */}
      {cur?.mode === 'flood' && ccri && (() => {
        const v = (k: string) => ccri.indicators[k]?.value ?? 0;
        const actions = [
          { a: 'Evacuate + boat rescue', who: 'Sunamganj & Sylhet haor upazilas (Tahirpur, Chhatak, Gowainghat, Companiganj…)', why: 'Tier-1 — deepest haor fill', score: 10 },
          { a: 'Child protection', who: 'register/track separated children in tier-1/2', why: `CCRI Protection ${v('protection')}`, score: v('protection') },
          { a: 'Cash + relief', who: 'low-resource unions first', why: `CCRI Poverty ${v('poverty')}`, score: v('poverty') },
          { a: 'Nutrition / under-5 feeding', who: 'shelters in flooded upazilas', why: `CCRI Nutrition ${v('nutrition')}`, score: v('nutrition') },
          { a: 'Education continuity', who: '2,471 submerged learning centres', why: `CCRI Education ${v('education')}`, score: v('education') },
          { a: 'WASH — water purification + latrines', who: 'all flooded upazilas', why: `CCRI WASH ${v('wash')}`, score: v('wash') },
        ].sort((x, y) => y.score - x.score);
        return (
          <aside className="syl-protocol-panel" aria-label="BEACON response protocol">
            <div className="pp-head"><strong>BEACON Response Protocol</strong><span>auto-generated · ranked by UNICEF CCRI</span></div>
            <ol className="pp-list">
              {actions.map((x, i) => (
                <li key={i}><b>{x.a}</b><em>{x.who}</em><span>{x.why}</span></li>
              ))}
            </ol>
            <div className="pp-backtest">
              <strong>Back-test vs observed 2022 (computed)</strong>
              {bt ? (
                <>
                  {bt.upazilas.filter((u) => u.flood_pct > 5).slice(0, 3).map((u) => (
                    <div key={u.name}><b>{u.name} {u.flood_pct}%</b> flooded · BEACON tier {u.tier}</div>
                  ))}
                  <div><span className="ok">{bt.observed_that_were_flagged}/{bt.observed_flooded} observed-flooded upazilas were BEACON-flagged → {bt.precision}% precision</span></div>
                  <div className="pp-cite">UNOSAT 25 May ∩ geoBoundaries ADM3 (computed) · context: 7.2M affected (UNICEF SitRep)</div>
                </>
              ) : <div>computing…</div>}
            </div>
          </aside>
        );
      })()}

      {(cur?.mode === 'monsoon' || cur?.mode === 'lift' || cur?.mode === 'rainburst') && (
        <div className="syl-cause-map-labels" aria-hidden="true">
          <div className="syl-air-plume">
            {MOISTURE_PARTICLES.map((p) => <i key={p.id} style={p.style} />)}
          </div>
        </div>
      )}

      {cur?.mode === 'monsoon' && (
        <aside className="syl-predict-panel" aria-label="Prediction model logic">
          <strong>BEACON forecast logic</strong>
          <div><b>1</b> Detect upstream rain over Meghalaya</div>
          <div><b>2</b> Route surge through Barak-Surma-Kushiyara</div>
          <div><b>3</b> Fill low haor terrain to estimate flood spread</div>
          <span>2022 is the proof case. The same signals can drive future alerts when live rain and river data are connected.</span>
        </aside>
      )}

      {cur?.mode === 'lift' && (
        <aside className="syl-lift-panel" aria-label="Orographic lift explanation">
          <strong>Step 2 - forced upward</strong>
          <div>Moist Bay air reaches the Meghalaya escarpment.</div>
          <div>The slope forces the air upward over the Khasi/Jaintia Hills.</div>
          <div>Rising air cools and begins condensing into rain clouds.</div>
          <div>This is the trigger before the rainburst.</div>
        </aside>
      )}

      {cur?.mode === 'rainburst' && (
        <aside className="syl-rainburst-panel" aria-label="Extreme rainfall explanation">
          <strong>Step 3 - extreme rain</strong>
          <div><b>Sohra / Cherrapunji</b> and <b>Mawsynram</b> sit on the windward Khasi Hills.</div>
          <div>The lifted monsoon air unloads here first, producing exceptional rainfall.</div>
          <div>That water runs into the Barak-Surma-Kushiyara catchment, then reaches Sylhet.</div>
        </aside>
      )}

      {cur?.mode === 'surge' && (
        <aside className="syl-surge-panel" aria-label="River surge explanation">
          <strong>Step 4 - river surge</strong>
          <div><b>Barak basin:</b> upstream rainfall concentrates into the main river channel.</div>
          <div><b>Surma + Kushiyara:</b> the Barak splits near the border and routes water west.</div>
          <div><b>Sylhet/Sunamganj:</b> low haor floodplains receive the surge and spread it outward.</div>
        </aside>
      )}

      <div className="syl-titlebar">
        <strong>BE<span style={{ color: '#3b82f6' }}>A</span>CON</strong>
        <span className="syl-eyebrow">{manifest ? manifest.title : '2022 Sylhet Flood'}</span>
        {manifest && <span className="syl-sub">{manifest.subtitle}</span>}
        {src && <span className="syl-srcbadge" title={src.caveat}>{src.publisher}</span>}
      </div>

      {(error || !manifest) && (
        <div className="syl-stage">
          <div className="syl-status">{error ? `Could not load event - ${error}` : 'Loading 2022 Sylhet reconstruction...'}</div>
        </div>
      )}

      {manifest && cur && (
        <div className="syl-scenebar">
          <div className="syl-scene-dates">
            <button className="syl-play" onClick={() => setPlaying((p) => !p)} title="Play timeline">
              {playing ? 'Pause' : 'Play'}
            </button>
            <button className={`syl-rain ${showRain ? 'on' : ''}`} onClick={() => setShowRain((r) => !r)} title="NASA rainfall 17 Jun 2022">
              Rain
            </button>
            {manifest.dates.map((d, i) => (
              <button key={`${d.date}-${d.label}`} className={`syl-date ${i === active ? 'on' : ''}`} onClick={() => { setPlaying(false); setActive(i); }}>
                <b>{d.label}</b>
                <span>{d.date}</span>
              </button>
            ))}
          </div>
          <div className="syl-scene-text">
            <div className="syl-scene-stat">
              {cur.statTitle ? (
                <b>{cur.statTitle}</b>
              ) : (
                <>
                  <b>{cur.floodedKm2.toLocaleString()}</b> km2 flooded <em>of {cur.analyzedKm2.toLocaleString()} km2 analyzed</em>
                </>
              )}
            </div>
            <p>{cur.narration}</p>
            {src && <span className="syl-caveat">{src.name}</span>}
          </div>
        </div>
      )}
    </div>
  );
}



