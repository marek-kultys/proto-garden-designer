import { matureSize } from '../../model/growth';
import { PlantThumb } from './PlantThumb';
import {
  DRAINAGE_LABELS,
  SOIL_PH_LABELS,
  SUN_LABELS,
  lifecycleLabel,
  sizeLabel,
} from './options';
import type { Species } from '../../model/types';

/**
 * One plant in the list: its portrait, its name and size, how many are on the
 * plan, and the details behind the "i".
 *
 * The whole card is the drag handle — a designer picks a plant up by its
 * picture, not by a separate grab bar — which is why the pointer handler is on
 * the card and the two buttons inside it stop the event from reaching it.
 */
export function PlantCard({
  species,
  count,
  open,
  onToggleDetail,
  onStartDrag,
  onFindPlanted,
}: {
  species: Species;
  /** How many of this plant are on the plan right now. */
  count: number;
  open: boolean;
  onToggleDetail: () => void;
  onStartDrag: (speciesId: string, clientX: number, clientY: number) => void;
  onFindPlanted: (speciesId: string) => void;
}) {
  const s = species;
  return (
    <div className={`card-outer ${count ? 'planted' : ''}`}>
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
            {sizeLabel(matureSize(s).height)} × {sizeLabel(matureSize(s).spread)} ·{' '}
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
              onFindPlanted(s.id);
            }}
          >
            {count}
          </button>
        )}
      </div>

      <button
        className="info-toggle"
        onClick={onToggleDetail}
        aria-expanded={open}
        title="Plant details"
      >
        {open ? '−' : 'i'}
      </button>

      {open && (
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
}
