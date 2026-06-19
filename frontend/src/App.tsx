import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import BeaconMap from './components/BeaconMap';
import FloodSlider from './components/FloodSlider';
import ImpactPanel from './components/ImpactPanel';
import RankPanel from './components/RankPanel';
import EvidencePopup from './components/EvidencePopup';
import { beacon, nearestLevel } from './services/beacon';
import { rankZones } from './utils/rank';
import { haversine } from './utils/geo';
import type { Impact, Selection, UnicefStat, Weights } from './types';
import './styles/globals.css';

export default function App() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [unicef, setUnicef] = useState<UnicefStat | null>(null);
  const [zones, setZones] = useState<FeatureCollection | null>(null);
  const [facilities, setFacilities] = useState<FeatureCollection | null>(null);
  const [buildings, setBuildings] = useState<FeatureCollection | null>(null);
  const [inundation, setInundation] = useState<Feature | null>(null);
  const [level, setLevel] = useState(13);
  const [weights, setWeights] = useState<Weights>({ children: 0.45, flood: 0.35, access: 0.2 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([beacon.impact(), beacon.unicef(), beacon.zones(), beacon.facilities(), beacon.buildings()])
      .then(([im, un, zo, fa, bu]) => {
        setImpact(im); setUnicef(un); setZones(zo); setFacilities(fa); setBuildings(bu);
        setLevel(im.danger);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // load the flood polygon for the snapped level
  useEffect(() => {
    if (!impact) return;
    const lv = nearestLevel(impact.levels, level);
    let cancelled = false;
    beacon.inundation(lv).then((f) => !cancelled && setInundation(f)).catch(() => {});
    return () => { cancelled = true; };
  }, [impact, level]);

  // nearest-clinic distance per zone (for the ranking access factor)
  const nearestClinicKm = useMemo(() => {
    const out: Record<string, number> = {};
    if (!zones || !facilities) return out;
    const clinics = facilities.features.filter((f) => (f.properties as any)?.type === 'clinic');
    for (const z of zones.features) {
      const c = centroid(z);
      let best = Infinity;
      for (const cl of clinics) {
        const g = cl.geometry;
        if (g.type !== 'Point') continue;
        best = Math.min(best, haversine(c[1], c[0], g.coordinates[1], g.coordinates[0]));
      }
      out[String((z.properties as any)?.name ?? '')] = Number.isFinite(best) ? best / 1000 : 0;
    }
    return out;
  }, [zones, facilities]);

  const levelImpact = useMemo(() => {
    if (!impact) return null;
    return impact.byLevel[nearestLevel(impact.levels, level).toFixed(1)] ?? null;
  }, [impact, level]);

  const ranked = useMemo(
    () => (levelImpact ? rankZones(levelImpact.zones, nearestClinicKm, weights) : []),
    [levelImpact, nearestClinicKm, weights],
  );

  const onReport = async () => {
    if (!levelImpact) return;
    setGenerating(true);
    try {
      const res = await fetch(beacon.reportUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level, waterElev: levelImpact.waterElev, total: levelImpact.total,
          zones: ranked.slice(0, 3), unicef, weights,
        }),
      });
      if (!res.ok) throw new Error(`report ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `beacon_sirajganj_${level}m.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(String(e)); }
    finally { setGenerating(false); }
  };

  return (
    <div className="app">
      <BeaconMap
        buildings={buildings} zones={zones} facilities={facilities}
        inundation={inundation} waterAltitudeM={level} onSelect={setSelection}
      />

      <header className="brandbar">
        <div className="brand-dot" />
        <div>
          <h1>BEACON</h1>
          <p>Sirajganj · who to protect first when the water rises</p>
        </div>
      </header>

      <div className="left-stack">
        <ImpactPanel level={level} danger={impact?.danger ?? 13} impact={levelImpact}
          unicef={unicef} onReport={onReport} generating={generating} />
        <RankPanel ranked={ranked} weights={weights} onWeights={setWeights} />
      </div>

      {impact && (
        <FloodSlider value={level} min={impact.levels[0]} max={impact.levels[impact.levels.length - 1]}
          normal={impact.normal} danger={impact.danger} onChange={setLevel} />
      )}

      {selection && (
        <EvidencePopup selection={selection} levelImpact={levelImpact} ranked={ranked}
          onClose={() => setSelection(null)} />
      )}

      {error && <div className="toast error">{error}</div>}
    </div>
  );
}

function centroid(f: Feature): [number, number] {
  const coords: number[][] = [];
  const walk = (a: any) => {
    if (typeof a[0] === 'number') coords.push(a as number[]);
    else a.forEach(walk);
  };
  if (f.geometry && 'coordinates' in f.geometry) walk((f.geometry as any).coordinates);
  const n = coords.length || 1;
  return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
}
