import { SCENARIOS, GAUGE_DANGER, type TriggerStage } from '../scenarios';

interface Props {
  scenarioId: string;
  gauge: number;
  stage: TriggerStage;
  onScenario: (id: string) => void;
}

export default function OpsHeader({ scenarioId, gauge, stage, onScenario }: Props) {
  return (
    <header className="ops-header">
      <div className="ops-brand">
        <span className="ops-dot" />
        <b>BEACON</b>
      </div>
      <div className="ops-meta">
        <span>📍 Sirajganj · Jamuna basin</span>
        <span className="sep">|</span>
        <span>Forecast: 4 Jul 2024 · FFWC 5-day</span>
        <span className="sep">|</span>
        <span className={`gauge ${stage}`}>
          Bahadurabad gauge <b>{gauge.toFixed(1)} m</b> <em>(danger {GAUGE_DANGER} m)</em>
        </span>
      </div>
      <div className="ops-scenarios">
        {SCENARIOS.map((s) => (
          <button key={s.id} className={scenarioId === s.id ? 'active' : ''} onClick={() => onScenario(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
    </header>
  );
}
