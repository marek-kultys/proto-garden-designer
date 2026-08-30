import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECIES, TYPE_LABELS } from '../model/plants';
import { phaseAt } from '../model/phenology';
import { lightingFor } from '../render/palette';
import { getForm } from '../render/form';
import { drawPlantElevation } from '../render/plant';
import { PLACEMENT_AGES, useStore } from '../state/store';
import type {
  DrainagePref,
  Foliage,
  PlantType,
  SoilPh,
  SoilType,
  Species,
  SunPref,
} from '../model/types';

const REFERENCE_SITE = {
  latitude: 51.5,
  longitude: -0.13,
  altitude: 0,
  northAngle: 0,
  dst: true,
  label: 'ref',
};

const THUMB_LIGHT = lightingFor(46, 180);

/**
 * Thumbnails are drawn on the day each plant looks most like itself, rather than
 * on one shared date. A midsummer thumbnail would show the magnolia, the
 * hellebore and the allium as anonymous green lumps — the three plants whose
 * whole point is that they perform when nothing else does — and a January one
 * would show half the library as bare sticks.
 *
 * So the day is chosen by scoring every fortnight of the year for how much
 * there is to look at. Flowers and fruit outweigh foliage, which is why the
 * magnolia is drawn in flower on bare wood; but a birch, whose catkins are
 * nothing to look at, still scores highest in full leaf.
 */
function portraitDay(species: Species): number {
  let best = 195;
  let bestScore = -1;
  for (let doy = 5; doy <= 365; doy += 5) {
    const p = phaseAt(species, doy, REFERENCE_SITE);
    if (p.dormant) continue;
    const score =
      p.leafCover * 0.9 +
      p.flower * 1.35 +
      p.fruit * 1.15 +
      p.autumn * 0.7 * p.leafCover +
      p.seedhead * 0.7;
    if (score > bestScore) {
      bestScore = score;
      best = doy;
    }
  }
  return best;
}

/** Each plant is normalised to the same box height, so the shape reads as an icon. */
function PlantThumb({ species }: { species: Species }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 56;
    const h = 56;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const doy = portraitDay(species);
    const phase = phaseAt(species, doy, REFERENCE_SITE);
    drawPlantElevation(
      { ctx, light: THUMB_LIGHT, pxPerM: (h - 12) / species.matureHeight },
      species,
      getForm(species, 4242),
      phase,
      { height: species.matureHeight, spread: species.matureSpread },
      w / 2,
      h - 6,
      phase.flowerAge,
      false,
    );
  }, [species]);

  return <canvas ref={ref} className="thumb" style={{ width: 56, height: 56 }} aria-hidden />;
}

export interface LibraryProps {
  onStartDrag: (speciesId: string, clientX: number, clientY: number) => void;
}

const TYPES: { id: PlantType | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tree', label: 'Trees' },
  { id: 'shrub', label: 'Shrubs' },
  { id: 'conifer', label: 'Conifers' },
  { id: 'climber', label: 'Climbers' },
  { id: 'grass', label: 'Grasses' },
  { id: 'fern', label: 'Ferns' },
  { id: 'perennial', label: 'Perennials' },
  { id: 'bulb', label: 'Bulbs' },
  { id: 'annual', label: 'Annuals' },
];

const FOLIAGE: { id: Foliage | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'deciduous', label: 'Deciduous' },
  { id: 'evergreen', label: 'Evergreen' },
  { id: 'herbaceous', label: 'Dies back' },
];

/** Ordered sunniest to shadiest, which is how anyone reads a row like this. */
const SUN: { id: SunPref | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'full', label: 'Full sun' },
  { id: 'dappled', label: 'Dappled shade' },
  { id: 'partial', label: 'Semi shade' },
  { id: 'shade', label: 'Shade' },
];

const SOIL_PH: { id: SoilPh | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'acidic', label: 'Acidic' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'alkaline', label: 'Alkaline' },
];

const SOIL_TYPE: { id: SoilType | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'clay', label: 'Clay' },
  { id: 'loam', label: 'Loam' },
  { id: 'sand', label: 'Sand' },
  { id: 'chalk', label: 'Chalk' },
];

/** Driest to wettest. */
const DRAINAGE: { id: DrainagePref | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'free', label: 'Free draining' },
  { id: 'retentive', label: 'Water retentive' },
  { id: 'waterlogged', label: 'Waterlogged' },
  { id: 'bog', label: 'Bog' },
  { id: 'pond', label: 'Pond' },
];

export const SUN_LABELS: Record<SunPref, string> = {
  full: 'full sun',
  dappled: 'dappled shade',
  partial: 'semi shade',
  shade: 'shade',
};

const SOIL_PH_LABELS: Record<SoilPh, string> = {
  acidic: 'acidic',
  neutral: 'neutral',
  alkaline: 'alkaline',
};

