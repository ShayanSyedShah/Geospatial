import { useMemo, useState } from 'react';
import type { EvacRoute, Region, UserLocation } from '../types';
import type { FloodOverlaySettings } from './FloodOverlayControls';
import { timeLabel, waterColor } from '../utils/risk';
import { compass } from '../utils/geo';
import Section from './Section';

interface Props {
  country: string;
  live: { exposed: number; high: number; cells: number };
  time: number;
  scope: string | null;
  regions: Region[];
  selectedDistrict: string | null;
  onSelectDistrict: (d: string | null) => void;
  userLocation: UserLocation | null;
  onPreset: (lng: number, lat: number, label: string) => void;
  onClearLocation: () => void;
  route: EvacRoute | null;
  overlay: FloodOverlaySettings;
  onOverlayChange: (s: FloodOverlaySettings) => void;
  floodedCount: number;
}

const PRESETS: Record<string, { label: string; lng: number; lat: number }[]> = {
  Bangladesh: [
    { label: 'Sirajganj (Jamuna)', lng: 89.7, lat: 24.45 },
    { label: 'Sylhet (haor wetlands)', lng: 91.87, lat: 24.89 },
    { label: 'Kurigram (Brahmaputra)', lng: 89.65, lat: 25.81 },
    { label: 'Bhola (coastal island)', lng: 90.71, lat: 22.34 },
  ],
  Uganda: [
    { label: 'Kasese (Nyamwamba)', lng: 30.08, lat: 0.18 },
    { label: 'Butaleja (eastern)', lng: 33.95, lat: 0.92 },
  ],
};

const rgba = (c: number[]) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`;
const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export default function SidePanel({
  country, live, time, scope, regions, selectedDistrict, onSelectDistrict,
  userLocation, onPreset, onClearLocation, route,
  overlay, onOverlayChange, floodedCount,
}: Props) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? regions.filter((r) => r.district.toLowerCase().includes(q)) : regions;
  }, [regions, query]);
  const presets = PRESETS[country] ?? [];

  // Protocol checklist derived from the live situation.
  const protocols = useMemo(() => {
    const items: { id: string; label: string; urgent: boolean }[] = [];
    items.push({ id: 'supplies', label: `Pre-position relief supplies for ~${live.exposed.toLocaleString()} exposed under-5s`, urgent: live.high > 0 });
    items.push({ id: 'water', label: 'Stage water-purification units', urgent: false });
    items.push({ id: 'cold', label: 'Protect cold chain at at-risk clinics', urgent: false });
    items.push({ id: 'evac', label: 'Confirm evacuation centres above flood line', urgent: false });
    return items;
  }, [live.exposed, live.high]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  return (
    <>
      <button
        className={`sp-toggle ${panelOpen ? 'is-open' : 'is-closed'}`}
        onClick={() => setPanelOpen((o) => !o)}
        title={panelOpen ? 'Hide panel' : 'Show panel'}
        aria-label={panelOpen ? 'Hide panel' : 'Show panel'}
      >
        {panelOpen ? '◀' : '▶'}
      </button>
      <div className={`side-panel dashboard ${panelOpen ? '' : 'collapsed'}`}>
      <Section title="Wave 1 · Today" icon="🌊" defaultOpen badge={`${live.cells} cells`}>
        <div className="sp-stats">
          <div className="stat">
            <b>{live.exposed.toLocaleString()}</b>
            <span>children under-5 exposed{scope ? ` in ${scope}` : ''} at {timeLabel(time)}</span>
          </div>
          <div className="stat-row">
            <div className="stat sm"><b>{live.high}</b><span>high-risk zones</span></div>
            <div className="stat sm"><b>{live.cells}</b><span>risk cells</span></div>
          </div>
        </div>

        <div className="sp-list-head" style={{ marginTop: 4 }}>
          <label>Your location</label>
          {userLocation && <button className="clear-link" onClick={onClearLocation}>Clear ✕</button>}
        </div>
        <select value="" onChange={(e) => { const p = presets[Number(e.target.value)]; if (p) onPreset(p.lng, p.lat, p.label); }}>
          <option value="" disabled>Pick an at-risk village…</option>
          {presets.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
        </select>
        <p className="tap-hint">…or tap anywhere on the map to drop yourself.</p>
        {route && (
          <div className="evac-card">
            <div className="evac-title">🏥 Nearest safe clinic</div>
            <div className="evac-name">{route.to.name || 'Health facility'}</div>
            <div className="evac-meta">
              {km(route.distanceM)} · {Math.max(1, Math.round(route.durationS / 60))} min · head {compass(route.bearing)}
              <span className={`mode ${route.mode}`}>{route.mode === 'road' ? 'road' : 'direct'}</span>
            </div>
          </div>
        )}
      </Section>

      <Section title="Protocols" icon="📋" defaultOpen badge={protocols.filter((p) => p.urgent).length || null}>
        <div className="protocols">
          {protocols.map((p) => (
            <label key={p.id} className={`protocol ${checked[p.id] ? 'done' : ''} ${p.urgent ? 'urgent' : ''}`}>
              <input type="checkbox" checked={!!checked[p.id]} onChange={() => setChecked((c) => ({ ...c, [p.id]: !c[p.id] }))} />
              <span>{p.label}</span>
              {p.urgent && !checked[p.id] && <em>now</em>}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Map layers" icon="🗺" defaultOpen={false}>
        <div className="layer-list">
          <label className="overlay-toggle">
            <input type="checkbox" checked={overlay.showHumanTerrain} onChange={(e) => onOverlayChange({ ...overlay, showHumanTerrain: e.target.checked })} />
            Human terrain <em>hides on zoom-in</em>
          </label>
          <label className="overlay-toggle">
            <input type="checkbox" checked={overlay.showFloodCells} onChange={(e) => onOverlayChange({ ...overlay, showFloodCells: e.target.checked })} />
            Risk grid <em>{floodedCount} cells</em>
          </label>
          <label className="overlay-toggle">
            <input type="checkbox" checked={overlay.showRiverExtent} onChange={(e) => onOverlayChange({ ...overlay, showRiverExtent: e.target.checked })} />
            Flood extent
          </label>
          <label className="overlay-toggle">
            <input type="checkbox" checked={overlay.showPopulation} onChange={(e) => onOverlayChange({ ...overlay, showPopulation: e.target.checked })} />
            Population density <em>NASA SEDAC</em>
          </label>
        </div>
      </Section>

      <Section title="Districts by risk" icon="📍" defaultOpen={false} badge={regions.length || null}>
        <div className="sp-list-head">
          <label>Ranked by children at risk</label>
          {selectedDistrict && <button className="clear-link" onClick={() => onSelectDistrict(null)}>Clear ✕</button>}
        </div>
        <input className="search" placeholder="Search district…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="district-list">
          {filtered.map((r) => {
            const active = r.district === selectedDistrict;
            return (
              <button key={r.district} className={`district ${active ? 'active' : ''}`} onClick={() => onSelectDistrict(active ? null : r.district)}>
                <span className="risk-dot" style={{ background: rgba(waterColor(r.max_risk)) }} />
                <span className="d-name">{r.district}</span>
                <span className="d-meta">{r.children_at_risk.toLocaleString()} u5{r.high_risk_hexagons > 0 && <em> · {r.high_risk_hexagons} hot</em>}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="empty">No districts match.</div>}
        </div>
      </Section>
      </div>
    </>
  );
}
