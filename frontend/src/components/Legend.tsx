import { WATER_LEGEND } from '../utils/risk';

export default function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Flood depth</div>
      <div className="legend-bar">
        {WATER_LEGEND.slice().reverse().map((l) => (
          <span key={l.label} style={{ background: l.color }} title={l.label} />
        ))}
      </div>
      <div className="legend-bar-labels"><span>Shallow</span><span>Deepest</span></div>
      <div className="legend-markers">
        <div className="lm"><img src="/m-clinic-risk.png" alt="" /> Clinic (at risk)</div>
        <div className="lm"><img src="/m-clinic.png" alt="" /> Clinic (safe)</div>
        <div className="lm"><img src="/m-school.png" alt="" /> School</div>
      </div>
    </div>
  );
}
