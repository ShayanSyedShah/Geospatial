import { useEffect, useMemo, useState } from 'react';
import Globe, { type CameraFocus } from './components/Globe';
import EvidencePanel from './components/EvidencePanel';
import SidePanel from './components/SidePanel';
import TimelineControl from './components/TimelineControl';
import Legend from './components/Legend';
import { api } from './services/api';
import type { Country, Hexagon, Region, Stats } from './types';
import './styles/globals.css';

const PLAY_SECONDS = 7; // time to sweep the full forecast window

export default function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<string>('Bangladesh');
  const [allHexagons, setAllHexagons] = useState<Hexagon[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [selected, setSelected] = useState<Hexagon | null>(null);
  const [focus, setFocus] = useState<CameraFocus | null>(null);
  const [time, setTime] = useState(1); // start at peak so the map reads immediately
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // load country list once
  useEffect(() => {
    api.countries().then((cs) => {
      setCountries(cs);
      const def = cs.find((c) => c.default) ?? cs[0];
      if (def) setCountry(def.name);
    }).catch((e) => setError(String(e)));
  }, []);

  // load data when country changes
  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDistrict(null);
    setSelected(null);
    Promise.all([api.hexagons(country), api.regions(country), api.stats(country), api.countries()])
      .then(([hx, rg, st, cs]) => {
        if (cancelled) return;
        setAllHexagons(hx.hexagons);
        setRegions(rg);
        setStats(st);
        const c = cs.find((x) => x.name === country);
        if (c) setFocus({ lng: c.center[0], lat: c.center[1], zoom: c.zoom });
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => { cancelled = true; };
  }, [country]);

  // animation clock
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt / PLAY_SECONDS;
        return next >= 1 ? 0 : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const displayed = useMemo(
    () => (district ? allHexagons.filter((h) => h.district === district) : allHexagons),
    [allHexagons, district],
  );

  const selectDistrict = (d: string | null) => {
    setDistrict(d);
    setSelected(null);
    if (d) {
      const r = regions.find((x) => x.district === d);
      if (r) setFocus({ lng: r.lng, lat: r.lat, zoom: 8.3 });
    } else {
      const c = countries.find((x) => x.name === country);
      if (c) setFocus({ lng: c.center[0], lat: c.center[1], zoom: c.zoom });
    }
  };

  return (
    <div className={`app ${isMobile ? 'mobile' : 'desktop'}`}>
      <Globe
        hexagons={displayed}
        selectedHexagon={selected}
        onSelectHexagon={setSelected}
        time={time}
        focus={focus}
      />

      <SidePanel
        countries={countries}
        country={country}
        onCountryChange={setCountry}
        stats={stats}
        regions={regions}
        selectedDistrict={district}
        onSelectDistrict={selectDistrict}
      />

      <Legend />

      <TimelineControl
        time={time}
        playing={playing}
        onTime={(t) => { setPlaying(false); setTime(t); }}
        onPlayToggle={() => setPlaying((p) => !p)}
      />

      {error && <div className="toast error">Backend unavailable — {error}</div>}

      {selected && (
        <EvidencePanel hexagon={selected} time={time} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
