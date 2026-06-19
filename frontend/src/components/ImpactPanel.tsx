import type { LevelImpact, RankedZone, UnicefStat } from '../types';
import type { TriggerStage } from '../scenarios';

interface Props {
  trigger: { stage: TriggerStage; label: string; text: string };
  impact: LevelImpact | null;
  ranked: RankedZone[];
  unicef: UnicefStat | null;
  onReport: () => void;
  generating: boolean;
}

export default function ImpactPanel({ trigger, impact, ranked, unicef, onReport, generating }: Props) {
  const t = impact?.total;
  const top = ranked.slice(0, 3);
  const topKids = top.reduce((s, z) => s + z.childrenU5, 0);
  const topClinics = top.reduce((s, z) => s + z.clinics, 0);

  return (
    <div className="impact-panel">
      <div className={`verdict ${trigger.stage}`}>
        <span className="verdict-badge">{trigger.label}</span>
        <span className="verdict-text">{trigger.text}</span>
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

      {top.length > 0 && (
        <div className="next-action">
          <span className="na-label">What to do</span>
          Reach <b>{top.map((z) => z.name).join(', ')}</b> first — ~{topKids.toLocaleString()} children u-5
          {topClinics > 0 && <> and {topClinics} clinics</> } in the flood zone. Pre-position water + hygiene kits.
        </div>
      )}

      <button className="report-btn" onClick={onReport} disabled={generating}>
        {generating ? 'Generating…' : '📄 Generate cited action report'}
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
