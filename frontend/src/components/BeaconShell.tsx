import { useState, type ReactNode } from 'react';

export type ModuleId = 'overview' | 'flood' | 'supply' | 'complaints' | 'education';

const ICON = {
  overview: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  flood: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>,
  supply: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>,
  complaints: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M4 5h16v11H9l-4 4z"/><line x1="8" y1="9.5" x2="16" y2="9.5"/><line x1="8" y1="12.5" x2="13" y2="12.5"/></svg>,
  education: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M2 8l10-4 10 4-10 4z"/><path d="M6 10v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>,
};

const NAV: { id: ModuleId; icon: ReactNode; label: string }[] = [
  { id: 'overview', icon: ICON.overview, label: 'Overview' },
  { id: 'flood', icon: ICON.flood, label: 'Flood' },
  { id: 'supply', icon: ICON.supply, label: 'Supply' },
  { id: 'complaints', icon: ICON.complaints, label: 'Complaints' },
  { id: 'education', icon: ICON.education, label: 'Education' },
];

export default function BeaconShell({ active, onNavigate, children }: {
  active: ModuleId;
  onNavigate: (m: ModuleId) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shell">
      <nav className={`rail ${open ? 'open' : ''}`}>
        <button className="rail-toggle" onClick={() => setOpen((o) => !o)} title="Menu">☰</button>
        <div className="rail-brand"><span className="rail-mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><line x1="3" y1="12" x2="21" y2="12" /></svg></span><span className="ri-label">BEACON</span></div>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`rail-item ${active === n.id ? 'active' : ''}`}
            onClick={() => { onNavigate(n.id); setOpen(false); }}
            title={n.label}
          >
            <span className="ri-icon">{n.icon}</span>
            <span className="ri-label">{n.label}</span>
          </button>
        ))}
      </nav>
      <main className="shell-main">{children}</main>
    </div>
  );
}
