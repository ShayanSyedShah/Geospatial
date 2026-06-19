// Real-world framing for the demo. The flood-level slider uses local DEM water
// levels (honest bathtub); each scenario pairs a level with the REAL Bahadurabad
// gauge forecast it corresponds to, so the tool reads like the operational
// picture without claiming to be the FFWC/GloFAS trigger system itself.

export interface Scenario {
  id: string;
  label: string;
  level: number;   // local DEM water-surface level (m) -> drives the bathtub
  gauge: number;   // corresponding Bahadurabad gauge reading (m, PWD datum)
  sub: string;
}

// Bahadurabad gauge: danger level 19.5 m; AA Stage-II "Action" trigger at +0.85 m.
export const GAUGE_DANGER = 19.5;
export const GAUGE_ACTION = 20.35;

export const SCENARIOS: Scenario[] = [
  { id: 'normal', label: 'Normal monsoon', level: 8.5, gauge: 18.6, sub: 'River high but within its banks' },
  { id: 'jul2024', label: '4 July 2024 flood', level: 13.0, gauge: 20.4, sub: 'Danger level crossed — the day the AA trigger fired' },
  { id: 'extreme', label: 'Extreme (1998-like)', level: 15.5, gauge: 21.3, sub: 'Catastrophic — most of the floodplain inundated' },
];

export const DEFAULT_SCENARIO = 'jul2024';

/** Map a local DEM level to an approximate Bahadurabad gauge reading (for the header). */
export function levelToGauge(level: number): number {
  // anchored to the scenario pairs; linear between normal and extreme
  const lo = SCENARIOS[0], hi = SCENARIOS[2];
  const g = lo.gauge + ((level - lo.level) / (hi.level - lo.level)) * (hi.gauge - lo.gauge);
  return Math.max(17.5, Math.min(22, g));
}

export type TriggerStage = 'monitor' | 'readiness' | 'action';

export function triggerStage(gauge: number): { stage: TriggerStage; label: string; text: string } {
  if (gauge >= GAUGE_ACTION) return {
    stage: 'action', label: 'ACT NOW',
    text: `Action trigger crossed (gauge ${gauge.toFixed(1)} m ≥ ${GAUGE_ACTION} m). Pre-position supplies — hours, not days.`,
  };
  if (gauge >= GAUGE_DANGER) return {
    stage: 'readiness', label: 'READINESS',
    text: `Above danger level (${GAUGE_DANGER} m). Ready teams and stocks; watch the 5-day forecast.`,
  };
  return { stage: 'monitor', label: 'MONITOR', text: 'Below danger level. Routine monitoring.' };
}
