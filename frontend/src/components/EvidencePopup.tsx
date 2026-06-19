import type { LevelImpact, RankedZone, Selection } from '../types';

interface Props {
  selection: Selection;
  levelImpact: LevelImpact | null;
  ranked: RankedZone[];
  onClose: () => void;
}

// The trust layer: every number → source · date · confidence.
export default function EvidencePopup({ selection, levelImpact, ranked, onClose }: Props) {
  const z = selection.kind === 'zone' ? ranked.find((r) => r.name === selection.name) : null;
  return (
    <div className="evidence-pop">
      <button className="ev-close" onClick={onClose}>×</button>
      <div className="ev-kind">{selection.kind === 'zone' ? 'Zone (upazila)' : selection.kind === 'clinic' ? 'Health clinic' : 'School'}</div>
      <div className="ev-name">{selection.name}</div>

      {z && (
        <div className="ev-stats">
          <div><b>{z.childrenU5.toLocaleString()}</b> children under-5 in the flood zone</div>
          <div><b>{z.schools}</b> schools · <b>{z.clinics}</b> clinics flooded</div>
          <div>Ranked <b>#{z.rank}</b> to help first</div>
        </div>
      )}
      {!z && selection.kind !== 'zone' && (
        <div className="ev-stats"><div>{selection.kind === 'clinic' ? 'Health facility' : 'School'} in Sirajganj district.</div></div>
      )}

      <div className="ev-evidence">
        <div className="ev-row"><span>Flood hazard</span><b>GloFAS/JRC + Copernicus DEM bathtub</b><em>indicative · 2024</em></div>
        <div className="ev-row"><span>Children u-5</span><b>WorldPop 100 m</b><em>±~10% · 2020</em></div>
        <div className="ev-row">
          <span>{selection.kind === 'clinic' ? 'Clinic' : selection.kind === 'school' ? 'School' : 'Boundary'}</span>
          <b>{selection.kind === 'clinic' ? 'Healthsites/OSM' : selection.kind === 'school' ? 'Giga/OSM' : 'geoBoundaries ADM3'}</b>
          <em>retrieved 2026</em>
        </div>
      </div>
      <div className="ev-foot">{levelImpact ? `Scenario: water at ${levelImpact.waterElev.toFixed(1)} m` : ''}</div>
    </div>
  );
}
