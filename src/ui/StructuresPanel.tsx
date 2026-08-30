import {
  BED_HEIGHT_RANGE,
  WALL_HEIGHT_RANGE,
  WALL_THICKNESS_RANGE,
  describeStructure,
  heightRange,
  runLength,
} from '../model/structures';
import { useStore } from '../state/store';

/**
 * Walls and raised beds: drawing them, and setting how tall they are.
 *
 * Height is the whole reason these are here rather than being lines on a
 * drawing — it is what decides the shadow and what you can see over — so the
 * control for it sits with the selection rather than behind a dialog.
 */
export function StructuresPanel() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const structures = useStore((s) => s.structures);
  const selectedStructureId = useStore((s) => s.selectedStructureId);
  const selectStructure = useStore((s) => s.selectStructure);
  const setStructureHeight = useStore((s) => s.setStructureHeight);
  const setStructureThickness = useStore((s) => s.setStructureThickness);
  const removeStructure = useStore((s) => s.removeStructure);

  const selected = structures.find((x) => x.id === selectedStructureId);
  const drawing = tool === 'draw-wall' || tool === 'draw-bed';

  const walls = structures.filter((x) => x.kind === 'wall');
  const beds = structures.filter((x) => x.kind === 'bed');

  return (
    <section className="structures">
      <h3>Walls and beds</h3>

      <div className="chips">
        <button
          className={`chip ${tool === 'draw-wall' ? 'on' : ''}`}
          onClick={() => setTool(tool === 'draw-wall' ? 'select' : 'draw-wall')}
        >
          Draw wall
        </button>
        <button
          className={`chip ${tool === 'draw-bed' ? 'on' : ''}`}
          onClick={() => setTool(tool === 'draw-bed' ? 'select' : 'draw-bed')}
        >
          Draw raised bed
        </button>
      </div>

      {drawing ? (
        <p className="hint">
          {tool === 'draw-wall'
            ? 'Click along the line of the wall. Enter finishes it, Escape cancels.'
            : 'Click round the edge of the bed. Enter closes it, Escape cancels.'}
        </p>
      ) : (
        <p className="hint">
          {structures.length === 0
            ? 'A wall casts a real shadow and hides what is behind it. A raised bed lifts what grows in it.'
            : `${walls.length} wall${walls.length === 1 ? '' : 's'}, ${beds.length} bed${
                beds.length === 1 ? '' : 's'
              } — click one on the plan to change its height.`}
        </p>
      )}

      {selected !== undefined && (
        <div className="structure-editor">
          <div className="structure-head">
            <strong>{selected.kind === 'wall' ? 'Wall' : 'Raised bed'}</strong>
            <span>{runLength(selected).toFixed(1)} m</span>
          </div>

          <label htmlFor="structure-height">
            Height
            <output htmlFor="structure-height">
              {selected.kind === 'bed'
                ? `${Math.round(selected.height * 100)} cm`
                : `${selected.height.toFixed(2)} m`}
            </output>
          </label>
          <input
            id="structure-height"
            type="range"
            min={heightRange(selected.kind).min}
            max={heightRange(selected.kind).max}
            step={heightRange(selected.kind).step}
            value={selected.height}
            onChange={(e) => setStructureHeight(selected.id, Number(e.target.value))}
          />
          <div className="range-ends">
            <span>
              {selected.kind === 'wall'
                ? `${WALL_HEIGHT_RANGE.min} m`
                : `${Math.round(BED_HEIGHT_RANGE.min * 100)} cm`}
            </span>
            <span>
              {selected.kind === 'wall'
                ? `${WALL_HEIGHT_RANGE.max} m`
                : `${Math.round(BED_HEIGHT_RANGE.max * 100)} cm`}
            </span>
          </div>

          {selected.kind === 'wall' && (
            <>
              <label htmlFor="structure-thickness">
                Thickness
                <output htmlFor="structure-thickness">
                  {Math.round(selected.thickness * 100)} cm
                </output>
              </label>
              <input
                id="structure-thickness"
                type="range"
                min={WALL_THICKNESS_RANGE.min}
                max={WALL_THICKNESS_RANGE.max}
                step={WALL_THICKNESS_RANGE.step}
                value={selected.thickness}
                onChange={(e) => setStructureThickness(selected.id, Number(e.target.value))}
              />
            </>
          )}

          <div className="structure-actions">
            <button onClick={() => selectStructure(null)}>Done</button>
            <button className="danger" onClick={() => removeStructure(selected.id)}>
              Remove
            </button>
          </div>
        </div>
      )}

      {structures.length > 0 && selected === undefined && (
        <ul className="structure-list">
          {structures.map((structure) => (
            <li key={structure.id}>
              <button onClick={() => selectStructure(structure.id)}>
                {describeStructure(structure)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
