import { useEffect, useState } from 'react';

// Startup splash: a lighthouse whose beam sweeps a dark "coast" like radar,
// lighting up settlements as it passes. Auto-dismisses after the sweep.
const PERIOD = 2.4; // seconds per full rotation (matches the CSS sweep)

// settlements scattered around the scope; delay syncs each to the passing beam
const DOTS = Array.from({ length: 11 }, (_, i) => {
  const angle = (i * 360) / 11 + (i % 3) * 9;          // spread around the circle
  const r = 20 + ((i * 37) % 24);                       // 20–44% radius
  const rad = (angle * Math.PI) / 180;
  return {
    x: 50 + r * Math.sin(rad),
    y: 50 - r * Math.cos(rad),
    delay: (angle / 360) * PERIOD - 0.1 * PERIOD,        // twinkle as the beam arrives
    big: i % 4 === 0,
  };
});

export default function LoadingScreen() {
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 2900);     // start fade
    const t2 = setTimeout(() => setGone(true), 3700);    // unmount
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  if (gone) return null;

  return (
    <div className={`lh-splash ${out ? 'lh-out' : ''}`} aria-hidden="true">
      <div className="lh-scope">
        <div className="lh-rings" />
        <div className="lh-sweep" />
        {DOTS.map((d, i) => (
          <span
            key={i}
            className={`lh-dot ${d.big ? 'big' : ''}`}
            style={{ left: `${d.x}%`, top: `${d.y}%`, animationDelay: `${d.delay}s` }}
          />
        ))}
        <svg className="lh-tower" viewBox="0 0 40 64" fill="none" aria-hidden="true">
          {/* lantern glow */}
          <circle cx="20" cy="12" r="9" fill="#ffd75a" opacity="0.18" />
          {/* lantern room */}
          <rect x="15" y="8" width="10" height="8" rx="1.5" fill="#ffe07a" />
          <path d="M13 8 L20 2 L27 8 Z" fill="#e8edf3" />
          {/* tower body with bands */}
          <path d="M14 16 L26 16 L29 60 L11 60 Z" fill="#eef3f8" />
          <path d="M14.6 24 L25.4 24 L26 32 L14 32 Z" fill="#e0463b" />
          <path d="M14.9 40 L25.1 40 L25.7 48 L14.3 48 Z" fill="#e0463b" />
          <rect x="9" y="60" width="22" height="3.5" rx="1.2" fill="#c7d2de" />
        </svg>
      </div>
      <div className="lh-word">LIGHT<span>HOUSE</span></div>
      <div className="lh-tag">scanning the coast for who needs help first</div>
    </div>
  );
}
