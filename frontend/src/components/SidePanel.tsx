import { useMemo, useState } from 'react';
import type { Country, EvacRoute, Region, UserLocation } from '../types';
import { timeLabel, waterColor } from '../utils/risk';
import { compass } from '../utils/geo';

interface Props {
  countries: Country[];
  country: string;
  onCountryChange: (c: string) => void;
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
}

// Demo locations in flood-prone areas (presenter isn't physically there).
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
  countries, country, onCountryChange, live, time, scope, regions, selectedDistrict, onSelectDistrict,
  userLocation, onPreset, onClearLocation, route,
}: Props) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? regions.filter((r) => r.district.toLowerCase().includes(q)) : regions;
  }, [regions, query]);
  const presets = PRESETS[country] ?? [];

  return (
    <div className="side-panel">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <h1>Flood Risk Map</h1>
          <p>Where to go when the water rises</p>
        </div>
      </div>

      <div className="sp-section">
        <label>Country</label>
        <select value={country} onChange={(e) => onCountryChange(e.target.value)}>
          {countries.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>

      <div className="sp-stats">
        <div className="stat">
          <b>{live.exposed.toLocaleString()}</b>
          <span>children under-5 exposed{scope ? ` in ${scope}` : ''} at {timeLabel(time)}</span>
        </div>
        <div className="stat-row">
          <div className="stat sm"><b>{live.high}</b><span>high-risk zones</span></div>
          <div className="stat sm"><b>{live.cells}</b><span>flooded cells</span></div>
        </div>
      </div>

      {/* Location / evacuation */}
      <div className="sp-section">
        <div className="sp-list-head">
          <label>Your location</label>
          {userLocation && <button className="clear-link" onClick={onClearLocation}>Clear ✕</button>}
        </div>
        <select
          value=""
          onChange={(e) => {
            const p = presets[Number(e.target.value)];
            if (p) onPreset(p.lng, p.lat, p.label);
          }}
        >
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
      </div>

      <div className="sp-section grow">
        <div className="sp-list-head">
          <label>Districts by risk</label>
          {selectedDistrict && <button className="clear-link" onClick={() => onSelectDistrict(null)}>Clear ✕</button>}
        </div>
        <input className="search" placeholder="Search district…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="district-list">
          {filtered.map((r) => {
            const active = r.district === selectedDistrict;
            return (
              <button key={r.district} className={`district ${active ? 'active' : ''}`}
                onClick={() => onSelectDistrict(active ? null : r.district)}>
                <span className="risk-dot" style={{ background: rgba(waterColor(r.max_risk)) }} />
                <span className="d-name">{r.district}</span>
                <span className="d-meta">{r.children_at_risk.toLocaleString()} u5{r.high_risk_hexagons > 0 && <em> · {r.high_risk_hexagons} hot</em>}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="empty">No districts match.</div>}
        </div>
      </div>
    </div>
  );
}
