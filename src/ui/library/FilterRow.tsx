import type { ReactNode } from 'react';

/**
 * One axis of filtering, captioned.
 *
 * There are four of these now, and without captions three rows of chips read as
 * one undifferentiated soup in which "Any" appears three times over.
 */
export function FilterRow<T extends string>({
  caption,
  options,
  value,
  onPick,
  countFor,
  extra,
}: {
  caption: string;
  options: { id: T; label: string }[];
  value: T;
  onPick: (id: T) => void;
  countFor: (id: T) => number;
  extra?: ReactNode;
}) {
  return (
    <div className="filter-group">
      <span className="filter-caption">{caption}</span>
      <div className="chips">
        {options.map((o) => {
          const empty = countFor(o.id) === 0;
          return (
            <button
              key={o.id}
              className={`chip ${value === o.id ? 'on' : ''} ${empty ? 'empty' : ''}`}
              onClick={() => onPick(o.id)}
              title={empty ? 'Nothing in the library matches this' : undefined}
            >
              {o.label}
            </button>
          );
        })}
        {extra}
      </div>
    </div>
  );
}
