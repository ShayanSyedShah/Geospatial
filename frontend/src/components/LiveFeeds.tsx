import type { GlofasForecast } from '../services/beacon';

interface FFWC { stations: { name: string; danger: number }[]; source: string; }
interface GDACS { active: boolean; alerts: { level: string; name: string }[]; }

interface Props {
  glofas: GlofasForecast | null;
  ffwc: FFWC | null;
  gdacs: GDACS | null;
  observedMeta: { date: string } | null;
  showObserved: boolean;
  onToggleObserved: (v: boolean) => void;
}

export default function LiveFeeds({ glofas, ffwc, gdacs, observedMeta, showObserved, onToggleObserved }: Props) {
  return (
    <div className="live-feeds">
      <div className="lf-title">Live data sources</div>

      <div className="lf-row">
        <span className={`lf-dot ${glofas && !glofas.error ? 'on' : 'off'}`} />
        <span className="lf-name">GloFAS v4 forecast</span>
        <span className="lf-val">{glofas && !glofas.error ? `${(glofas.current / 1000).toFixed(0)}k m³/s ${glofas.trend === 'rising' ? '▲' : ''}` : '—'}</span>
      </div>

      <div className="lf-row">
        <span className={`lf-dot ${ffwc ? 'on' : 'off'}`} />
        <span className="lf-name">FFWC danger level</span>
        <span className="lf-val">{ffwc ? `${ffwc.stations[0].danger} m` : '—'}</span>
      </div>

      <label className="lf-row lf-toggle">
        <span className={`lf-dot ${observedMeta ? 'on' : 'off'}`} />
        <span className="lf-name">GFM observed flood</span>
        {observedMeta
          ? <input type="checkbox" checked={showObserved} onChange={(e) => onToggleObserved(e.target.checked)} />
          : <span className="lf-val">—</span>}
      </label>
      {observedMeta && <div className="lf-sub">Sentinel-1 · {observedMeta.date}{showObserved ? ' · shown' : ''}</div>}

      <div className="lf-row">
        <span className={`lf-dot ${gdacs?.active ? 'alert' : 'on'}`} />
        <span className="lf-name">GDACS alert</span>
        <span className="lf-val">{gdacs ? (gdacs.active ? gdacs.alerts[0]?.level : 'none') : '—'}</span>
      </div>
    </div>
  );
}
