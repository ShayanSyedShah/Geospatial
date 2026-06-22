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

  useEffect(() => {
    fetch('/data/sylhet_2022/event_manifest.json')
      .then((r) => r.json())
      .then((m: EventManifest) => setManifest(m))
      .catch((e) => setError(String(e)));
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



