import { rectanglePlot } from '../../model/geometry';
import { ovalOutline } from '../../model/oval';
import {
  DEFAULT_BED_HEIGHT,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  minimumPoints,
} from '../../model/structures';
import type { Plot, Structure, Vec2 } from '../../model/types';
import { newId } from '../ids';
import type { SliceOf } from '../slice';
import { pushHistory } from './history';

/**
 * What a click on the plan does.
 *
 * The drawing tools share one drafting mechanism — points collected as you
 * click, committed when you finish — because they are the same gesture
 * producing different things. Only `commitDraft` knows the difference.
 *
 * The oval tool is the same gesture cut short: two clicks give opposite corners
 * of the box the oval fills, and the second commits on its own rather than
 * waiting for an Enter that would have nothing left to add.
 */
export type Tool = 'select' | 'draw-plot' | 'draw-wall' | 'draw-bed' | 'draw-oval-bed';

export function isDrawingTool(tool: Tool): boolean {
  return tool !== 'select';
}

export const DEFAULT_PLOT: Plot = rectanglePlot(14, 10);

export interface PlotSlice {
  plot: Plot;
  tool: Tool;
  draft: Vec2[];
  draftCursor: Vec2 | null;
  /**
   * Set while an existing structure's outline is being drawn again. Committing
   * then replaces that structure's shape rather than adding another one beside
   * it, which is what "redraw" has to mean.
   */
  redrawingId: string | null;
  setTool: (tool: Tool) => void;
  pushDraftPoint: (p: Vec2) => void;
  setDraftCursor: (p: Vec2 | null) => void;
  commitDraft: () => void;
  cancelDraft: () => void;
  resetPlot: (width: number, height: number) => void;
}

export const plotSlice: SliceOf<PlotSlice> = (set) => ({
  plot: DEFAULT_PLOT,
  tool: 'select',
  draft: [],
  draftCursor: null,
  redrawingId: null,

  setTool: (tool) => set({ tool, draft: [], draftCursor: null, redrawingId: null }),
  pushDraftPoint: (p) => set((s) => ({ draft: [...s.draft, p] })),
  setDraftCursor: (p) => set({ draftCursor: p }),

  commitDraft: () =>
    set((s) => {
      // A wall or a bed is the same gesture as a plot outline, producing a
      // different thing — so the drafting, the preview and the cancel are
      // shared, and only the commit knows which tool was in hand.
      if (s.tool === 'draw-oval-bed') {
        // Two corners of a box, and the oval fills it. Fewer than two means it
        // was abandoned; the original of a redraw is left exactly as it was.
        if (s.draft.length < 2) {
          return { tool: 'select', draft: [], draftCursor: null, redrawingId: null };
        }
        const points = ovalOutline(s.draft[0], s.draft[1]);

        if (s.redrawingId !== null) {
          const id = s.redrawingId;
          return {
            ...pushHistory(s, 'Redraw shape'),
            structures: s.structures.map((x) =>
              x.id === id ? { ...x, points, shape: 'oval' as const } : x,
            ),
            selectedStructureId: id,
            draft: [],
            draftCursor: null,
            redrawingId: null,
            tool: 'select',
          };
        }

        const oval: Structure = {
          id: newId(),
          kind: 'bed',
          shape: 'oval',
          points,
          height: DEFAULT_BED_HEIGHT,
          thickness: DEFAULT_WALL_THICKNESS,
          seed: Math.floor(Math.random() * 1e9),
        };
        return {
          ...pushHistory(s, 'Draw oval bed'),
          structures: [...s.structures, oval],
          selectedStructureId: oval.id,
          selectedId: null,
          draft: [],
          draftCursor: null,
          tool: 'select',
        };
      }

      if (s.tool === 'draw-wall' || s.tool === 'draw-bed') {
        const kind = s.tool === 'draw-wall' ? 'wall' : 'bed';
        if (s.draft.length < minimumPoints(kind)) {
          // Abandoned before it was a shape. The original is left exactly as it
          // was — a half-finished redraw must never destroy what it replaces.
          return { tool: 'select', draft: [], draftCursor: null, redrawingId: null };
        }
        if (s.redrawingId !== null) {
          const id = s.redrawingId;
          return {
            ...pushHistory(s, 'Redraw shape'),
            structures: s.structures.map((x) => (x.id === id ? { ...x, points: s.draft } : x)),
            selectedStructureId: id,
            draft: [],
            draftCursor: null,
            redrawingId: null,
            tool: 'select',
          };
        }

        const structure: Structure = {
          id: newId(),
          kind,
          points: s.draft,
          height: kind === 'wall' ? DEFAULT_WALL_HEIGHT : DEFAULT_BED_HEIGHT,
          thickness: DEFAULT_WALL_THICKNESS,
          seed: Math.floor(Math.random() * 1e9),
        };
        return {
          ...pushHistory(s, kind === 'wall' ? 'Draw wall' : 'Draw raised bed'),
          structures: [...s.structures, structure],
          // Selected on arrival, because the next thing anyone does is set its
          // height, and the height control lives with the selection.
          selectedStructureId: structure.id,
          selectedId: null,
          draft: [],
          draftCursor: null,
          tool: 'select',
        };
      }

      if (s.draft.length < 3) return { tool: 'select', draft: [], draftCursor: null };
      // Keep the sight line inside whatever was just drawn.
      const xs = s.draft.map((p) => p.x);
      const ys = s.draft.map((p) => p.y);
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      return {
        ...pushHistory(s, 'Draw plot'),
        plot: s.draft,
        draft: [],
        draftCursor: null,
        tool: 'select',
        sightLine: {
          a: { x: Math.min(...xs), y: midY },
          b: { x: Math.max(...xs), y: midY },
        },
        observer: {
          ...s.observer,
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          y: Math.max(...ys) - 0.8,
        },
      };
    }),

  cancelDraft: () => set({ draft: [], draftCursor: null, tool: 'select', redrawingId: null }),

  resetPlot: (width, height) =>
    set((s) => ({
      ...pushHistory(s, 'Set plot'),
      plot: rectanglePlot(width, height),
      tool: 'select',
      draft: [],
      sightLine: { a: { x: 0.5, y: height / 2 }, b: { x: width - 0.5, y: height / 2 } },
      observer: {
        // Reaching for the store by name here used to be the only way in; `s`
        // is the same state object, and asking the store for itself from
        // inside itself is a loop waiting to be closed.
        ...s.observer,
        x: width / 2,
        y: height - 0.8,
        heading: 0,
        pitch: 12,
      },
    })),
});
