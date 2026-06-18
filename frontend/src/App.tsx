import { useEffect, useState } from 'react';
import Globe from './components/Globe';
import EvidencePanel from './components/EvidencePanel';
import ControlPanel from './components/ControlPanel';
import Legend from './components/Legend';
import { api } from './services/api';
import type { Hexagon, Stats, TimeHorizon } from './types';
import './styles/globals.css';

export default function App() {
  const [country] = useState('Uganda');
  const [timeHorizon, setTimeHorizon] = useState<TimeHorizon>('4h');
  const [hexagons, setHexagons] = useState<Hexagon[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Hexagon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.hexagons(country, timeHorizon), api.stats(country)])
      .then(([hx, st]) => {
        if (cancelled) return;
        setHexagons(hx.hexagons);
        setStats(st);
        // keep selection in sync with the new horizon's risk values
        setSelected((prev) => (prev ? hx.hexagons.find((h) => h.h3_id === prev.h3_id) ?? null : null));
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [country, timeHorizon]);

  return (
    <div className={`app ${isMobile ? 'mobile' : 'desktop'}`}>
      <Globe hexagons={hexagons} selectedHexagon={selected} onSelectHexagon={setSelected} />

      <header className="app-title">
        <h1>Flood Risk Map</h1>
        <p>{country} · evidence-backed flood forecasts</p>
      </header>

      <ControlPanel
        country={country}
        timeHorizon={timeHorizon}
        onTimeHorizonChange={setTimeHorizon}
        stats={stats}
        compact={isMobile}
      />

      <Legend />

      {loading && <div className="toast">Loading flood forecasts…</div>}
      {error && <div className="toast error">Backend unavailable — {error}</div>}
      {!loading && !error && !selected && (
        <div className="hint">Tap a hexagon to see its evidence chain</div>
      )}

      {selected && (
        <EvidencePanel hexagon={selected} timeHorizon={timeHorizon} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
