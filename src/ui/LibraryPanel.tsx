import { useMemo, useState } from 'react';
import { SPECIES, TYPE_LABELS } from '../model/plants';
import {
  NO_FILTERS,
  filterPlants,
  isNarrowed,
  type PlantFilters,
} from '../model/plants/filter';
import { PLACEMENT_AGES, useStore } from '../state/store';
import { FilterBar } from './library/FilterBar';
import { PlantCard } from './library/PlantCard';
import { TYPE_ORDER } from './library/options';

/**
 * The plant library: search, filters, and a card per plant.
 *
 * What is where, since this used to be one file of six hundred lines. The rules
 * that decide which plants match live in `model/plants/filter.ts`, where they
 * can be tested without a browser; the chips and their labels in
 * `library/FilterBar.tsx` and `library/options.ts`; one plant's card, portrait
 * and details in `library/PlantCard.tsx` and `library/PlantThumb.tsx`. What is
 * left here is the panel itself: what is filtered, what is open, and the list.
 */

export interface LibraryProps {
  onStartDrag: (speciesId: string, clientX: number, clientY: number) => void;
}

export function LibraryPanel({ onStartDrag }: LibraryProps) {
  const [filters, setFilters] = useState<PlantFilters>(NO_FILTERS);
  const [openId, setOpenId] = useState<string | null>(null);

  const plants = useStore((s) => s.plants);
  const placementAge = useStore((s) => s.placementAge);
  const setPlacementAge = useStore((s) => s.setPlacementAge);
  const selectSpecies = useStore((s) => s.selectNextOfSpecies);

  const change = (patch: Partial<PlantFilters>) => setFilters((f) => ({ ...f, ...patch }));

  /** How many of each species are on the plot right now. */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of plants) map.set(p.speciesId, (map.get(p.speciesId) ?? 0) + 1);
    return map;
  }, [plants]);

  const results = useMemo(() => filterPlants(filters, counts), [filters, counts]);

  const grouped = useMemo(
    () =>
      TYPE_ORDER.map((t) => ({
        type: t,
        label: TYPE_LABELS[t],
        items: results.filter((s) => s.type === t),
      })).filter((g) => g.items.length > 0),
    [results],
  );

  const distinctPlanted = counts.size;
  const narrowed = isNarrowed(filters);

  return (
    <>
      <div className="library-head">
        <h2>Plants</h2>
        <span className="library-count">
          {narrowed
            ? `${results.length} of ${SPECIES.length}`
            : plants.length === 0
              ? `${SPECIES.length} in library`
              : `${plants.length} placed · ${distinctPlanted} of ${SPECIES.length} used`}
        </span>
      </div>

      <input
        className="search"
        placeholder="Search name, genus or family…"
        value={filters.query}
        onChange={(e) => change({ query: e.target.value })}
      />

      <FilterBar
        filters={filters}
        onChange={change}
        plantsPlaced={plants.length}
        distinctPlanted={distinctPlanted}
      />

      <p className="hint">
        {narrowed ? (
          <button className="linkish" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        ) : (
          'Drag onto the plan, or tap to drop one in the middle.'
        )}
      </p>

      <div className="planting-size">
        <span className="planting-size-label">Plant as</span>
        <div className="chips">
          {PLACEMENT_AGES.map((option) => (
            <button
              key={option.years}
              className={`chip ${placementAge === option.years ? 'on' : ''}`}
              onClick={() => setPlacementAge(option.years)}
              aria-pressed={placementAge === option.years}
            >
              {option.label}
            </button>
          ))}
        </div>
        {placementAge > 0 && (
          <p className="hint">
            New plants go in with {placementAge} years of growth already made, and stay that much
            ahead for the life of the design.
          </p>
        )}
      </div>

      <div className="cards">
        {grouped.map((group) => (
          <section key={group.type} className="group">
            <h3 className="group-head">
              {group.label}
              <span>{group.items.length}</span>
            </h3>

            {group.items.map((s) => (
              <PlantCard
                key={s.id}
                species={s}
                count={counts.get(s.id) ?? 0}
                open={openId === s.id}
                onToggleDetail={() => setOpenId(openId === s.id ? null : s.id)}
                onStartDrag={onStartDrag}
                onFindPlanted={selectSpecies}
              />
            ))}
          </section>
        ))}

        {results.length === 0 && (
          <p className="hint">
            {filters.plantedOnly
              ? 'Nothing planted matches those filters.'
              : 'Nothing matches those filters.'}
          </p>
        )}
      </div>
    </>
  );
}
