import { RISK_LEGEND } from '../utils/risk';

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Flood risk · height = severity</div>
      {RISK_LEGEND.map((l) => (
        <div className="legend-item" key={l.label}>
          <span className="legend-color" style={{ backgroundColor: l.color }} />
          <span>{l.label}</span>
        </div>
      ))}
    </div>
  );
}
