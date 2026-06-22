import type { Metric, Provenance } from '../types';

interface Props {
  title: string;
  metrics: Metric[];
  evidence: Provenance[];
  onOpenEvidence: (provenanceId: string) => void;
  onClose: () => void;
}

export default function ProtocolPopup(props: Props) {
  const { title, metrics, evidence, onOpenEvidence, onClose } = props;
  const sourceFor = (provenanceId: string): string | null =>
    evidence.find((p) => p.id === provenanceId)?.source ?? null;

  return (
    <div className="syl-proto-popup">
      <div className="syl-proto-popup__header">
        <span className="syl-proto-popup__title">{title}</span>
        <button
          type="button"
          className="syl-proto-popup__close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {metrics.slice(0, 3).map((m) => {
        const src = sourceFor(m.provenance_id);
        return (
          <button
            key={m.id}
            type="button"
            className="syl-proto-popup__metric"
            onClick={() => onOpenEvidence(m.provenance_id)}
            title={src ? `Source: ${src}` : 'View source'}
          >
            <span className="syl-proto-popup__label">{m.label}:</span>{' '}
            <span className="syl-proto-popup__value">
              {m.value}
              {m.unit ? ` ${m.unit}` : ''}
            </span>
            <span className="syl-proto-popup__source">source</span>
          </button>
        );
      })}
    </div>
  );
}
