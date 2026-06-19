interface Props {
  value: number;
  min: number;
  max: number;
  normal: number;
  danger: number;
  onChange: (v: number) => void;
}

export default function FloodSlider({ value, min, max, normal, danger, onChange }: Props) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="flood-slider">
      <div className="fs-head">
        <span className="fs-label">Flood water level</span>
        <span className="fs-value">{value.toFixed(1)} m</span>
      </div>
      <div className="fs-track-wrap">
        <input
          type="range" min={min} max={max} step={0.5} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="fs-range"
        />
        <span className="fs-tick" style={{ left: `${pct(normal)}%` }} data-l="normal">normal</span>
        <span className="fs-tick danger" style={{ left: `${pct(danger)}%` }} data-l="danger">danger</span>
      </div>
      <div className="fs-hint">Drag to set the flood scenario — impact updates live.</div>
    </div>
  );
}
