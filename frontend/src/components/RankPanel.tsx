import { useState } from 'react';
import type { RankedZone, Weights } from '../types';
import { explain } from '../utils/rank';

interface Props {
  ranked: RankedZone[];
  weights: Weights;
  onWeights: (w: Weights) => void;
}

const FACTORS: { key: keyof Weights; label: string }[] = [
  { key: 'children', label: 'Children' },
  { key: 'flood', label: 'Flood depth' },
  { key: 'access', label: 'Clinic distance' },
];

export default function RankPanel({ ranked, weights, onWeights }: Props) {
  const [open, setOpen] = useState<string | null>(ranked[0]?.name ?? null);
  return (
    <div className="rank-panel">
      <div className="rank-title">Who to help first</div>

      <div className="weights">
        {FACTORS.map((f) => (
          <label key={f.key} className="weight">
            <span>{f.label}</span>
            <input type="range" min={0} max={1} step={0.05} value={weights[f.key]}
              onChange={(e) => onWeights({ ...weights, [f.key]: parseFloat(e.target.value) })} />
          </label>
        ))}
      </div>

      <ol className="rank-list">
        {ranked.slice(0, 6).map((z) => (
          <li key={z.name} className={`rank-row ${open === z.name ? 'open' : ''}`}>
            <button className="rank-head" onClick={() => setOpen(open === z.name ? null : z.name)}>
              <span className="rank-num">#{z.rank}</span>
              <span className="rank-name">{z.name}</span>
              <span className="rank-kids">{z.childrenU5.toLocaleString()} u5</span>
            </button>
            {open === z.name && <p className="rank-why">{explain(z)}</p>}
          </li>
        ))}
      </ol>
      <div className="rank-foot">Method: INFORM-style — normalized factors, log-scaled children. Adjust weights to re-rank.</div>
    </div>
  );
}
