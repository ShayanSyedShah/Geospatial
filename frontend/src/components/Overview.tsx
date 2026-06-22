import { useEffect, useState, type ReactNode } from 'react';
import type { ModuleId } from './BeaconShell';
import { api } from '../services/api';

interface TileData { a: string; al: string; b: string; bl: string; }

export default function Overview({ onNavigate }: { onNavigate: (m: ModuleId) => void }) {
  const [tiles, setTiles] = useState<Record<string, TileData> | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    const c = 'Bangladesh';
    Promise.all([api.hexagons(c), api.supply(c, null), api.complaints(c), api.education(c, null)])
      .then(([hx, sup, comp, edu]) => {
        const exposed = hx.hexagons.filter((h) => h.flood_risk_7d > 0.05).reduce((a, h) => a + h.population_u5, 0);
        const hot = hx.hexagons.filter((h) => h.flood_risk_7d > 0.6).length;
        setTiles({
          flood: { a: exposed.toLocaleString(), al: 'children exposed', b: String(hot), bl: 'hot zones' },
          supply: { a: sup.efficiency.optimized + '%', al: 'priority coverage', b: String(sup.routes.filter((r) => r.status === 'cut').length), bl: 'routes cut' },
          complaints: { a: String(comp.complaints.filter((x) => x.status !== 'resolved').length), al: 'open issues', b: String(comp.complaints.filter((x) => x.severity === 'urgent').length), bl: 'urgent' },
          education: { a: String(edu.schools_hit), al: 'schools hit', b: edu.children_out.toLocaleString(), bl: 'children out of class' },
        });
      })
      .catch(() => setErr(true));
  }, []);

  const TILES: { id: ModuleId; icon: ReactNode; title: string; tone: string; blurb: string }[] = [
    { id: 'flood', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>, title: 'Flood impact', tone: 'blue', blurb: 'Who the water hits — children, clinics, schools, in 3D.' },
    { id: 'supply', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/></svg>, title: 'Supply chain', tone: 'blue2', blurb: 'Route relief around flooded corridors to the most at-risk.' },
    { id: 'complaints', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M4 5h16v11H9l-4 4z"/></svg>, title: 'Complaints', tone: 'deep', blurb: 'One board for community + field reports, triaged to resolution.' },
    { id: 'education', icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M2 8l10-4 10 4-10 4z"/><path d="M6 10v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>, title: 'Education', tone: 'blue2', blurb: 'Keep children learning through and after the disaster.' },
  ];

  return (
    <div className="overview">
      <header className="ov-head">
        <div className="ov-mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3" y1="12" x2="21" y2="12" /></svg></div>
        <div className="ov-title">
          <h1>Lighthouse</h1>
          <p>Sirajganj, Bangladesh · Flood forecast <b>+72h</b></p>
        </div>
        <div className="ov-live"><span className="ov-pulse" /> live scenario</div>
      </header>

      <div className="ov-banner">
        One coherent picture across the whole response: <b>who's hit</b>, <b>what to send</b>,
        <b> what people need</b>, and <b>how children keep learning</b> — every number traceable to UN data.
      </div>

      {err && <div className="toast error" style={{ position: 'static', display: 'inline-block' }}>Backend unavailable — start the API on :8001</div>}

      <div className="ov-grid">
        {TILES.map((t) => {
          const d = tiles?.[t.id];
          return (
            <div key={t.id} className={`ov-tile tone-${t.tone}`}>
              <div className="ovt-head">
                <span className="ovt-icon">{t.icon}</span>
                <b>{t.title}</b>
              </div>
              <p className="ovt-blurb">{t.blurb}</p>
              <div className="ovt-stats">
                <div><b>{d?.a ?? '—'}</b><span>{d?.al ?? ' '}</span></div>
                <div><b>{d?.b ?? '—'}</b><span>{d?.bl ?? ' '}</span></div>
              </div>
              <button className="ovt-btn" onClick={() => onNavigate(t.id)}>View more →</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
