import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import SylhetFloodMap, { type FloodFrame } from './SylhetFloodMap';
import ProtocolPopup from './ProtocolPopup';
import ProtocolBoard, { type BoardItem } from './ProtocolBoard';
import EvidencePanel from './EvidencePanel';
import { useProtocol } from '../hooks/useProtocol';
import { api } from '../services/api';
import type { Metric, Provenance, Target } from '../types';

// Normalise a protocol map_layer.data (FeatureCollection OR plain row array) into a
// flat list of property rows, and derive the per-row sync key shared with the map:
// the row id when present (education/complaints), else the district (supply/deconf).
function rowsOf(data: unknown): Record<string, unknown>[] {
  const d = data as { type?: string; features?: unknown };
  if (d && d.type === 'FeatureCollection' && Array.isArray(d.features)) {
    return (d.features as Array<Record<string, unknown>>).map((f) => ({
      ...((f.properties as Record<string, unknown>) ?? {}),
    }));
  }
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return [];
}
const selKeyOfRow = (p: Record<string, unknown>): string =>
  p.id != null ? String(p.id) : String(p.district ?? p.shapeName ?? '');

// Real-data cinematic reconstruction of the 2022 Sylhet/Sunamganj flood.
const PROTOCOL_TABS: { id: string; label: string; caption: string }[] = [
  { id: 'supply', label: 'Supply', caption: 'Where to pre-position relief first' },
  { id: 'education', label: 'Education', caption: 'Schools to reopen / relocate' },
  { id: 'complaints', label: 'Complaints', caption: 'Live field reports by severity' },
  { id: 'deconfliction', label: 'Deconfliction', caption: 'Coverage gaps between agencies' },
];

// Read a legend (heterogeneous across protocols) into a flat list of swatches the
// corner legend can render. Handles categorical legend.values, legend.stops, and a
// numeric min/max ramp gracefully — never throws on a missing/odd shape.
interface LegendRow { color: string; label: string }
function readLegend(legend: unknown): { rows: LegendRow[]; title: string | null } {
  const l = (legend && typeof legend === 'object' ? legend : {}) as Record<string, unknown>;
  const title = typeof l.title === 'string' ? l.title : typeof l.label === 'string' ? l.label : null;
  const rows: LegendRow[] = [];
  // categorical: { values: { key: color } }
  if (l.values && typeof l.values === 'object') {
    for (const [k, v] of Object.entries(l.values as Record<string, unknown>)) {
      rows.push({ color: String(v), label: k });
    }
  }
  // categorical: { stops: [[label, color], ...] }
  if (Array.isArray(l.stops)) {
    for (const s of l.stops as unknown[]) {
      if (Array.isArray(s) && s.length >= 2) rows.push({ color: String(s[1]), label: String(s[0]) });
    }
  }
  // numeric ramp: { min, max } (no discrete swatches → show the range as a gradient bar)
  if (!rows.length) {
    const min = Number(l.min);
    const max = Number(l.max);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { rows: [{ color: 'ramp', label: `${min.toLocaleString()} – ${max.toLocaleString()}` }], title };
    }
  }
  return { rows, title };
}

