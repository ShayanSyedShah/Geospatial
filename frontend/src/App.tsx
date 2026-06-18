import { useEffect, useMemo, useState } from 'react';
import Globe, { type CameraFocus } from './components/Globe';
import FacilityPanel from './components/FacilityPanel';
import SidePanel from './components/SidePanel';
import TimelineControl from './components/TimelineControl';
import Legend from './components/Legend';
import { api } from './services/api';
import { haversine, nearestSafeClinic } from './utils/geo';
import { riskAtTime } from './utils/risk';
import { routeTo } from './utils/routing';
import type { Country, EvacRoute, Facility, Hexagon, Region, UserLocation } from './types';
import './styles/globals.css';

const PLAY_SECONDS = 8;
const NEARBY_M = 20000;

export default function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState('Bangladesh');
  const [hexagons, setHexagons] = useState<Hexagon[]>([]); // backend-only data, used for live stats
  const [allFacilities, setAllFacilities] = useState<Facility[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [floodBounds, setFloodBounds] = useState<[number, number, number, number] | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [route, setRoute] = useState<EvacRoute | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [focus, setFocus] = useState<CameraFocus | null>(null);
  const [time, setTime] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    api.countries().then((cs) => {
      setCountries(cs);
      const def = cs.find((c) => c.default) ?? cs[0];
      if (def) setCountry(def.name);
    }).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setDistrict(null); setUserLocation(null); setRoute(null); setSelectedFacility(null);
    Promise.all([api.hexagons(country), api.regions(country), api.facilities(country),
                 api.floodMeta(country), api.countries()])
      .then(([hx, rg, fc, meta, cs]) => {
        if (cancelled) return;
        setHexagons(hx.hexagons);
        setRegions(rg);
        setAllFacilities(fc.facilities);
        setFloodBounds(meta.bounds);
        const c = cs.find((x) => x.name === country);
        if (c) setFocus({ lng: c.center[0], lat: c.center[1], zoom: c.zoom });
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => { cancelled = true; };
  }, [country]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setTime((t) => (t + dt / PLAY_SECONDS >= 1 ? 0 : t + dt / PLAY_SECONDS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (!userLocation || !allFacilities.length) { setRoute(null); return; }
    const clinic = nearestSafeClinic(userLocation, allFacilities);
    if (!clinic) { setRoute(null); return; }
    let cancelled = false;
    routeTo(userLocation, clinic).then((r) => { if (!cancelled) setRoute(r); });
    return () => { cancelled = true; };
  }, [userLocation, allFacilities]);

  // live numbers: recomputed instantly as you scrub the timeline or pick a district
  const live = useMemo(() => {
    const hx = district ? hexagons.filter((h) => h.district === district) : hexagons;
    let exposed = 0, high = 0, cells = 0;
    for (const h of hx) {
      const r = riskAtTime(h, time);
      if (r > 0.05) { cells++; exposed += h.population_u5; }
      if (r > 0.6) high++;
    }
    return { exposed, high, cells };
  }, [hexagons, district, time]);

  const displayedFacilities = useMemo(() => {
    if (userLocation) return allFacilities.filter((f) => haversine(userLocation.lat, userLocation.lng, f.lat, f.lng) < NEARBY_M);
    if (district) return allFacilities.filter((f) => f.district === district);
    return [];
  }, [allFacilities, district, userLocation]);

  const setLocation = (lng: number, lat: number, label?: string) => {
    setUserLocation({ lat, lng, label });
    setSelectedFacility(null);
    setFocus({ lng, lat, zoom: 11 });
  };

  const selectDistrict = (d: string | null) => {
    setDistrict(d);
    setSelectedFacility(null);
    if (d) {
      const r = regions.find((x) => x.district === d);
      if (r) setFocus({ lng: r.lng, lat: r.lat, zoom: 8.6 });
    } else {
      const c = countries.find((x) => x.name === country);
      if (c) setFocus({ lng: c.center[0], lat: c.center[1], zoom: c.zoom });
    }
  };

  return (
    <div className={`app ${isMobile ? 'mobile' : 'desktop'}`}>
      <Globe
        country={country}
        floodBounds={floodBounds}
        facilities={displayedFacilities}
        userLocation={userLocation}
        route={route}
        onSelectFacility={setSelectedFacility}
        onMapClick={(lng, lat) => setLocation(lng, lat)}
        time={time}
        focus={focus}
      />

      <SidePanel
        countries={countries}
        country={country}
        onCountryChange={setCountry}
        live={live}
        time={time}
        scope={district}
        regions={regions}
        selectedDistrict={district}
        onSelectDistrict={selectDistrict}
        userLocation={userLocation}
        onPreset={(lng, lat, label) => setLocation(lng, lat, label)}
        onClearLocation={() => { setUserLocation(null); setRoute(null); }}
        route={route}
      />

      <Legend />

      <TimelineControl
        time={time}
        playing={playing}
        onTime={(t) => { setPlaying(false); setTime(t); }}
        onPlayToggle={() => setPlaying((p) => !p)}
      />

      {error && <div className="toast error">Backend unavailable — {error}</div>}

      {selectedFacility && (
        <FacilityPanel
          facility={selectedFacility}
          userLocation={userLocation}
          route={route}
          time={time}
          onClose={() => setSelectedFacility(null)}
        />
      )}
    </div>
  );
}
