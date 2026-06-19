import type { LevelImpact, UnicefStat } from '../types';

interface Props {
  level: number;
  danger: number;
  impact: LevelImpact | null;
  unicef: UnicefStat | null;
  onReport: () => void;
  generating: boolean;
}

function verdict(level: number, danger: number) {
  if (level >= danger) return { label: 'DANGER', cls: 'danger', text: 'At this level the floodplain is inundated — act now.' };
  if (level >= danger - 2.5) return { label: 'WATCH', cls: 'watch', text: 'Water is rising toward the danger level — prepare.' };
  return { label: 'LOW', cls: 'safe', text: 'Limited inundation at this level.' };
}

export default function ImpactPanel({ level, danger, impact, unicef, onReport, generating }: Props) {
  const v = verdict(level, danger);
  const t = impact?.total;
  return (
    <div className="impact-panel">
      <div className={`verdict ${v.cls}`}>
        <span className="verdict-badge">{v.label}</span>
        <span className="verdict-text">{v.text}</span>
      </div>

      <div className="impact-hero">
        <b>{(t?.childrenU5 ?? 0).toLocaleString()}</b>
        <span>children under-5 in the flood zone</span>
      </div>
      <div className="impact-row">
        <div className="impact-stat"><b>{t?.schools ?? 0}</b><span>schools flooded</span></div>
        <div className="impact-stat"><b>{t?.clinics ?? 0}</b><span>clinics flooded</span></div>
        <div className="impact-stat"><b>{(t?.maxDepth ?? 0).toFixed(1)}m</b><span>max depth</span></div>
      </div>

      <button className="report-btn" onClick={onReport} disabled={generating}>
        {generating ? 'Generating…' : '📄 Generate action report'}
      </button>

      {unicef && (
        <div className="unicef-cite">
          <b>{unicef.value.toFixed(0)}</b> {unicef.indicator.toLowerCase()} (Bangladesh, {unicef.year})
          {unicef.ci_low != null && <> · CI {unicef.ci_low.toFixed(0)}–{unicef.ci_high?.toFixed(0)}</>}
          <span className="src">Source: {unicef.source}</span>
        </div>
      )}

      <div className="caveat">
        Indicative “bathtub” screening on a 30 m DEM (Copernicus), connected to the Jamuna. Over-predicts
        extent; for prioritisation, not hydrodynamic modelling.
      </div>
    </div>
  );
}
