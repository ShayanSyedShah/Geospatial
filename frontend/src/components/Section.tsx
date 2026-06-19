import { useState, type ReactNode } from 'react';

interface Props {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}

/** Collapsible accordion section for the dashboard left rail. */
export default function Section({ title, icon, defaultOpen = true, badge, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`dash-section ${open ? 'open' : ''}`}>
      <button className="dash-section-head" onClick={() => setOpen((o) => !o)}>
        {icon && <span className="ds-icon">{icon}</span>}
        <span className="ds-title">{title}</span>
        {badge != null && <span className="ds-badge">{badge}</span>}
        <span className="ds-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="dash-section-body">{children}</div>}
    </div>
  );
}
