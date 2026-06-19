import type { GlofasForecast } from '../services/beacon';
import { DANGER_LEVEL, type TriggerStage } from '../scenarios';

interface Props {
  forecast: GlofasForecast | null;
  stage: TriggerStage;
  level: number;
}

export default function OpsHeader({ forecast, stage, level }: Props) {
  return (
    <header className="ops-header">
      <div className="ops-brand">
        <span className="ops-dot" />
        <b>BEACON</b>
      </div>
      <div className="ops-meta">
        <span>📍 Sirajganj · Jamuna River</span>
        <span className="sep">|</span>
        {forecast && !forecast.error ? (
          <span className={`gauge ${stage}`}>
            <span className="live-dot">●</span> Live GloFAS: <b>{(forecast.current / 1000).toFixed(0)}k m³/s</b>
            {forecast.trend === 'rising' && <em> ▲ rising</em>} · peak <b>{(forecast.peak.q / 1000).toFixed(0)}k</b> in {forecast.leadDays}d
            <span className="sep">·</span> est. level <b>{level.toFixed(1)} m</b> <em>(danger {DANGER_LEVEL} m)</em>
          </span>
        ) : (
          <span>Live forecast unavailable</span>
        )}
      </div>
      <div className="ops-src">{forecast?.source ?? 'GloFAS v4 · Copernicus EMS'}</div>
    </header>
  );
}
