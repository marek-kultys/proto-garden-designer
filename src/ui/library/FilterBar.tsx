import { useState } from 'react';
import { PLANTING_STYLES, STYLE_LABELS, hardinessRating } from '../../model/plants';
import { activeConditions, countMatching, type PlantFilters } from '../../model/plants/filter';
import { FilterRow } from './FilterRow';
import { DRAINAGE, FOLIAGE, HARDINESS, SIZES, SOIL_PH, SOIL_TYPE, SUN, TYPES } from './options';

/**
 * The chips that narrow the library.
 *
 * Type is always shown, because it is how anyone starts; the growing conditions
 * fold away, because every condition visible at once would leave no room for
 * the plants themselves. Each chip carries the number of plants it would leave,
 * counted by `model/plants/filter.ts` — the rule that a row does not count
 * against itself lives there, with the tests that pin it.
 */
export function FilterBar({
  filters,
  onChange,
  plantsPlaced,
  distinctPlanted,
}: {
  filters: PlantFilters;
  onChange: (patch: Partial<PlantFilters>) => void;
  /** How many plants are on the plan, which is what greys out "Planted". */
  plantsPlaced: number;
  distinctPlanted: number;
}) {
  const [showConditions, setShowConditions] = useState(false);
  const active = activeConditions(filters);

  return (
    <div className="filters">
      <FilterRow
        caption="Type"
        options={TYPES}
        value={filters.type}
        onPick={(type) => onChange({ type })}
        countFor={(id) => (id === 'all' ? 1 : countMatching(filters, (s) => s.type === id))}
        extra={
          <>
            <button
              className={`chip planted ${filters.plantedOnly ? 'on' : ''}`}
              onClick={() => onChange({ plantedOnly: !filters.plantedOnly })}
              disabled={plantsPlaced === 0}
              title="Show only plants already on the plan"
            >
              Planted{plantsPlaced > 0 ? ` (${distinctPlanted})` : ''}
            </button>
            {/* A style cuts across the types rather than being one of them — a
                Mediterranean garden has trees, shrubs, grasses and bulbs — so,
                like Planted, it is a switch that combines with whichever type
                is chosen instead of replacing it. */}
            {PLANTING_STYLES.map((id) => (
              <button
                key={id}
                className={`chip style ${filters.style === id ? 'on' : ''}`}
                onClick={() => onChange({ style: filters.style === id ? null : id })}
                aria-pressed={filters.style === id}
                title={`Show only ${STYLE_LABELS[id]} plants`}
              >
                {STYLE_LABELS[id]}
              </button>
            ))}
          </>
        }
      />

      {/* Every growing condition visible at once would leave no room for the
          plants themselves, so they fold away until wanted. */}
      <button
        className={`disclosure ${showConditions ? 'open' : ''}`}
        onClick={() => setShowConditions((v) => !v)}
        aria-expanded={showConditions}
      >
        <span>Growing conditions</span>
        <span className="disclosure-meta">
          {active > 0 && <b>{active}</b>}
          {showConditions ? '−' : '+'}
        </span>
      </button>

      {showConditions && (
        <>
          <FilterRow
            caption="Aspect"
            options={SUN}
            value={filters.sun}
            onPick={(sun) => onChange({ sun })}
            countFor={(id) =>
              id === 'all' ? 1 : countMatching(filters, (s) => s.sun.includes(id), 'sun')
            }
          />
          <FilterRow
            caption="Soil type"
            options={SOIL_TYPE}
            value={filters.soilType}
            onPick={(soilType) => onChange({ soilType })}
            countFor={(id) =>
              id === 'all' ? 1 : countMatching(filters, (s) => s.soilType.includes(id), 'soilType')
            }
          />
          <FilterRow
            caption="Soil pH"
            options={SOIL_PH}
            value={filters.soilPh}
            onPick={(soilPh) => onChange({ soilPh })}
            countFor={(id) =>
              id === 'all' ? 1 : countMatching(filters, (s) => s.soilPh.includes(id), 'soilPh')
            }
          />
          <FilterRow
            caption="Drainage"
            options={DRAINAGE}
            value={filters.drainage}
            onPick={(drainage) => onChange({ drainage })}
            countFor={(id) =>
              id === 'all' ? 1 : countMatching(filters, (s) => s.drainage.includes(id), 'drainage')
            }
          />
          <FilterRow
            caption="Foliage"
            options={FOLIAGE}
            value={filters.foliage}
            onPick={(foliage) => onChange({ foliage })}
            countFor={(id) =>
              id === 'all' ? 1 : countMatching(filters, (s) => s.foliage === id, 'foliage')
            }
          />
          <FilterRow
            caption="Size"
            options={SIZES}
            value={filters.size}
            onPick={(size) => onChange({ size })}
            countFor={(id) =>
              id === 'all' ? 1 : countMatching(filters, (s) => s.sizeClass === id, 'size')
            }
          />
          <FilterRow
            caption="Hardy to"
            options={HARDINESS}
            value={filters.hardiness}
            onPick={(hardiness) => onChange({ hardiness })}
            countFor={(id) =>
              id === 'all'
                ? 1
                : countMatching(filters, (s) => hardinessRating(s) >= Number(id.slice(1)), 'hardiness')
            }
          />
        </>
      )}
    </div>
  );
}
