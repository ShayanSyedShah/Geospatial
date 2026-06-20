import { useEffect, useMemo, useState } from 'react';
import Globe, { type CameraFocus } from './Globe';
import FacilityPanel from './FacilityPanel';
import EvidencePanel from './EvidencePanel';
import type { FloodOverlaySettings } from './FloodOverlayControls';
import SidePanel from './SidePanel';
import TopBar from './TopBar';
import ConnectorModal from './ConnectorModal';
import PlanModal from './PlanModal';
import { api, STATIC_FLOOD_META } from '../services/api';
import { haversine, nearestSafeClinic } from '../utils/geo';
import { isFloodedAtTime, riskAtTime } from '../utils/risk';
import { routeTo } from '../utils/routing';
import type { Country, EvacRoute, Facility, Hexagon, Region, UserLocation } from '../types';

const NEARBY_M = 20000;
// flood depth (m) mapped from the timeline fraction, for headline context
const MAX_DEPTH_M = 3;

export default function FloodModule() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState('Bangladesh');
  const [hexagons, setHexagons] = useState<Hexagon[]>([]);
  const [allFacilities, setAllFacilities] = useState<Facility[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [floodBounds, setFloodBounds] = useState<[number, number, number, number] | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [route, setRoute] = useState<EvacRoute | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedHex, setSelectedHex] = useState<Hexagon | null>(null);
  const [overlay, setOverlay] = useState<FloodOverlaySettings>({
    showRiverExtent: false,
    showFloodCells: false,
    showPopulation: false,
    showHumanTerrain: true,
  });
  const [focus, setFocus] = useState<CameraFocus | null>(null);
  const [time] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showConnector, setShowConnector] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

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
    setDistrict(null); setUserLocation(null); setRoute(null);
    setSelectedFacility(null); setSelectedHex(null);
    setAllFacilities([]);
    Promise.allSettled([api.hexagons(country), api.regions(country), api.floodMeta(country), api.countries()])
      .then(([hxRes, rgRes, metaRes, csRes]) => {
        if (cancelled) return;
        const hx = hxRes.status === 'fulfilled' ? hxRes.value : { hexagons: [] };
        const rg = rgRes.status === 'fulfilled' ? rgRes.value : [];
        const meta = metaRes.status === 'fulfilled' ? metaRes.value : STATIC_FLOOD_META[country];
        const cs = csRes.status === 'fulfilled' ? csRes.value : countries;
        setHexagons(hx.hexagons);
        setRegions(rg);
        setFloodBounds(meta.bounds);
        const c = cs.find((x) => x.name === country);
        if (c) setFocus({ lng: c.center[0], lat: c.center[1], zoom: c.zoom });
        if ([hxRes, rgRes, metaRes].some((r) => r.status === 'rejected')) {
          setError('Some live layers are unavailable; showing cached Bangladesh flood data');
        }
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => { cancelled = true; };
  }, [country]);

  useEffect(() => {
    let cancelled = false;
    const needsFacilities = Boolean(district || userLocation);
    if (!needsFacilities) {
      setAllFacilities([]);
      return () => { cancelled = true; };
    }
    api.facilities(country, district)
      .then((fc) => { if (!cancelled) setAllFacilities(fc.facilities); })
      .catch((e) => {
        if (!cancelled) {
          setAllFacilities([]);
          setError(`Facilities unavailable: ${String(e)}`);
        }
      });
    return () => { cancelled = true; };
  }, [country, district, userLocation]);

  useEffect(() => {
    if (!userLocation || !allFacilities.length) { setRoute(null); return; }
    const clinic = nearestSafeClinic(userLocation, allFacilities);
    if (!clinic) { setRoute(null); return; }
    let cancelled = false;
    routeTo(userLocation, clinic).then((r) => { if (!cancelled) setRoute(r); });
    return () => { cancelled = true; };
  }, [userLocation, allFacilities]);

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

  const floodedCount = useMemo(
    () => hexagons.filter((h) => isFloodedAtTime(h, time)).length,
    [hexagons, time],
  );

  const depthM = useMemo(() => +(time * MAX_DEPTH_M).toFixed(1), [time]);

  const setLocation = (lng: number, lat: number, label?: string) => {
    setUserLocation({ lat, lng, label });
    setSelectedFacility(null); setSelectedHex(null);
    setFocus({ lng, lat, zoom: 11 });
  };

  const selectDistrict = (d: string | null) => {
    setDistrict(d);
    setSelectedFacility(null); setSelectedHex(null);
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
        hexagons={hexagons}
        floodBounds={floodBounds}
        overlay={overlay}
        facilities={displayedFacilities}
        userLocation={userLocation}
        route={route}
        selectedHex={selectedHex}
        onSelectHex={setSelectedHex}
        onSelectFacility={(f) => { setSelectedFacility(f); setSelectedHex(null); }}
        onMapClick={(lng, lat) => setLocation(lng, lat)}
        time={time}
        focus={focus}
      />

      <TopBar
        countries={countries}
        country={country}
        onCountryChange={setCountry}
        regions={regions}
        district={district}
        onDistrictChange={selectDistrict}
        onConnect={() => setShowConnector(true)}
        onMakePlan={() => setShowPlan(true)}
      />

      <SidePanel
        country={country}
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
        overlay={overlay}
        onOverlayChange={setOverlay}
        floodedCount={floodedCount}
      />

      {error && <div className="toast error">Backend unavailable — {error}</div>}

      {selectedHex && (
        <EvidencePanel hexagon={selectedHex} time={time} onClose={() => setSelectedHex(null)} />
      )}

      {selectedFacility && (
        <FacilityPanel facility={selectedFacility} userLocation={userLocation} route={route} time={time} onClose={() => setSelectedFacility(null)} />
      )}

      {showConnector && <ConnectorModal country={country} onClose={() => setShowConnector(false)} />}
      {showPlan && <PlanModal country={country} district={district} intensity={time} depthM={depthM} onClose={() => setShowPlan(false)} />}
    </div>
  );
}
