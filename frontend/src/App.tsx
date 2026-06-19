import { useEffect, useMemo, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import BeaconMap from './components/BeaconMap';
import ForecastTimeline from './components/ForecastTimeline';
import ImpactPanel from './components/ImpactPanel';
import RankPanel from './components/RankPanel';
import EvidencePopup from './components/EvidencePopup';
import OpsHeader from './components/OpsHeader';
import LiveFeeds from './components/LiveFeeds';
import { beacon, nearestLevel, type GlofasForecast } from './services/beacon';
import { rankZones } from './utils/rank';
import { haversine } from './utils/geo';
import { levelFromDischarge, triggerStage } from './scenarios';
import type { Impact, Selection, UnicefStat, Weights } from './types';
import './styles/globals.css';

export default function App() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [unicef, setUnicef] = useState<UnicefStat | null>(null);
  const [zones, setZones] = useState<FeatureCollection | null>(null);
  const [facilities, setFacilities] = useState<FeatureCollection | null>(null);
  const [buildings, setBuildings] = useState<FeatureCollection | null>(null);
  const [forecast, setForecast] = useState<GlofasForecast | null>(null);
  const [inundation, setInundation] = useState<Feature | null>(null);
  const [observed, setObserved] = useState<Feature | null>(null);
  const [observedMeta, setObservedMeta] = useState<{ date: string; source: string; note: string } | null>(null);
  const [showObserved, setShowObserved] = useState(false);
  const [ffwc, setFfwc] = useState<any>(null);
  const [gdacs, setGdacs] = useState<any>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [weights, setWeights] = useState<Weights>({ children: 0.45, flood: 0.35, access: 0.2 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([beacon.impact(), beacon.unicef(), beacon.zones(), beacon.facilities(), beacon.buildings()])
      .then(([im, un, zo, fa, bu]) => { setImpact(im); setUnicef(un); setZones(zo); setFacilities(fa); setBuildings(bu); })
      .catch((e) => setError(String(e)));
    beacon.glofas().then((f) => {
      setForecast(f);
      if (!f.error && f.series?.length) {
        const pk = f.series.findIndex((d) => d.date === f.peak.date);
        setDayIndex(pk >= 0 ? pk : f.iNow); // open on the forecast peak
      }
    }).catch((e) => setError(String(e)));
    beacon.ffwc().then(setFfwc).catch(() => {});
    beacon.gdacs().then(setGdacs).catch(() => {});
    beacon.observed().then(setObserved).catch(() => {});
    beacon.observedMeta().then(setObservedMeta).catch(() => {});
  }, []);

  // forecast discharge -> water level (indicative rating)
  const level = useMemo(() => {
    if (!forecast || forecast.error || !forecast.series?.length) return 13;
    return levelFromDischarge(forecast.series[dayIndex]?.q ?? forecast.current);
  }, [forecast, dayIndex]);

  useEffect(() => {
    if (!impact) return;
    const lv = nearestLevel(impact.levels, level);
    let cancelled = false;
    beacon.inundation(lv).then((f) => !cancelled && setInundation(f)).catch(() => {});
    return () => { cancelled = true; };
  }, [impact, level]);

  // play across the forecast window
  useEffect(() => {
    if (!playing || !forecast?.series?.length) return;
    const end = forecast.series.length - 1;
    const id = setInterval(() => {
      setDayIndex((i) => (i >= end ? forecast.iNow : i + 1));
    }, 500);
    return () => clearInterval(id);
  }, [playing, forecast]);

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
  const trigger = triggerStage(level);
  const forecastDate = forecast?.series?.[dayIndex]?.date ?? '';

  const onReport = async () => {
    if (!levelImpact) return;
    setGenerating(true);
    try {
      const res = await fetch(beacon.reportUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level, forecastDate, glofas: forecast ? { current: forecast.current, peak: forecast.peak, leadDays: forecast.leadDays } : null,
          total: levelImpact.total, zones: ranked.slice(0, 3), unicef, weights,
        }),
      });
      if (!res.ok) throw new Error(`report ${res.status}`);
      await download(await res.blob(), `beacon_sirajganj_${forecastDate || level}.pdf`);
    } catch (e) { setError(String(e)); } finally { setGenerating(false); }
  };

  const onExportGeoSight = async () => {
    try {
      const res = await fetch(beacon.geosightExportUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: forecastDate, zones: ranked }),
      });
      if (!res.ok) throw new Error(`export ${res.status}`);
      await download(await res.blob(), 'beacon_geosight_indicators.csv');
    } catch (e) { setError(String(e)); }
  };

  return (
    <div className="app">
      <BeaconMap buildings={buildings} zones={zones} facilities={facilities}
        inundation={inundation} observed={observed} showObserved={showObserved}
        waterAltitudeM={level} onSelect={setSelection} />

      <OpsHeader forecast={forecast} stage={trigger.stage} level={level} />

      {gdacs?.active && (
        <div className="gdacs-banner">⚠ GDACS flood alert active for Bangladesh — {gdacs.alerts[0]?.level} · {gdacs.alerts[0]?.name}</div>
      )}

      <LiveFeeds glofas={forecast} ffwc={ffwc} gdacs={gdacs} observedMeta={observedMeta}
        showObserved={showObserved} onToggleObserved={setShowObserved} />

      <div className="left-stack">
        <ImpactPanel trigger={trigger} impact={levelImpact} ranked={ranked} unicef={unicef}
          onReport={onReport} onExportGeoSight={onExportGeoSight} generating={generating} />
        <RankPanel ranked={ranked} weights={weights} onWeights={setWeights} />
      </div>

      {forecast && !forecast.error && (
        <ForecastTimeline forecast={forecast} dayIndex={dayIndex} playing={playing} level={level}
          onDay={(i) => { setPlaying(false); setDayIndex(i); }} onPlayToggle={() => setPlaying((p) => !p)} />
      )}

      {selection && (
        <EvidencePopup selection={selection} levelImpact={levelImpact} ranked={ranked} onClose={() => setSelection(null)} />
      )}

      <div className="sources-footer">
        Live forecast: GloFAS v4 (Copernicus EMS) via Open-Meteo · exposure: Copernicus 30 m DEM bathtub · WorldPop 2020 · OSM / Healthsites · Giga · FFWC danger level. Indicative screening — not hydrodynamic modelling.
      </div>
      {error && <div className="toast error">{error}</div>}
    </div>
  );
}

async function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function centroid(f: Feature): [number, number] {
  const coords: number[][] = [];
  const walk = (a: any) => { if (typeof a[0] === 'number') coords.push(a as number[]); else a.forEach(walk); };
  if (f.geometry && 'coordinates' in f.geometry) walk((f.geometry as any).coordinates);
  const n = coords.length || 1;
  return [coords.reduce((s, c) => s + c[0], 0) / n, coords.reduce((s, c) => s + c[1], 0) / n];
}
