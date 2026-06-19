import type { CSSProperties } from 'react';
import { timeLabel, scenarioLabel, TIMELINE_TICKS } from '../utils/risk';

interface Props {
  time: number; // 0..1
  playing: boolean;
  onTime: (t: number) => void;
  onPlayToggle: () => void;
}

export default function TimelineControl({ time, playing, onTime, onPlayToggle }: Props) {
  const pct = `${time * 100}%`;

  return (
    <div className="timeline">
      <button className="play-btn" onClick={onPlayToggle} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="timeline-body">
        <div className="timeline-head">
          <span className="time-now">{timeLabel(time)}</span>
          <span className="time-scenario">{scenarioLabel(time)}</span>
        </div>
        <div className="timeline-track">
          <div className="timeline-fill" style={{ width: pct }} aria-hidden />
          <div className="timeline-phase-marks" aria-hidden>
            {TIMELINE_TICKS.map((t) => (
              <span key={t.f} className="phase-mark" style={{ left: `${t.f * 100}%` }} />
            ))}
          </div>
          <input
            className="time-slider"
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={time}
            onChange={(e) => onTime(parseFloat(e.target.value))}
            style={{ '--time-pct': pct } as CSSProperties}
          />
        </div>
        <div className="timeline-ticks">
          {TIMELINE_TICKS.map((t) => (
            <span key={t.f} style={{ left: `${t.f * 100}%` }} className="tick">
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
