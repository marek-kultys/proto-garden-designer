import { useEffect, useMemo, useRef, useState } from 'react';
import { SPECIES } from '../model/plants';
import { phaseAt } from '../model/phenology';
import { lightingFor } from '../render/palette';
import { getForm } from '../render/form';
import { drawPlantElevation } from '../render/plant';
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

    const pxPerM = (h - 12) / species.matureHeight;
    const phase = phaseAt(species, 180, REFERENCE_SITE);
    drawPlantElevation(
      { ctx, light: THUMB_LIGHT, pxPerM },
      species,
      getForm(species, 4242),
      phase,
      { height: species.matureHeight, spread: species.matureSpread },
      w / 2,
      h - 6,
      0.4,
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

export function LibraryPanel({ onStartDrag }: LibraryProps) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<PlantType | 'all'>('all');
  const [foliage, setFoliage] = useState<Foliage | 'all'>('all');
  const [sun, setSun] = useState<SunPref | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPECIES.filter((s) => {
      if (type !== 'all' && s.type !== type) return false;
      if (foliage !== 'all' && s.foliage !== foliage) return false;
      if (sun !== 'all' && !s.sun.includes(sun)) return false;
      if (!q) return true;
      return [s.common, s.latin, s.genus, s.family, s.flowerColour, s.foliageColour]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [query, type, foliage, sun]);

  return (
    <aside className="library">
      <h2>Plants</h2>

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

      <p className="hint">Drag onto the plan, or click to drop one in the middle.</p>

      <div className="cards">
        {results.map((s) => (
          <div key={s.id} className="card-outer">
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
                  {s.matureHeight < 1
                    ? `${Math.round(s.matureHeight * 100)} cm`
                    : `${s.matureHeight} m`}{' '}
                  × {s.matureSpread < 1 ? `${Math.round(s.matureSpread * 100)} cm` : `${s.matureSpread} m`}
                  {' · '}
                  {s.foliage === 'herbaceous' ? 'dies back' : s.foliage}
                </div>
              </div>
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
        ))}
        {results.length === 0 && <p className="hint">Nothing matches those filters.</p>}
      </div>
    </aside>
  );
}
