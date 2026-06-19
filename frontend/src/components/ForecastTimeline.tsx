import type { GlofasForecast } from '../services/beacon';

interface Props {
  forecast: GlofasForecast;
  dayIndex: number;
  playing: boolean;
  level: number;
  onDay: (i: number) => void;
  onPlayToggle: () => void;
}

const Q_DANGER = 70000; // discharge (m³/s) ~ FFWC danger level (indicative)

export default function ForecastTimeline({ forecast, dayIndex, playing, level, onDay, onPlayToggle }: Props) {
  const s = forecast.series;
  const i0 = forecast.iNow;
  const W = 1000, H = 90, padX = 8, padT = 8, padB = 4;
  const qs = s.flatMap((d) => [d.q, d.p25, d.p75]);
  const qMax = Math.max(Q_DANGER * 1.15, ...qs);
  const x = (i: number) => padX + (i / (s.length - 1)) * (W - 2 * padX);
  const y = (q: number) => padT + (1 - q / qMax) * (H - padT - padB);
  const band = s.map((d, i) => `${x(i)},${y(d.p75)}`).concat(
    s.map((_, i) => `${x(s.length - 1 - i)},${y(s[s.length - 1 - i].p25)}`)).join(' ');
  const line = s.map((d, i) => `${x(i)},${y(d.q)}`).join(' ');

  const cur = s[dayIndex];
  const curDate = new Date(cur.date + 'T00:00:00');
  const fromNow = dayIndex - i0;
  const dLabel = fromNow <= 0 ? 'today' : `+${fromNow} day${fromNow > 1 ? 's' : ''}`;

  return (
    <div className="forecast-timeline">
      <button className="play-btn" onClick={onPlayToggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="ft-body">
        <div className="ft-head">
          <span className="ft-live">● LIVE · GloFAS v4</span>
          <span className="ft-readout">
            <b>{dLabel}</b> · {curDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ·
            discharge <b>{(cur.q / 1000).toFixed(0)}k</b> m³/s · est. level <b>{level.toFixed(1)} m</b>
          </span>
        </div>
        <svg className="ft-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          onClick={(e) => {
            const r = (e.currentTarget as SVGElement).getBoundingClientRect();
            const fx = (e.clientX - r.left) / r.width;
            const i = Math.round(padX / W + fx * (1 - 2 * padX / W) * (s.length - 1));
            onDay(Math.max(i0, Math.min(s.length - 1, i)));
          }}>
          <polygon points={band} fill="rgba(111,208,255,0.18)" />
          <line x1={padX} x2={W - padX} y1={y(Q_DANGER)} y2={y(Q_DANGER)} stroke="#ff5a52" strokeWidth={1} strokeDasharray="4 3" />
          <polyline points={line} fill="none" stroke="#6fd0ff" strokeWidth={2} />
          <line x1={x(i0)} x2={x(i0)} y1={padT} y2={H - padB} stroke="#ffd166" strokeWidth={1} opacity={0.6} />
          <line x1={x(dayIndex)} x2={x(dayIndex)} y1={padT} y2={H - padB} stroke="#fff" strokeWidth={1.5} />
          <circle cx={x(dayIndex)} cy={y(cur.q)} r={4} fill="#fff" />
        </svg>
        <div className="ft-foot">
          <span>today</span>
          <span className="ft-danger">— — danger level</span>
          <span>peak {(forecast.peak.q / 1000).toFixed(0)}k · {new Date(forecast.peak.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    </div>
  );
}
