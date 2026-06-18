import { useEffect, useState } from 'react';
import type { Evidence, Hexagon, TimeHorizon } from '../types';
import { api } from '../services/api';
import { riskAtTime, riskLabel, timeLabel } from '../utils/risk';

interface Props {
  hexagon: Hexagon;
  time: number;
  onClose: () => void;
}

function horizonForTime(t: number): TimeHorizon {
  if (t < 1 / 3) return '4h';
  if (t < 2 / 3) return '20h';
  return '7d';
}

export default function EvidencePanel({ hexagon, time, onClose }: Props) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setEvidence(null);
    api.evidence(hexagon.h3_id).then(setEvidence).catch(() => setEvidence(null));
  }, [hexagon.h3_id]);

  const risk = riskAtTime(hexagon, time);
  const nearestKm = hexagon.nearest_clinic_m != null ? (hexagon.nearest_clinic_m / 1000).toFixed(1) : null;

  const generateBrief = async () => {
    setDownloading(true);
    try {
      await api.downloadBrief(hexagon.h3_id, horizonForTime(time));
    } finally {
      setDownloading(false);
    }
  };

  const ff = evidence?.flood_forecast as Record<string, string> | undefined;
  const pop = evidence?.population as Record<string, string> | undefined;

  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <div>
          <h2>Evidence Chain</h2>
          <span className="hexid">{hexagon.district} · {hexagon.h3_id}</span>
        </div>
        <button onClick={onClose} className="close-btn" aria-label="Close">×</button>
      </div>

      <div className="evidence-content">
        <section>
          <h3>Risk Assessment ({timeLabel(time)})</h3>
          <div className="metric"><span>Flood risk</span><span className="value risk">{(risk * 100).toFixed(0)}% · {riskLabel(risk)}</span></div>
          <div className="metric"><span>Children under-5 at risk</span><span className="value">{hexagon.population_u5.toLocaleString()}</span></div>
          <div className="metric"><span>Nearby health clinics</span><span className="value">{hexagon.nearby_clinics}</span></div>
          <div className="metric"><span>Nearby schools</span><span className="value">{hexagon.nearby_schools}</span></div>
          {nearestKm && <div className="metric"><span>Nearest clinic</span><span className="value">{nearestKm} km</span></div>}
        </section>

        <section>
          <h3>Data Sources</h3>
          <div className="source">
            <strong>Flood forecast</strong>
            <p>{ff?.source ?? 'GloFAS / JRC Global Flood Hazard (Copernicus EMS)'}</p>
            <p>{ff?.model ?? 'LISFLOOD hydrological model'}</p>
            <p>{ff?.validation ?? '28-year validated lineage'}</p>
            <a href={(ff?.url as string) ?? 'https://data.jrc.ec.europa.eu/collection/id-0054'} target="_blank" rel="noopener noreferrer">View source →</a>
          </div>
          <div className="source">
            <strong>Population</strong>
            <p>{pop?.source ?? 'WorldPop 2020 age/sex structures'}</p>
            <p>{pop?.method ?? 'Under-5 = female/male ages 0 and 1-4'}</p>
            <p>Resolution: {pop?.resolution ?? '100 m grid'}</p>
            <a href={(pop?.url as string) ?? 'https://www.worldpop.org'} target="_blank" rel="noopener noreferrer">View source →</a>
          </div>
          <div className="source">
            <strong>Infrastructure</strong>
            <p>Schools: {evidence?.infrastructure.schools.source ?? 'Giga (ITU/UNICEF) + OpenStreetMap'}</p>
            <p>Clinics: {evidence?.infrastructure.clinics.source ?? 'Healthsites.io / OpenStreetMap'}</p>
            <a href={evidence?.infrastructure.clinics.url ?? 'https://healthsites.io'} target="_blank" rel="noopener noreferrer">View source →</a>
          </div>
        </section>

        <section>
          <h3>Confidence &amp; Decision</h3>
          <p className="uncertainty">Overall uncertainty: ±{((evidence?.overall_uncertainty ?? hexagon.uncertainty) * 100).toFixed(0)}% (95% CI)</p>
          <p className={`decision ${risk > (evidence?.decision_threshold ?? 0.6) ? 'high' : ''}`}>
            {evidence?.decision_rule ?? 'If risk > 60%, prioritise evacuation / pre-positioning.'}
            {risk > (evidence?.decision_threshold ?? 0.6) ? ' — this zone is ABOVE threshold.' : ''}
          </p>
        </section>

        <button className="btn-primary" onClick={generateBrief} disabled={downloading}>
          {downloading ? 'Generating…' : 'Generate Decision Brief (PDF)'}
        </button>
      </div>
    </div>
  );
}
