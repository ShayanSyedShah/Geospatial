interface Props {
  /** the hotspot to load (filename in /public, e.g. "waterlab.html") */
  src?: string;
  /** label shown in the header */
  place?: string;
  onClose: () => void;
}

/**
 * Full-screen "physics view" — the high-detail, real shallow-water flood
 * simulation for a single hotspot (Sirajganj). It hosts the standalone Three.js
 * Water Lab (frontend/public/waterlab.html) in an iframe so the working
 * simulation is reused as-is, framed with BEACON app chrome.
 *
 * The national BEACON map stays the command view; this is "zoom into the flood
 * zone." More hotspots (Kurigram, Sylhet, …) become additional src files later.
 */
export default function PhysicsView({ src = '/waterlab.html', place = 'Sirajganj', onClose }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: '#070d16',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        height: 46, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px',
        background: 'linear-gradient(180deg,rgba(7,13,22,.96),rgba(7,13,22,.5))',
        borderBottom: '1px solid #243650',
      }}>
        <strong style={{ letterSpacing: 1, fontWeight: 800 }}>
          BE<span style={{ color: '#3b82f6' }}>A</span>CON
        </strong>
        <span style={{ color: '#9fb1c9', fontSize: 13 }}>
          Physics View · {place} flood zone · real shallow-water simulation
        </span>
        <button onClick={onClose} style={{
          marginLeft: 'auto', background: '#1f6feb', color: '#fff', border: 'none',
          padding: '8px 16px', borderRadius: 9, fontWeight: 700, cursor: 'pointer',
        }}>← Back to map</button>
      </div>
      <iframe
        src={src}
        title={`${place} Water Lab`}
        style={{ flex: 1, border: 'none', width: '100%' }}
      />
    </div>
  );
}
