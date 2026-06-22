import { useEffect, useRef } from 'react';
import type { Metric, Target } from '../types';

// One leaderboard row: a Target plus its sync key, an optional status (from the
// map_layer row — e.g. deconfliction 'under-served', complaints 'urgent'), and the
// single key metric to show inline. The parent precomputes these so the board and
// the map agree on `key`.
export interface BoardItem {
  key: string;
  target: Target;
  status: string | null;
  metric: Metric | null;
}

interface Props {
  title: string;
  items: BoardItem[];
  selectedKey: string | null;
  onHover: (key: string | null) => void;
  onSelect: (item: BoardItem) => void;
}

function fmt(v: number | string): string {
  return typeof v === 'number' ? v.toLocaleString() : v;
}

export default function ProtocolBoard({ title, items, selectedKey, onHover, onSelect }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Scroll the selected row into view when the selection changes (e.g. from a map click).
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedKey]);

  return (
    <aside className="syl-board" aria-label={`${title} — ranked targets`}>
      <div className="syl-board__head">
        <span className="syl-board__title">{title}</span>
        <span className="syl-board__count">{items.length}</span>
      </div>
      <ol className="syl-board__list">
        {items.map((it) => {
          const selected = it.key === selectedKey;
          return (
            <li key={it.key}>
              <button
                type="button"
                ref={selected ? selectedRef : undefined}
                className={`syl-board__row ${selected ? 'is-selected' : ''}`}
                onMouseEnter={() => onHover(it.key)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(it.key)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(it)}
              >
                <span className="syl-board__rank">{it.target.rank}</span>
                <span className="syl-board__name">
                  <b>{it.target.name}</b>
                  {it.target.admin_unit && it.target.admin_unit !== it.target.name && (
                    <em>{it.target.admin_unit}</em>
                  )}
                </span>
                {it.metric && (
                  <span className="syl-board__metric">
                    {fmt(it.metric.value)}{it.metric.unit ? ` ${it.metric.unit}` : ''}
                  </span>
                )}
                {it.status && (
                  <span className={`syl-board__status st-${it.status.replace(/\s+/g, '-')}`}>
                    {it.status}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className="syl-board__empty">No targets.</li>}
      </ol>
    </aside>
  );
}
