// BEACON model: translate the LIVE GloFAS river-discharge forecast into a water
// level, and classify the anticipatory-action stage. The water-level model uses
// an indicative stage-discharge rating anchored to the FFWC danger level — we
// don't have the official rating curve for this exact reach, so it's labeled.

export const DANGER_LEVEL = 12.9;   // FFWC Serajganj danger level (mMSL)
export const NORMAL_LEVEL = 7.5;
export const READINESS_LEVEL = DANGER_LEVEL - 2.0;

// (discharge m³/s -> local water level m) anchor points for the Jamuna reach.
const RATING: [number, number][] = [
  [25000, 7.0], [50000, 11.0], [70000, 12.9], [90000, 15.0], [110000, 16.0],
];

export function levelFromDischarge(q: number): number {
  if (q <= RATING[0][0]) return RATING[0][1];
  for (let i = 1; i < RATING.length; i++) {
    if (q <= RATING[i][0]) {
      const [q0, l0] = RATING[i - 1], [q1, l1] = RATING[i];
      return l0 + ((q - q0) / (q1 - q0)) * (l1 - l0);
    }
  }
  return RATING[RATING.length - 1][1];
}

export type TriggerStage = 'monitor' | 'readiness' | 'action';

export function triggerStage(level: number): { stage: TriggerStage; label: string; text: string } {
  if (level >= DANGER_LEVEL) return {
    stage: 'action', label: 'ACT NOW',
    text: `Forecast crosses the danger level (${DANGER_LEVEL} m). Pre-position supplies for the zones below.`,
  };
  if (level >= READINESS_LEVEL) return {
    stage: 'readiness', label: 'READINESS',
    text: `Approaching the danger level (${DANGER_LEVEL} m). Ready teams and stocks; watch the forecast.`,
  };
  return { stage: 'monitor', label: 'MONITOR', text: `Below danger level (${DANGER_LEVEL} m). Routine monitoring.` };
}
