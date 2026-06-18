import type { Stats, TimeHorizon } from '../types';

interface Props {
  country: string;
  timeHorizon: TimeHorizon;
  onTimeHorizonChange: (h: TimeHorizon) => void;
  stats: Stats | null;
  compact?: boolean;
}

const HORIZONS: { id: TimeHorizon; label: string }[] = [
  { id: '4h', label: '4h' },
  { id: '20h', label: '20h' },
  { id: '7d', label: '7d' },
];

const COUNTRIES = [
  { name: 'Uganda', active: true },
  { name: 'Kenya', active: false },
  { name: 'Bangladesh', active: false },
  { name: 'Myanmar', active: false },
];

export default function ControlPanel({ country, timeHorizon, onTimeHorizonChange, stats, compact }: Props) {
  return (
    <div className={`control-panel ${compact ? 'compact' : ''}`}>
      <div className="control-section">
        <label>Country</label>
        <select value={country} disabled>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}{c.active ? '' : ' (coming soon)'}
            </option>
          ))}
        </select>
      </div>

      <div className="control-section">
        <label>Forecast horizon</label>
        <div className="button-group">
          {HORIZONS.map((h) => (
            <button
              key={h.id}
              className={timeHorizon === h.id ? 'active' : ''}
              onClick={() => onTimeHorizonChange(h.id)}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {stats && (
        <div className="control-stats">
          <div><b>{stats.children_at_risk.toLocaleString()}</b> children under-5 in mapped zones</div>
          <div><b>{stats.high_risk_hexagons}</b> high-risk zones (&gt;60%)</div>
          <div><b>{stats.total_hexagons}</b> hexagons · avg risk {(stats.avg_flood_risk * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
}
