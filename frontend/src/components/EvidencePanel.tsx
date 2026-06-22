import { useEffect, useState } from 'react';
import type { Evidence, Hexagon, Provenance, TimeHorizon } from '../types';
import { api } from '../services/api';
import { riskFactors } from '../utils/riskModel';

interface FloodProps {
  hexagon: Hexagon;
  time: number;
  maxU5: number;
  onClose: () => void;
}

interface ProvenanceProps {
  provenance: Provenance;
  onClose: () => void;
}

type Props = FloodProps | ProvenanceProps;

function horizonForTime(t: number): TimeHorizon {
  if (t < 1 / 3) return '4h';
  if (t < 2 / 3) return '20h';
  return '7d';
}

export default function EvidencePanel(props: Props) {
  if ('provenance' in props) {
    return <ProvenanceView provenance={props.provenance} onClose={props.onClose} />;
  }
  return <FloodEvidenceView hexagon={props.hexagon} time={props.time} maxU5={props.maxU5} onClose={props.onClose} />;
}

// ---------- Protocol provenance mode (any traceable number) ----------
function ProvenanceView({ provenance, onClose }: ProvenanceProps) {
  const p = provenance;
  const valStr = typeof p.value === 'number' ? p.value.toLocaleString() : p.value;
  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <div>
          <h2>Evidence</h2>
          <span className="hexid">{p.id}</span>
        </div>
        <button onClick={onClose} className="close-btn" aria-label="Close">×</button>
      </div>

      <div className="evidence-content">
        <section>
          <div className="prov-value">
            <b>{valStr}{p.unit ? <em> {p.unit}</em> : null}</b>
            <span>{p.label}</span>
          </div>
        </section>

        <section>
          <h3>Provenance</h3>
          <div className="source">
            <strong>{p.source}</strong>
            <p><span className="prov-key">Publisher</span> {p.publisher}</p>
            {p.dcid && <p><span className="prov-key">DCID</span> <code className="prov-dcid">{p.dcid}</code></p>}
            {p.date && <p><span className="prov-key">Date</span> {p.date}</p>}
            {p.method && <p><span className="prov-key">Method</span> {p.method}</p>}
            {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer">View source →</a>}
          </div>
        </section>

        {p.caveat && (
          <section>
            <h3>Caveat</h3>
            <p className="decision">{p.caveat}</p>
          </section>
        )}
      </div>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function FactorRow({ label, value, meaning, color }: { label: string; value: number; meaning: string; color: string }) {
  return (
    <div className="rf-row">
      <div className="rf-top"><span className="rf-label">{label}</span><span className="rf-val">{pct(value)}</span></div>
      <div className="rf-bar"><span style={{ width: pct(value), background: color }} /></div>
      <div className="rf-meaning">{meaning}</div>
    </div>
  );
}

// ---------- Flood hexagon mode (now with human-terrain risk factors) ----------
function FloodEvidenceView({ hexagon, time, maxU5, onClose }: FloodProps) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setEvidence(null);
    api.evidence(hexagon.h3_id).then(setEvidence).catch(() => setEvidence(null));
  }, [hexagon.h3_id]);

  const f = riskFactors(hexagon, maxU5);
  const nearestKm = hexagon.nearest_clinic_m != null ? (hexagon.nearest_clinic_m / 1000).toFixed(1) : '—';
  const tier = f.overall >= 0.66 ? 'high' : f.overall >= 0.33 ? 'moderate' : 'low';
  const tierWord = tier === 'high' ? 'High' : tier === 'moderate' ? 'Moderate' : 'Lower';

  // which human factor pushes this cell up the most?
  const amps = [
    { k: 'the number of people exposed', v: f.exposure },
    { k: 'being cut off from health care', v: f.access },
    { k: 'the loss of nearby clinics & schools', v: f.service },
  ].sort((a, b) => b.v - a.v);
  const explain =
    f.hazard < 0.1
      ? 'This cell barely floods, so its risk stays low whatever else is true.'
      : tier === 'high'
        ? `Flooding is likely here and the people in it would be hard to protect — the biggest driver is ${amps[0].k}.`
        : tier === 'moderate'
          ? `There is real flood exposure here, amplified mostly by ${amps[0].k}.`
          : 'There is some flood exposure, but few people or good access keep the overall risk lower.';

  const generateBrief = async () => {
    setDownloading(true);
    try {
      await api.downloadBrief(hexagon.h3_id, horizonForTime(time));
    } finally {
      setDownloading(false);
    }
  };

  const ff = evidence?.flood_forecast as Record<string, string> | undefined;

  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <div>
          <h2>Why this is {tierWord.toLowerCase()} risk</h2>
          <span className="hexid">{hexagon.district} · {hexagon.h3_id}</span>
        </div>
        <button onClick={onClose} className="close-btn" aria-label="Close">×</button>
      </div>

      <div className="evidence-content">
        <section>
          <div className="risk-headline">
            <span className={`risk-score ${tier}`}>{pct(f.overall)}</span>
            <div>
              <div className={`risk-tier ${tier}`}>{tierWord} risk</div>
              <div className="risk-sub">composite flood-risk score</div>
            </div>
          </div>
          <p className="risk-explain">{explain}</p>
        </section>

        <section>
          <h3>What drives it</h3>
          <FactorRow label="Flood hazard" value={f.hazard} color="#2c84e8"
            meaning="How likely this place is to flood — JRC/GloFAS return-period maps (rp10/100/500)." />
          <FactorRow label="People exposed" value={f.exposure} color="#f57d15"
            meaning={`${hexagon.population_u5.toLocaleString()} children under-5 here (WorldPop).`} />
          <FactorRow label="Access cut-off" value={f.access} color="#e0457b"
            meaning={`Nearest clinic is ${nearestKm} km away — further = harder to reach care.`} />
          <FactorRow label="Service loss" value={f.service} color="#9b51e0"
            meaning={`${hexagon.nearby_clinics} clinic(s) and ${hexagon.nearby_schools} school(s) within reach.`} />
          <p className="risk-formula">
            <strong>Overall = flood hazard × (people + access + service).</strong> Hazard gates the score —
            no flooding means low risk — and the human factors amplify it. So “high risk” means <em>both</em>{' '}
            water is likely <em>and</em> the people in it are hard to protect or reach.
          </p>
        </section>

        <section>
          <h3>Data sources</h3>
          <div className="source">
            <strong>Flood hazard</strong>
            <p>{ff?.source ?? 'JRC Global Flood Hazard / GloFAS (Copernicus EMS)'}</p>
            <p>Return periods rp10 / rp100 / rp500 · LISFLOOD hydrology</p>
            <a href={(ff?.url as string) ?? 'https://data.jrc.ec.europa.eu/collection/id-0054'} target="_blank" rel="noopener noreferrer">View source →</a>
          </div>
          <div className="source">
            <strong>Population</strong>
            <p>WorldPop 2020 age/sex structures · under-5 · 100 m grid</p>
            <a href="https://www.worldpop.org" target="_blank" rel="noopener noreferrer">View source →</a>
          </div>
          <div className="source">
            <strong>Facilities (access &amp; service)</strong>
            <p>Clinics: Healthsites.io / OpenStreetMap · Schools: Giga (ITU/UNICEF)</p>
            <a href="https://healthsites.io" target="_blank" rel="noopener noreferrer">View source →</a>
          </div>
        </section>

        <section>
          <h3>Confidence &amp; decision</h3>
          <p className="uncertainty">Overall uncertainty: ±{((evidence?.overall_uncertainty ?? hexagon.uncertainty) * 100).toFixed(0)}% (95% CI)</p>
          <p className={`decision ${f.overall > 0.6 ? 'high' : ''}`}>
            Decision rule: if overall risk &gt; 60%, prioritise pre-positioning &amp; evacuation planning.
            {f.overall > 0.6 ? ' — this zone is ABOVE threshold.' : ''}
          </p>
        </section>

        <button className="btn-primary" onClick={generateBrief} disabled={downloading}>
          {downloading ? 'Generating…' : 'Generate Decision Brief (PDF)'}
        </button>
      </div>
    </div>
  );
}
