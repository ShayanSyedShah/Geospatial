import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { EducationData } from '../types';

export default function EducationModule() {
  const [data, setData] = useState<EducationData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.education('Bangladesh', null).then(setData).catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="module-pad"><h1>Education</h1><div className="toast error" style={{ position: 'static' }}>Backend unavailable — {err}</div></div>;
  if (!data) return <div className="module-pad"><h1>Education</h1><p className="mod-loading">Assessing affected schools…</p></div>;

  const pct = data.schools_total ? Math.round((data.schools_hit / data.schools_total) * 100) : 0;
  const doneCount = Object.values(done).filter(Boolean).length;

  return (
    <div className="module-pad education">
      <header className="mod-head">
        <div>
          <h1>🎓 Education in emergencies</h1>
          <p>Keep children learning through and after the flood — Bangladesh.</p>
        </div>
      </header>

      <div className="edu-stats">
        <div className="edu-stat coral">
          <b>{data.schools_hit.toLocaleString()}</b>
          <span>schools hit <em>of {data.schools_total.toLocaleString()} ({pct}%)</em></span>
        </div>
        <div className="edu-stat amber">
          <b>{data.children_out.toLocaleString()}</b>
          <span>children out of class</span>
        </div>
        <div className="edu-stat green">
          <b>{data.learning_centers.toLocaleString()}</b>
          <span>temporary learning spaces recommended</span>
        </div>
      </div>

      <div className="edu-cols">
        <section className="edu-card">
          <h3>Recovery timeline</h3>
          <div className="edu-timeline">
            {data.recovery.map((r) => (
              <div key={r.week} className="edu-step">
                <div className="es-week">Week {r.week}</div>
                <div className="es-track"><i style={{ width: `${r.reopened_pct}%` }} /></div>
                <div className="es-label">{r.label}</div>
                <div className="es-pct">{r.reopened_pct}% reopened</div>
              </div>
            ))}
          </div>
        </section>

        <section className="edu-card">
          <h3>Curriculum kit to deploy <span className="kit-count">{doneCount}/{data.curriculum.length}</span></h3>
          <div className="edu-kit">
            {data.curriculum.map((c) => (
              <label key={c.id} className={`kit-item ${done[c.id] ? 'done' : ''}`}>
                <input type="checkbox" checked={!!done[c.id]} onChange={() => setDone((d) => ({ ...d, [c.id]: !d[c.id] }))} />
                <div>
                  <b>{c.name}</b>
                  <span>{c.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
