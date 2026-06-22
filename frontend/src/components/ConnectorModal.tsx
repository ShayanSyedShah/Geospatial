import { useState } from 'react';
import { api } from '../services/api';
import type { ConnectResult } from '../types';

interface Props {
  country: string;
  onClose: () => void;
}

// Three "messy file" demos the judge can drop in.
const SAMPLES: Record<string, { name: string; columns: string[]; places: string[] }> = {
  'ngo_survey.xlsx': {
    name: 'Local NGO population survey (Excel)',
    columns: ['kids_u5', 'district_name', 'elderly', 'toilet', 'lat', 'lng'],
    places: ['Sirajgonj', 'Bhola', 'Kurigram'],
  },
  'facility_report.pdf': {
    name: 'Facility PDF report (table extract)',
    columns: ['Children (0-4)', 'Area', 'type', 'pop'],
    places: ['Shirajganj', 'Sylhet'],
  },
  'admin_export.csv': {
    name: 'Government CSV export',
    columns: ['under5_pop', 'adm2', 'pcode', 'aged_60', 'san_access'],
    places: ['BD-54', 'Patuakhali'],
  },
};

export default function ConnectorModal({ country, onClose }: Props) {
  const [file, setFile] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);

  const run = async (key: string) => {
    setFile(key); setBusy(true); setResult(null);
    const s = SAMPLES[key];
    try {
      const r = await api.connect(s.columns, s.places, country);
      // small delay so the "30 seconds → instant" beat reads on screen
      setTimeout(() => { setResult(r); setBusy(false); }, 600);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal connector" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>The Connector</h2>
            <p>Drop any messy file → auto-joined to the UN Data Commons graph.</p>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="conn-files">
            {Object.entries(SAMPLES).map(([key, s]) => (
              <button key={key} className={`conn-file ${file === key ? 'active' : ''}`} onClick={() => run(key)}>
                <span className="cf-ext">{key.split('.').pop()}</span>
                <span className="cf-name">{s.name}</span>
                <span className="cf-meta">{s.columns.length} cols · {s.places.length} places</span>
              </button>
            ))}
          </div>

          {busy && <div className="conn-status">⚙ Reading columns, matching the UN vocabulary, resolving places…</div>}

          {result && (
            <div className="conn-result">
              <div className={`conn-summary ${result.summary.ready_to_join ? 'ok' : ''}`}>
                {result.summary.columns_auto_mapped}/{result.summary.columns_total} columns auto-mapped ·{' '}
                {result.summary.places_resolved}/{result.summary.places_total} places resolved ·{' '}
                {result.summary.ready_to_join ? '✓ ready to join' : 'needs review'}
              </div>

              <h4>Column mapping</h4>
              <table className="conn-table">
                <tbody>
                  {result.columns.map((c) => (
                    <tr key={c.column}>
                      <td className="mono">{c.column}</td>
                      <td className="arrow">→</td>
                      <td>{c.label ?? '—'} <code>{c.mapped_to}</code></td>
                      <td><span className={`pill ${c.status}`}>{Math.round(c.confidence * 100)}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4>Place resolution</h4>
              <table className="conn-table">
                <tbody>
                  {result.places.map((p) => (
                    <tr key={p.input}>
                      <td className="mono">{p.input}</td>
                      <td className="arrow">→</td>
                      <td>{p.resolved} <code>{p.pcode}</code></td>
                      <td><span className={`pill ${p.method === 'unresolved' ? 'review' : 'auto'}`}>{p.method}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!file && (
            <p className="conn-hint">
              Today a data engineer spends days hand-joining these. Lighthouse does the still-manual
              parts — AI column-mapping, fuzzy place resolution — in seconds, offline.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
