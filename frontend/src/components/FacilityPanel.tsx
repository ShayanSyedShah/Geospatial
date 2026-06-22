import type { EvacRoute, Facility, UserLocation } from '../types';
import { compass } from '../utils/geo';
import { riskLabel } from '../utils/risk';

interface Props {
  facility: Facility;
  userLocation: UserLocation | null;
  route: EvacRoute | null;
  time: number;
  onClose: () => void;
}

const km = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const mins = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

export default function FacilityPanel({ facility, userLocation, route, onClose }: Props) {
  const isClinic = facility.type === 'clinic';
  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <div>
          <h2>{facility.name || (isClinic ? 'Health facility' : 'School')}</h2>
          <span className="hexid">{isClinic ? 'Health facility' : 'School'} · {facility.district}</span>
        </div>
        <button onClick={onClose} className="close-btn" aria-label="Close">×</button>
      </div>

      <div className="evidence-content">
        <section>
          <div className={`status-badge ${facility.at_risk ? 'risk' : 'safe'}`}>
            {facility.at_risk
              ? `⚠ In flood zone · ${riskLabel(facility.risk)} risk (${Math.round(facility.risk * 100)}%)`
              : '✓ Outside the modelled flood zone'}
          </div>
        </section>

        <section>
          <h3>Evacuation</h3>
          {!userLocation && (
            <p className="hint-text">Tap anywhere on the map to drop <b>“you are here”</b> — we’ll route you to the nearest safe health centre.</p>
          )}
          {userLocation && route && (
            <>
              <div className="metric"><span>Nearest safe clinic</span><span className="value">{route.to.name || 'Clinic'}</span></div>
              <div className="metric"><span>Distance</span><span className="value">{km(route.distanceM)}</span></div>
              <div className="metric"><span>Est. travel</span><span className="value">{mins(route.durationS)}</span></div>
              <div className="metric"><span>Head</span><span className="value">{compass(route.bearing)} ({Math.round(route.bearing)}°)</span></div>
              <p className="hint-text">{route.mode === 'road' ? 'Road route (OSRM).' : 'Direct line — road route unavailable.'}</p>
            </>
          )}
          {userLocation && !route && (
            <p className="hint-text">No safe health centre found within range.</p>
          )}
        </section>

        <section>
          <h3>How we know</h3>
          <div className="source">
            <strong>Flood hazard</strong>
            <p>GloFAS / JRC river flood + WRI Aqueduct coastal inundation (max depth).</p>
            <p>Return-period water-depth layers (rp10 / rp100 / rp500).</p>
          </div>
          <div className="source">
            <strong>Facilities</strong>
            <p>Schools: UN OCHA / Bangladesh LGED registry (via HDX).</p>
            <p>Clinics: UN OCHA / Bangladesh LGED health registry (via HDX).</p>
            <p>“In flood zone” = hazard depth sampled at this point.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
