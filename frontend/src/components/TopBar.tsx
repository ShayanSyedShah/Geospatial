import type { Country, Region } from '../types';

interface Props {
  countries: Country[];
  country: string;
  onCountryChange: (c: string) => void;
  regions: Region[];
  district: string | null;
  onDistrictChange: (d: string | null) => void;
  onConnect: () => void;
  onMakePlan: () => void;
}

/** Top command bar: brand + scenario context + the two hero actions. */
export default function TopBar({
  countries, country, onCountryChange, regions, district, onDistrictChange,
  onConnect, onMakePlan,
}: Props) {
  const scope = district ?? country;
  return (
    <header className="topbar">
      <div className="tb-brand">
        <div className="tb-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3" y1="12" x2="21" y2="12" /></svg></div>
        <div className="tb-brandtext">
          <b>BEACON</b>
          <span>second-wave flood intelligence</span>
        </div>
      </div>

      <div className="tb-context">
        <span className="tb-loc">{scope}, {country}</span>
        <span className="tb-dot">·</span>
        <span className="tb-fore">3D geospatial base</span>
        <span className="tb-dot">·</span>
        <span className="tb-depth">buildings on city zoom</span>
      </div>

      <div className="tb-controls">
        <select className="tb-select" value={country} onChange={(e) => onCountryChange(e.target.value)}>
          {countries.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <select
          className="tb-select"
          value={district ?? ''}
          onChange={(e) => onDistrictChange(e.target.value || null)}
        >
          <option value="">All districts</option>
          {regions.map((r) => <option key={r.district} value={r.district}>{r.district}</option>)}
        </select>
        <button className="tb-btn ghost" onClick={onConnect}>⇄ Connect data</button>
        <button className="tb-btn primary" onClick={onMakePlan}>✦ Make plan</button>
      </div>
    </header>
  );
}