interface EventDate {
  date: string;
  label: string;
  mode?: 'monsoon' | 'lift' | 'rainburst' | 'surge' | 'flood' | 'response';
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
  const [responseTab, setResponseTab] = useState('supply');
  // Google-Maps response model: the map is the canvas, a thin rail switches the
  // active protocol, and clicking a target opens a small popup → evidence panel.
  const { data: result } = useProtocol(responseTab);
  const [selectedTarget, setSelectedTarget] = useState<
    { title: string; metrics: Metric[]; evidence: Provenance[] } | null
  >(null);
  const [selectedProv, setSelectedProv] = useState<Provenance | null>(null);
  const [showCaveats, setShowCaveats] = useState(false);
  // Shared selection across the board + map. `selectedKey` is sticky (click);
  // `hoveredKey` is transient (board hover). The map highlights hovered ?? selected.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  // Per-district magnitude (children at risk) for the dimmed map SCOPE base — the
  // whole affected region, so the map never looks empty. Same for every protocol.
  const [scopeByDistrict, setScopeByDistrict] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    fetch('/data/sylhet_2022/event_manifest.json')
      .then((r) => r.json())
      .then((m: EventManifest) => setManifest(m))
      .catch((e) => setError(String(e)));
  }, []);

  // Scenario context → per-district children-at-risk for the map scope base.
  useEffect(() => {
    fetch('/api/scenario/sylhet2022/context')
      .then((r) => r.json())
      .then((c: { districts?: Array<{ district: string; children_at_risk: number }> }) => {
        const m: Record<string, number> = {};
        for (const d of c.districts ?? []) m[d.district] = Number(d.children_at_risk) || 0;
        setScopeByDistrict(m);
      })
      .catch(() => setScopeByDistrict(null));
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
  const isResponse = cur?.mode === 'response';
  const legend = useMemo(() => readLegend(result?.map_layer?.legend), [result]);
  // Magnitude range for the scope-base legend (point protocols; deconfliction uses
  // its own status choropleth instead).
  const scopeRange = useMemo(() => {
    const vals = Object.values(scopeByDistrict ?? {});
    if (!vals.length || responseTab === 'deconfliction') return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [scopeByDistrict, responseTab]);

  // Board rows = the ranked targets, each tagged with the shared sync key + the
  // status from its map_layer row + one key metric. Same key the map markers use.
  const board = useMemo(() => {
    const targets: Target[] = result?.targets ?? [];
    const rows = rowsOf(result?.map_layer?.data);
    const rowsHaveId = rows.some((r) => r.id != null);
    const keyOfTarget = (t: Target) => (rowsHaveId ? String(t.id) : String(t.admin_unit));
    const statusByKey: Record<string, string> = {};
    for (const r of rows) {
      const k = selKeyOfRow(r);
      const st = (r.status ?? r.severity) as unknown;
      if (k && st != null) statusByKey[k] = String(st);
    }
    const items: BoardItem[] = targets.map((t) => {
      const key = keyOfTarget(t);
      return { key, target: t, status: statusByKey[key] ?? null, metric: t.metrics?.[0] ?? null };
    });
    // Always show the surfaced markers in priority order on the side board.
    items.sort((a, b) => (a.target.rank ?? 1e9) - (b.target.rank ?? 1e9));
    return { items };
  }, [result]);

  const openTarget = (target: Target) =>
    setSelectedTarget({ title: target.name, metrics: target.metrics, evidence: result?.evidence ?? [] });

  // Click a board row: sticky-select it (drives the map highlight) and open detail.
  const handleBoardSelect = (item: BoardItem) => { setSelectedKey(item.key); openTarget(item.target); };

  // Click a map marker/district: match raw props → a full Target (props.id by id;
  // else by admin_unit === district/shapeName), set the shared key, open detail.
  const handleSelect = (props: Record<string, unknown>) => {
    setSelectedKey(selKeyOfRow(props));
    const targets: Target[] = result?.targets ?? [];
    let target: Target | undefined;
    if (props.id != null) target = targets.find((t) => t.id === String(props.id));
    if (!target) {
      const key = String(props.district ?? props.shapeName ?? '').trim();
      if (key) target = targets.find((t) => t.admin_unit === key);
    }
    if (target) openTarget(target);
    else setSelectedTarget({
      title: String(props.name ?? props.district ?? props.shapeName ?? 'Selected area').trim(),
      metrics: [], evidence: result?.evidence ?? [],
    });
  };

  // Resolve a provenance id from the loaded evidence, else fetch it, then open the
  // EvidencePanel (its provenance mode already exists).
  const openEvidence = async (provId: string) => {
    const local = (result?.evidence ?? []).find((p) => p.id === provId);
    if (local) { setSelectedProv(local); return; }
    try { setSelectedProv(await api.provenance(provId)); } catch { setSelectedProv(null); }
  };

  // Reset the selection/popup/evidence whenever the protocol tab changes.
  useEffect(() => {
    setSelectedTarget(null); setSelectedProv(null); setShowCaveats(false);
    setSelectedKey(null); setHoveredKey(null);
  }, [responseTab]);

  return (
    <div className="sylhet2022" data-testid="sylhet2022-module">
      {manifest && frames.length > 0 && (
        <SylhetFloodMap
          focus={manifest.focus}
          frames={frames}
          activeIndex={active}
          showRain={effectiveShowRain}
          protocolLayer={isResponse ? result?.map_layer ?? null : null}
          protocolId={isResponse ? responseTab : null}
          onSelectTarget={isResponse ? handleSelect : undefined}
          selectedKey={isResponse ? (hoveredKey ?? selectedKey) : null}
          scopeByDistrict={isResponse ? scopeByDistrict : null}
        />
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

      {isResponse && (
        <>
          {/* DECISION LINE — the single bold verdict for the active protocol. The
              headline already carries the key numbers, so no extra metric chips. */}
          <div className="syl-decision-line" role="status">
            <span className="syl-decision-dot" aria-hidden="true" />
            <strong>{result?.headline ?? 'Running protocol on Sylhet 2022 peak flood…'}</strong>
          </div>

          {/* LAYER RAIL — one active protocol at a time (radio behaviour). */}
          <nav className="syl-layer-rail" aria-label="Response protocols">
            <span className="syl-rail-title">Decision layer</span>
            {PROTOCOL_TABS.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={responseTab === t.id}
                className={`syl-rail-toggle ${responseTab === t.id ? 'on' : ''}`}
                onClick={() => setResponseTab(t.id)}
              >
                {t.label}
              </button>
            ))}
            <span className="syl-rail-caption">
              {PROTOCOL_TABS.find((t) => t.id === responseTab)?.caption}
            </span>
            <button
              type="button"
              className="syl-rail-sources"
              onClick={() => setShowCaveats((s) => !s)}
              aria-expanded={showCaveats}
            >
              ⓘ sources &amp; caveats
            </button>
            {showCaveats && (result?.caveats?.length ?? 0) > 0 && (
              <ul className="syl-rail-caveats">
                {result!.caveats.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}
          </nav>

          {/* LEGEND — district scope shading (magnitude) + the priority markers. */}
          {(legend.rows.length > 0 || scopeRange) && (
            <div className="syl-legend" aria-label="Map legend">
              {scopeRange && (
                <div className="syl-legend-scope">
                  <span className="syl-legend-title">District scope · children at risk</span>
                  <div className="syl-legend-ramp">
                    <span className="syl-legend-bar scope" />
                    <span className="syl-legend-label">
                      {scopeRange.min.toLocaleString()} – {scopeRange.max.toLocaleString()}
                    </span>
                  </div>
                  <span className="syl-legend-title" style={{ marginTop: 6 }}>Priority markers</span>
                </div>
              )}
              {legend.title && !scopeRange && <span className="syl-legend-title">{legend.title}</span>}
              {legend.rows.map((r, i) =>
                r.color === 'ramp' ? (
                  <div key={i} className="syl-legend-ramp">
                    <span className="syl-legend-bar" />
                    <span className="syl-legend-label">{r.label}</span>
                  </div>
                ) : (
                  <div key={i} className="syl-legend-row">
                    <span className="syl-legend-swatch" style={{ background: r.color }} />
                    <span className="syl-legend-label">{r.label}</span>
                  </div>
                ),
              )}
            </div>
          )}

          {/* BOARD — right pane: the active protocol's targets as a ranked
              leaderboard, synced with the map via selectedKey. */}
          <ProtocolBoard
            title={PROTOCOL_TABS.find((t) => t.id === responseTab)?.label ?? 'Targets'}
            items={board.items}
            selectedKey={selectedKey}
            onHover={setHoveredKey}
            onSelect={handleBoardSelect}
          />

          {/* POPUP — opened by a map click; <=4 short lines, per-metric source. */}
          {selectedTarget && (
            <ProtocolPopup
              title={selectedTarget.title}
              metrics={selectedTarget.metrics}
              evidence={selectedTarget.evidence}
              onOpenEvidence={openEvidence}
              onClose={() => setSelectedTarget(null)}
            />
          )}

          {/* EVIDENCE — provenance mode (the full source / method / caveat card). */}
          {selectedProv && (
            <EvidencePanel provenance={selectedProv} onClose={() => setSelectedProv(null)} />
          )}
        </>
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



