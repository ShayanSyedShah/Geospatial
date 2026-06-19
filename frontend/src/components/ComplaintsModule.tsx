import { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import type { Complaint } from '../types';

const COLS: { id: Complaint['status']; label: string }[] = [
  { id: 'reported', label: 'Reported' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
];
const NEXT: Record<Complaint['status'], Complaint['status'] | null> = {
  reported: 'in_progress', in_progress: 'resolved', resolved: null,
};
const sevRank: Record<Complaint['severity'], number> = { urgent: 0, high: 1, med: 2 };

export default function ComplaintsModule() {
  const [items, setItems] = useState<Complaint[]>([]);
  const [src, setSrc] = useState<'all' | 'community' | 'field'>('all');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.complaints('Bangladesh').then((d) => setItems(d.complaints)).catch((e) => setErr(String(e)));
  }, []);

  const filtered = useMemo(
    () => items.filter((c) => src === 'all' || c.source === src)
      .sort((a, b) => sevRank[a.severity] - sevRank[b.severity]),
    [items, src],
  );

  const advance = (id: string) => setItems((prev) => prev.map((c) => {
    if (c.id !== id) return c;
    const n = NEXT[c.status];
    return n ? { ...c, status: n } : c;
  }));

  const open = items.filter((c) => c.status !== 'resolved').length;
  const urgent = items.filter((c) => c.severity === 'urgent' && c.status !== 'resolved').length;

  if (err) return <div className="module-pad"><h1>Complaints</h1><div className="toast error" style={{ position: 'static' }}>Backend unavailable — {err}</div></div>;

  return (
    <div className="module-pad complaints">
      <header className="mod-head">
        <div>
          <h1>📣 Complaints & needs intake</h1>
          <p>One board for community reports and field-staff blockers — triaged to resolution.</p>
        </div>
        <div className="comp-summary">
          <div><b>{open}</b><span>open</span></div>
          <div className="urgent"><b>{urgent}</b><span>urgent</span></div>
        </div>
      </header>

      <div className="src-toggle">
        {(['all', 'community', 'field'] as const).map((s) => (
          <button key={s} className={src === s ? 'active' : ''} onClick={() => setSrc(s)}>
            {s === 'all' ? 'All' : s === 'community' ? 'Community' : 'Field staff'}
          </button>
        ))}
      </div>

      <div className="kanban">
        {COLS.map((col) => {
          const cards = filtered.filter((c) => c.status === col.id);
          return (
            <div key={col.id} className="kan-col">
              <div className="kan-head">{col.label}<span>{cards.length}</span></div>
              <div className="kan-body">
                {cards.map((c) => (
                  <div key={c.id} className={`kan-card sev-${c.severity}`}>
                    <div className="kc-top">
                      <span className={`pill sev ${c.severity}`}>{c.severity}</span>
                      <span className={`src-tag ${c.source}`}>{c.source === 'community' ? '👤 community' : '🛠 field'}</span>
                    </div>
                    <p className="kc-text">{c.text}</p>
                    <div className="kc-foot">
                      <span>{c.district} · {c.age_h}h ago</span>
                      {NEXT[c.status] && <button onClick={() => advance(c.id)}>{c.status === 'reported' ? 'Start →' : 'Resolve →'}</button>}
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <div className="kan-empty">Nothing here.</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