const DRAINAGE_LABELS: Record<DrainagePref, string> = {
  free: 'free draining',
  retentive: 'water retentive',
  waterlogged: 'tolerates waterlogging',
  bog: 'bog',
  pond: 'pond',
};

const TYPE_ORDER: PlantType[] = [
  'tree',
  'shrub',
  'conifer',
  'climber',
  'grass',
  'fern',
  'perennial',
  'bulb',
  'annual',
];

function sizeLabel(m: number): string {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m} m`;
}

function lifecycleLabel(species: Species): string {
  if (species.lifecycle === 'annual') return 'annual';
  if (species.lifecycle === 'bulb') return 'bulb';
  return species.foliage === 'herbaceous' ? 'dies back' : species.foliage;
}

/**
 * One axis of filtering, captioned.
 *
 * There are four of these now, and without captions three rows of chips read as
 * one undifferentiated soup in which "Any" appears three times over.
 */
function FilterRow<T extends string>({
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
  extra?: React.ReactNode;
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

export function LibraryPanel({ onStartDrag }: LibraryProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<PlantType | 'all'>('all');
  const [foliage, setFoliage] = useState<Foliage | 'all'>('all');
  const [sun, setSun] = useState<SunPref | 'all'>('all');
  const [soilPh, setSoilPh] = useState<SoilPh | 'all'>('all');
  const [soilType, setSoilType] = useState<SoilType | 'all'>('all');
  const [drainage, setDrainage] = useState<DrainagePref | 'all'>('all');
  const [plantedOnly, setPlantedOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const plants = useStore((s) => s.plants);

  const placementAge = useStore((s) => s.placementAge);

  const setPlacementAge = useStore((s) => s.setPlacementAge);
  const selectSpecies = useStore((s) => s.selectNextOfSpecies);

  /** How many of each species are on the plot right now. */
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of plants) map.set(p.speciesId, (map.get(p.speciesId) ?? 0) + 1);
    return map;
  }, [plants]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPECIES.filter((s) => {
      if (plantedOnly && !counts.has(s.id)) return false;
      if (type !== 'all' && s.type !== type) return false;
      if (foliage !== 'all' && s.foliage !== foliage) return false;
      if (sun !== 'all' && !s.sun.includes(sun)) return false;
      if (soilPh !== 'all' && !s.soilPh.includes(soilPh)) return false;
      if (soilType !== 'all' && !s.soilType.includes(soilType)) return false;
      if (drainage !== 'all' && !s.drainage.includes(drainage)) return false;
      if (!q) return true;
      return [s.common, s.latin, s.genus, s.family, s.flowerColour, s.foliageColour]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, type, foliage, sun, soilPh, soilType, drainage, plantedOnly, counts]);

  const grouped = useMemo(() => {
    return TYPE_ORDER.map((t) => ({
      type: t,
      label: TYPE_LABELS[t],
      items: results.filter((s) => s.type === t),
    })).filter((g) => g.items.length > 0);
  }, [results]);

  const distinctPlanted = counts.size;
  // How many of the secondary axes are narrowing the list, so the disclosure can
  // say so without being opened.
  const activeConditions = [sun, soilPh, soilType, drainage, foliage].filter((v) => v !== 'all').length;
  const filtered = activeConditions > 0 || type !== 'all' || plantedOnly || query.trim() !== '';

  const clearFilters = () => {
    setQuery('');
    setType('all');
    setFoliage('all');
    setSun('all');
    setSoilPh('all');
    setSoilType('all');
    setDrainage('all');
    setPlantedOnly(false);
  };

  /**
   * How many plants a chip would leave, given everything else that is already
   * set. Chips that would empty the list are dimmed rather than hidden — with
   * bog and pond in the drainage row and no marginals in the palette, a tab
   * that silently returns nothing reads as a bug.
   */
  const countIf = (predicate: (s: Species) => boolean) =>
    SPECIES.filter(
      (s) =>
        predicate(s) &&
        (type === 'all' || s.type === type) &&
        (sun === 'all' || s.sun.includes(sun)) &&
        (soilPh === 'all' || s.soilPh.includes(soilPh)) &&
        (soilType === 'all' || s.soilType.includes(soilType)) &&
        (drainage === 'all' || s.drainage.includes(drainage)) &&
        (foliage === 'all' || s.foliage === foliage),
    ).length;

  return (
    <>
      <div className="library-head">
        <h2>Plants</h2>
        <span className="library-count">
          {filtered
            ? `${results.length} of ${SPECIES.length}`
            : plants.length === 0
              ? `${SPECIES.length} in library`
              : `${plants.length} placed · ${distinctPlanted} of ${SPECIES.length} used`}
        </span>
      </div>

      <input
        className="search"
        placeholder="Search name, genus or family…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="filters">
        <FilterRow
          caption="Type"
          options={TYPES}
          value={type}
          onPick={setType}
          countFor={(id) => (id === 'all' ? 1 : countIf((s) => s.type === id))}
          extra={
            <button
              className={`chip planted ${plantedOnly ? 'on' : ''}`}
              onClick={() => setPlantedOnly((v) => !v)}
              disabled={plants.length === 0}
              title="Show only plants already on the plan"
            >
              Planted{plants.length > 0 ? ` (${distinctPlanted})` : ''}
            </button>
          }
        />

        {/* Six axes visible at once would leave no room for the plants
            themselves, so the conditions fold away until wanted. */}
        <button
          className={`disclosure ${showFilters ? 'open' : ''}`}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
        >
          <span>Growing conditions</span>
          <span className="disclosure-meta">
            {activeConditions > 0 && <b>{activeConditions}</b>}
            {showFilters ? '−' : '+'}
          </span>
        </button>

        {showFilters && (
          <>
            <FilterRow
              caption="Aspect"
              options={SUN}
              value={sun}
              onPick={setSun}
              countFor={(id) => (id === 'all' ? 1 : countIf((s) => s.sun.includes(id)))}
            />
            <FilterRow
              caption="Soil type"
              options={SOIL_TYPE}
              value={soilType}
              onPick={setSoilType}
              countFor={(id) => (id === 'all' ? 1 : countIf((s) => s.soilType.includes(id)))}
            />
            <FilterRow
              caption="Soil pH"
              options={SOIL_PH}
              value={soilPh}
              onPick={setSoilPh}
              countFor={(id) => (id === 'all' ? 1 : countIf((s) => s.soilPh.includes(id)))}
            />
            <FilterRow
              caption="Drainage"
              options={DRAINAGE}
              value={drainage}
              onPick={setDrainage}
              countFor={(id) => (id === 'all' ? 1 : countIf((s) => s.drainage.includes(id)))}
            />
            <FilterRow
              caption="Foliage"
              options={FOLIAGE}
              value={foliage}
              onPick={setFoliage}
              countFor={(id) => (id === 'all' ? 1 : countIf((s) => s.foliage === id))}
            />
          </>
        )}
      </div>

      <p className="hint">
        {filtered ? (
          <button className="linkish" onClick={clearFilters}>
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

            {group.items.map((s) => {
              const count = counts.get(s.id) ?? 0;
              return (
                <div key={s.id} className={`card-outer ${count ? 'planted' : ''}`}>
                  <div
                    className="card"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onStartDrag(s.id, e.clientX, e.clientY);
                    }}
                  >
                    <PlantThumb species={s} />
                    <div className="card-text">
                      <div className="common">{s.common}</div>
                      <div className="latin">{s.latin}</div>
                      <div className="meta">
                        {sizeLabel(s.matureHeight)} × {sizeLabel(s.matureSpread)} ·{' '}
                        {lifecycleLabel(s)}
                      </div>
                    </div>
                    {count > 0 && (
                      <button
                        className="count"
                        title={`${count} on the plan — tap to find ${count > 1 ? 'them' : 'it'}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectSpecies(s.id);
                        }}
                      >
                        {count}
                      </button>
                    )}
                  </div>

                  <button
                    className="info-toggle"
                    onClick={() => setOpenId(openId === s.id ? null : s.id)}
                    aria-expanded={openId === s.id}
                    title="Plant details"
                  >
                    {openId === s.id ? '−' : 'i'}
                  </button>

                  {openId === s.id && (
                    <div className="card-detail">
                      <p>{s.notes}</p>
                      <dl>
                        <div>
                          <dt>Family</dt>
                          <dd>{s.family}</dd>
                        </div>
                        <div>
                          <dt>Flower</dt>
                          <dd>{s.flowerColour}</dd>
                        </div>
                        <div>
                          <dt>Aspect</dt>
                          <dd>{s.sun.map((x) => SUN_LABELS[x]).join(', ')}</dd>
                        </div>
                        <div>
                          <dt>Soil</dt>
                          <dd>
                            {s.soilType.length === 4 ? 'any' : s.soilType.join(', ')}
                            {s.soilPh.length < 3
                              ? ` · ${s.soilPh.map((x) => SOIL_PH_LABELS[x]).join(' or ')}`
                              : ''}
                          </dd>
                        </div>
                        <div>
                          <dt>Drainage</dt>
                          <dd>{s.drainage.map((x) => DRAINAGE_LABELS[x]).join(', ')}</dd>
                        </div>
                        <div>
                          <dt>Hardiness</dt>
                          <dd>{s.hardiness}</dd>
                        </div>
                      </dl>
                      <a href={s.source} target="_blank" rel="noreferrer">
                        RHS entry ↗
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {results.length === 0 && (
          <p className="hint">
            {plantedOnly ? 'Nothing planted matches those filters.' : 'Nothing matches those filters.'}
          </p>
        )}
      </div>
    </>
  );
}
