import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import BeaconMap from './components/BeaconMap';
import FloodSlider from './components/FloodSlider';
import ImpactPanel from './components/ImpactPanel';
import RankPanel from './components/RankPanel';
import EvidencePopup from './components/EvidencePopup';
import OpsHeader from './components/OpsHeader';
import ScenarioCard from './components/ScenarioCard';
import HumanAnchor from './components/HumanAnchor';
import { beacon, nearestLevel } from './services/beacon';
import { rankZones } from './utils/rank';
import { haversine } from './utils/geo';
import { SCENARIOS, DEFAULT_SCENARIO, levelToGauge, triggerStage } from './scenarios';
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
  const [scenarioId, setScenarioId] = useState<string>(DEFAULT_SCENARIO);
  const [showCard, setShowCard] = useState(true);
  const [weights, setWeights] = useState<Weights>({ children: 0.45, flood: 0.35, access: 0.2 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([beacon.impact(), beacon.unicef(), beacon.zones(), beacon.facilities(), beacon.buildings()])
      .then(([im, un, zo, fa, bu]) => {
        setImpact(im); setUnicef(un); setZones(zo); setFacilities(fa); setBuildings(bu);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!impact) return;
    const lv = nearestLevel(impact.levels, level);
    let cancelled = false;
    beacon.inundation(lv).then((f) => !cancelled && setInundation(f)).catch(() => {});
    return () => { cancelled = true; };
  }, [impact, level]);

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

  const levelImpact = useMemo(
    () => (impact ? impact.byLevel[nearestLevel(impact.levels, level).toFixed(1)] ?? null : null),
    [impact, level],
  );
  const ranked = useMemo(
    () => (levelImpact ? rankZones(levelImpact.zones, nearestClinicKm, weights) : []),
    [levelImpact, nearestClinicKm, weights],
  );

  const activeScenario = SCENARIOS.find((s) => s.id === scenarioId);
  const gauge = activeScenario ? activeScenario.gauge : levelToGauge(level);
  const trigger = triggerStage(gauge);

  const pickScenario = (id: string) => {
    const s = SCENARIOS.find((x) => x.id === id);
    if (s) { setScenarioId(id); setLevel(s.level); }
  };
  const onSlide = (v: number) => { setLevel(v); setScenarioId('custom'); };

  const onReport = async () => {
    if (!levelImpact) return;
    setGenerating(true);
    try {
      const res = await fetch(beacon.reportUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level, gauge: Number(gauge.toFixed(1)), waterElev: levelImpact.waterElev,
          total: levelImpact.total, zones: ranked.slice(0, 3), unicef, weights,
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

      <OpsHeader scenarioId={scenarioId} gauge={gauge} stage={trigger.stage} onScenario={pickScenario} />

      <div className="left-stack">
        <ImpactPanel trigger={trigger} impact={levelImpact} ranked={ranked}
          unicef={unicef} onReport={onReport} generating={generating} />
        <RankPanel ranked={ranked} weights={weights} onWeights={setWeights} />
      </div>

      <HumanAnchor />

      {impact && (
        <FloodSlider value={level} min={impact.levels[0]} max={impact.levels[impact.levels.length - 1]}
          normal={impact.normal} danger={impact.danger} gauge={gauge} onChange={onSlide} />
      )}

      {selection && (
        <EvidencePopup selection={selection} levelImpact={levelImpact} ranked={ranked}
          onClose={() => setSelection(null)} />
      )}

      <div className="sources-footer">
        Forecast logic: FFWC danger level + GloFAS trend (OCHA Anticipatory Action Framework). Exposure:
        Copernicus 30 m DEM bathtub · WorldPop 2020 · OSM / Healthsites · Giga · geoBoundaries. For prioritisation, not hydrodynamic modelling.
      </div>

      {showCard && <ScenarioCard onStart={() => { pickScenario('jul2024'); setShowCard(false); }} />}
      {error && <div className="toast error">{error}</div>}
    </div>
  );
}

function centroid(f: Feature): [number, number] {
  const coords: number[][] = [];
  const walk = (a: any) => { if (typeof a[0] === 'number') coords.push(a as number[]); else a.forEach(walk); };
  if (f.geometry && 'coordinates' in f.geometry) walk((f.geometry as any).coordinates);
  const n = coords.length || 1;
  return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
}
