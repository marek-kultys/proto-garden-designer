import type { PlantInstance, Plot, Site, Structure } from '../../model/types';
import type { SliceOf } from '../slice';
import type { AppState } from '../store';

/**
 * Undo.
 *
 * What it covers is the design — the planting, the plot outline, what is built
 * on it and the site it stands on — and not what you are looking at. Scrubbing
 * to April, turning to face west or moving the eye are not edits and would only
 * fill the history with noise; every one of them is also trivially reversible by
 * hand, which is exactly what a destroyed planting is not.
 *
 * The site is here because it is part of the design: it is saved with the file
 * and it is what makes a file count as unsaved. It was left out at first, and
 * the result was worse than not being able to undo a turn of the north dial —
 * pressing undo after turning it silently took back the *previous* edit, so a
 * plant disappeared instead.
 */
interface Snapshot {
  plants: PlantInstance[];
  plot: Plot;
  structures: Structure[];
  site: Site;
  selectedId: string | null;
  selectedStructureId: string | null;
}

interface HistoryEntry {
  snap: Snapshot;
  label: string;
}

const HISTORY_LIMIT = 80;

/**
 * How long two edits of the same kind stay mergeable.
 *
 * Dragging a plant fires an update on every pointer move, and one undo step per
 * frame would be useless. Rather than have the pointer handlers announce when a
 * gesture starts and ends — which is easy to get wrong and easy to forget in a
 * new handler — consecutive edits carrying the same key inside this window fold
 * into the one entry, so a drag undoes as a single move.
 */
const COALESCE_MS = 600;

function snapshot(s: AppState): Snapshot {
  return {
    plants: s.plants,
    plot: s.plot,
    structures: s.structures,
    site: s.site,
    selectedId: s.selectedId,
    selectedStructureId: s.selectedStructureId,
  };
}

function restore(snap: Snapshot) {
  return {
    plants: snap.plants,
    plot: snap.plot,
    structures: snap.structures,
    site: snap.site,
    // The selection may name a plant that no longer exists on this side of the
    // edit, which would leave a highlight round nothing.
    selectedId: snap.plants.some((p) => p.id === snap.selectedId) ? snap.selectedId : null,
    selectedStructureId: snap.structures.some((x) => x.id === snap.selectedStructureId)
      ? snap.selectedStructureId
      : null,
  };
}

export function pushHistory(s: AppState, label: string, coalesceKey?: string) {
  const now = Date.now();
  const merge =
    coalesceKey !== undefined &&
    coalesceKey === s.lastPushKey &&
    now - s.lastPushAt < COALESCE_MS &&
    s.past.length > 0;

  return {
    // When merging, the entry already on the stack holds the state from before
    // the gesture began, which is precisely what undo should return to.
    past: merge ? s.past : [...s.past, { snap: snapshot(s), label }].slice(-HISTORY_LIMIT),
    // Any new edit abandons the branch you had redone away from.
    future: [] as HistoryEntry[],
    lastPushKey: coalesceKey ?? null,
    lastPushAt: now,
  };
}

export interface HistorySlice {
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastPushKey: string | null;
  lastPushAt: number;
  undo: () => void;
  redo: () => void;
}

export const historySlice: SliceOf<HistorySlice> = (set) => ({
  past: [],
  future: [],
  lastPushKey: null,
  lastPushAt: 0,

  undo: () =>
    set((s) => {
      const entry = s.past[s.past.length - 1];
      if (!entry) return {};
      return {
        ...restore(entry.snap),
        past: s.past.slice(0, -1),
        future: [{ snap: snapshot(s), label: entry.label }, ...s.future].slice(0, HISTORY_LIMIT),
        lastPushKey: null,
      };
    }),

  redo: () =>
    set((s) => {
      const entry = s.future[0];
      if (!entry) return {};
      return {
        ...restore(entry.snap),
        past: [...s.past, { snap: snapshot(s), label: entry.label }].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        lastPushKey: null,
      };
    }),
});
