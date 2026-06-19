import { useState, type ReactNode } from 'react';

export type ModuleId = 'overview' | 'flood' | 'supply' | 'complaints' | 'education';

const NAV: { id: ModuleId; icon: string; label: string }[] = [
  { id: 'overview', icon: '⊞', label: 'Overview' },
  { id: 'flood', icon: '🌊', label: 'Flood' },
  { id: 'supply', icon: '📦', label: 'Supply chain' },
  { id: 'complaints', icon: '📣', label: 'Complaints' },
  { id: 'education', icon: '🎓', label: 'Education' },
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
        <div className="rail-brand"><span className="rail-mark">◈</span><span className="ri-label">BEACON</span></div>
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
