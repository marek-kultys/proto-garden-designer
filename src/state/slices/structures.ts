import { clampHeight, clampThickness } from '../../model/structures';
import { pointInPolygon } from '../../model/geometry';
import { newId } from '../ids';
import { isOval, resizeOval } from '../../model/oval';
import type { Structure, Vec2 } from '../../model/types';
import type { SliceOf } from '../slice';
import { pushHistory } from './history';

export interface StructuresSlice {
  structures: Structure[];
  moveStructure: (id: string, by: Vec2) => void;
  /** Drag one corner of a wall or bed, reshaping it. */
  moveStructurePoint: (id: string, index: number, to: Vec2) => void;
  /** Draw the outline again from scratch, keeping its height and thickness. */
  redrawStructure: (id: string) => void;
  removeStructure: (id: string) => void;
  /** Build another the same, beside it. */
  duplicateStructure: (id: string) => void;
  setStructureHeight: (id: string, metres: number) => void;
  setStructureThickness: (id: string, metres: number) => void;
}

export const structuresSlice: SliceOf<StructuresSlice> = (set) => ({
  structures: [],

  moveStructure: (id, by) =>
    set((s) => ({
      // Keyed on the structure, so one drag is one undo step but moving two in
      // turn stays two — the same rule the plants use.
      ...pushHistory(s, 'Move structure', `structure:${id}`),
      structures: s.structures.map((x) =>
        x.id === id
          ? { ...x, points: x.points.map((p) => ({ x: p.x + by.x, y: p.y + by.y })) }
          : x,
      ),
    })),

  /**
   * For an ordinary outline the index is the corner being dragged. For an oval
   * it is which of the four axis handles, and the whole shape is regenerated —
   * one door, because the plan has one gesture and should not have to know
   * which kind of bed it has hold of.
   */
  moveStructurePoint: (id, index, to) =>
    set((s) => ({
      // Keyed on the corner, so dragging one is a single undo step, and moving
      // two corners in turn stays two.
      ...pushHistory(s, 'Reshape', `point:${id}:${index}`),
      structures: s.structures.map((x) =>
        x.id === id
          ? {
              ...x,
              points: isOval(x)
                ? resizeOval(x.points, index, to)
                : x.points.map((p, i) => (i === index ? to : p)),
            }
          : x,
      ),
    })),

  redrawStructure: (id) =>
    set((s) => {
      const structure = s.structures.find((x) => x.id === id);
      if (structure === undefined) return {};
      return {
        tool: structure.kind === 'wall' ? 'draw-wall' : 'draw-bed',
        redrawingId: id,
        draft: [],
        draftCursor: null,
        // The old shape stays on the plan while the new one is drawn, as
        // something to line the new outline up against.
        selectedStructureId: id,
        selectedId: null,
      };
    }),

  /**
   * Another wall or bed exactly like this one, beside it.
   *
   * Beds come in pairs and runs far more often than they come alone — two
   * matching borders either side of a path, a row of them down a plot — and
   * redrawing the second by hand never quite matches the first.
   *
   * Where it goes is chosen the same way a duplicated plant's is: beside it if
   * there is room, and if not, wherever on the plot there is. A copy that lands
   * off the plot is drawn on ground that is not the garden and is a nuisance to
   * drag back, so the offsets are tried in turn and the whole outline has to
   * fit. If none does — a bed nearly as big as the plot — it is nudged clear of
   * its original anyway, because the person asked for one and can move it.
   */
  duplicateStructure: (id) =>
    set((s) => {
      const source = s.structures.find((x) => x.id === id);
      if (source === undefined) return {};

      const xs = source.points.map((p) => p.x);
      const ys = source.points.map((p) => p.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const depth = Math.max(...ys) - Math.min(...ys);
      // Clear of the original rather than overlapping it: two beds a few
      // centimetres apart read as one lumpy bed, and the taller one wins the
      // overlap, which is not what "another one" means.
      const gap = 0.4;
      const shifts = [
        { x: width + gap, y: 0 },
        { x: -(width + gap), y: 0 },
        { x: 0, y: depth + gap },
        { x: 0, y: -(depth + gap) },
      ];
      const moved = (by: Vec2) => source.points.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));
      const onThePlot = (pts: Vec2[]) => pts.every((p) => pointInPolygon(p, s.plot));

      const fits = shifts.map(moved).find(onThePlot);
      const points = fits ?? moved({ x: gap, y: gap });

      const copy: Structure = {
        ...source,
        id: newId(),
        points,
        // A fresh seed, so the sketchy line work of the two differs as two
        // built things do, rather than being the same drawing twice.
        seed: Math.floor(Math.random() * 1e9),
      };
      return {
        ...pushHistory(s, 'Add another'),
        structures: [...s.structures, copy],
        selectedStructureId: copy.id,
        selectedId: null,
      };
    }),

  removeStructure: (id) =>
    set((s) => ({
      ...pushHistory(s, 'Remove structure'),
      structures: s.structures.filter((x) => x.id !== id),
      selectedStructureId: s.selectedStructureId === id ? null : s.selectedStructureId,
    })),

  setStructureHeight: (id, metres) =>
    set((s) => ({
      // Coalesced: dragging the height slider fires continuously, and one undo
      // step per pixel would bury whatever came before it.
      ...pushHistory(s, 'Change height', `height:${id}`),
      structures: s.structures.map((x) =>
        x.id === id ? { ...x, height: clampHeight(x.kind, metres) } : x,
      ),
    })),

  setStructureThickness: (id, metres) =>
    set((s) => ({
      ...pushHistory(s, 'Change thickness', `thickness:${id}`),
      structures: s.structures.map((x) =>
        x.id === id ? { ...x, thickness: clampThickness(metres) } : x,
      ),
    })),
});
