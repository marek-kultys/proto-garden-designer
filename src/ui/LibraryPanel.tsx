import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECIES, TYPE_LABELS } from '../model/plants';
import { phaseAt } from '../model/phenology';
import { lightingFor } from '../render/palette';
import { getForm } from '../render/form';
import { drawPlantElevation } from '../render/plant';
import { useStore } from '../state/store';
import type { Foliage, PlantType, Species, SunPref } from '../model/types';

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
  { id: 'grass', label: 'Grasses' },
  { id: 'perennial', label: 'Perennials' },
  { id: 'annual', label: 'Annuals' },
];

const FOLIAGE: { id: Foliage | 'all'; label: string }[] = [
  { id: 'all', label: 'Any foliage' },
  { id: 'deciduous', label: 'Deciduous' },
  { id: 'evergreen', label: 'Evergreen' },
  { id: 'herbaceous', label: 'Dies back' },
];

const SUN: { id: SunPref | 'all'; label: string }[] = [
  { id: 'all', label: 'Any aspect' },
  { id: 'full', label: 'Full sun' },
  { id: 'partial', label: 'Partial shade' },
  { id: 'shade', label: 'Shade' },
];

const TYPE_ORDER: PlantType[] = ['tree', 'shrub', 'conifer', 'grass', 'perennial', 'annual'];

function sizeLabel(m: number): string {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m} m`;
}

function lifecycleLabel(species: Species): string {
  if (species.lifecycle === 'annual') return 'annual';
  if (species.lifecycle === 'bulb') return 'bulb';
  return species.foliage === 'herbaceous' ? 'dies back' : species.foliage;
}

export function LibraryPanel({ onStartDrag }: LibraryProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<PlantType | 'all'>('all');
  const [foliage, setFoliage] = useState<Foliage | 'all'>('all');
  const [sun, setSun] = useState<SunPref | 'all'>('all');
  const [plantedOnly, setPlantedOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const plants = useStore((s) => s.plants);
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
      if (!q) return true;
      return [s.common, s.latin, s.genus, s.family, s.flowerColour, s.foliageColour]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, type, foliage, sun, plantedOnly, counts]);

  const grouped = useMemo(() => {
    return TYPE_ORDER.map((t) => ({
      type: t,
      label: TYPE_LABELS[t],
      items: results.filter((s) => s.type === t),
    })).filter((g) => g.items.length > 0);
  }, [results]);

  const distinctPlanted = counts.size;

  return (
    <>
      <div className="library-head">
        <h2>Plants</h2>
        <span className="library-count">
          {plants.length === 0
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

      <div className="chips">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={`chip ${type === t.id ? 'on' : ''}`}
            onClick={() => setType(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button
          className={`chip planted ${plantedOnly ? 'on' : ''}`}
          onClick={() => setPlantedOnly((v) => !v)}
          disabled={plants.length === 0}
          title="Show only plants already on the plan"
        >
          Planted{plants.length > 0 ? ` (${distinctPlanted})` : ''}
        </button>
      </div>

      <div className="filter-row">
        <select value={foliage} onChange={(e) => setFoliage(e.target.value as Foliage | 'all')}>
          {FOLIAGE.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select value={sun} onChange={(e) => setSun(e.target.value as SunPref | 'all')}>
          {SUN.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <p className="hint">Drag onto the plan, or tap to drop one in the middle.</p>

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
                          <dd>{s.sun.join(', ')}</dd>
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
