import { useMemo, useState } from 'react';
import type { Country, Region, Stats } from '../types';
import { riskColor } from '../utils/risk';

interface Props {
  countries: Country[];
  country: string;
  onCountryChange: (c: string) => void;
  stats: Stats | null;
  regions: Region[];
  selectedDistrict: string | null;
  onSelectDistrict: (d: string | null) => void;
}

function rgba(c: number[]) {
  return `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`;
}

export default function SidePanel({
  countries, country, onCountryChange, stats, regions, selectedDistrict, onSelectDistrict,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? regions.filter((r) => r.district.toLowerCase().includes(q)) : regions;
  }, [regions, query]);

  return (
    <div className="side-panel">
      <div className="brand">
        <div className="brand-mark" />
        <div>
          <h1>Flood Risk Map</h1>
          <p>Evidence-backed flood exposure</p>
        </div>
      </div>

      <div className="sp-section">
        <label>Country</label>
        <select value={country} onChange={(e) => onCountryChange(e.target.value)}>
          {countries.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {stats && (
        <div className="sp-stats">
          <div className="stat"><b>{stats.children_at_risk.toLocaleString()}</b><span>children under-5 exposed</span></div>
          <div className="stat-row">
            <div className="stat sm"><b>{stats.high_risk_hexagons}</b><span>high-risk zones</span></div>
            <div className="stat sm"><b>{stats.total_hexagons}</b><span>flood cells</span></div>
          </div>
        </div>
      )}

      <div className="sp-section grow">
        <div className="sp-list-head">
          <label>Districts by risk</label>
          {selectedDistrict && (
            <button className="clear-link" onClick={() => onSelectDistrict(null)}>Clear ✕</button>
          )}
        </div>
        <input
          className="search"
          placeholder="Search district…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="district-list">
          {filtered.map((r) => {
            const active = r.district === selectedDistrict;
            return (
              <button
                key={r.district}
                className={`district ${active ? 'active' : ''}`}
                onClick={() => onSelectDistrict(active ? null : r.district)}
              >
                <span className="risk-dot" style={{ background: rgba(riskColor(r.max_risk)) }} />
                <span className="d-name">{r.district}</span>
                <span className="d-meta">
                  {r.children_at_risk.toLocaleString()} u5
                  {r.high_risk_hexagons > 0 && <em> · {r.high_risk_hexagons} hot</em>}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="empty">No districts match.</div>}
        </div>
      </div>
    </div>
  );
}
