import { timeLabel, scenarioLabel } from '../utils/risk';

interface Props {
  time: number; // 0..1
  playing: boolean;
  onTime: (t: number) => void;
  onPlayToggle: () => void;
}

// keyframe ticks for the three real hazard tiers
const TICKS = [
  { f: 0, label: 'Now' },
  { f: 1 / 3, label: '+24h · rp10' },
  { f: 2 / 3, label: '+48h · rp100' },
  { f: 1, label: '+72h · rp500' },
];

export default function TimelineControl({ time, playing, onTime, onPlayToggle }: Props) {
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
        <input
          className="time-slider"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={time}
          onChange={(e) => onTime(parseFloat(e.target.value))}
        />
        <div className="timeline-ticks">
          {TICKS.map((t) => (
            <span key={t.f} style={{ left: `${t.f * 100}%` }} className="tick">
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
