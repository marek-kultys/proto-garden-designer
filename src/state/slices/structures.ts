import { clampHeight, clampThickness } from '../../model/structures';
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

  moveStructurePoint: (id, index, to) =>
    set((s) => ({
      // Keyed on the corner, so dragging one is a single undo step, and moving
      // two corners in turn stays two.
      ...pushHistory(s, 'Reshape', `point:${id}:${index}`),
      structures: s.structures.map((x) =>
        x.id === id
          ? { ...x, points: x.points.map((p, i) => (i === index ? to : p)) }
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
