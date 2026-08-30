import { create } from 'zustand';
import { rectanglePlot } from '../model/geometry';
import { getSpecies } from '../model/plants';
import {
  DEFAULT_EYE_HEIGHT,
  clampEyeHeight,
  clampGroundHeight,
  clampPitch,
  normaliseBearing,
  type Observer,
} from '../model/panorama';
import type { PlantInstance, Plot, Site, TimeState, Vec2 } from '../model/types';
import {
  describeFailure,
  describeSkipped,
  makeProjectFile,
  type Design,
} from './projectFile';
import {
  deleteProject as deleteStoredProject,
  newProjectId,
  readProject,
  writeProject,
} from './projectStorage';

export type Tool = 'select' | 'draw-plot';

/** Which drawing occupies the strip under the plan. */
export type StageView = 'elevation' | 'panorama';

export interface LocationPreset {
  label: string;
  latitude: number;
  longitude: number;
  altitude: number;
}

export const LOCATION_PRESETS: LocationPreset[] = [
  { label: 'London', latitude: 51.51, longitude: -0.13, altitude: 11 },
  { label: 'Bristol', latitude: 51.45, longitude: -2.59, altitude: 11 },
  { label: 'Manchester', latitude: 53.48, longitude: -2.24, altitude: 38 },
  { label: 'Edinburgh', latitude: 55.95, longitude: -3.19, altitude: 47 },
  { label: 'Penzance', latitude: 50.12, longitude: -5.54, altitude: 20 },
  { label: 'Aviemore', latitude: 57.19, longitude: -3.83, altitude: 228 },
];

const DEFAULT_PLOT: Plot = rectanglePlot(14, 10);

const DEFAULT_SITE: Site = {
  latitude: 51.51,
  longitude: -0.13,
  altitude: 11,
  northAngle: 0,
  dst: true,
  label: 'London',
};

const DEFAULT_PROJECT_NAME = 'Untitled garden';

/**
 * The fingerprint of an untouched design, so a freshly opened app does not
 * claim to have unsaved changes before anything has been done to it.
 */
const EMPTY_FINGERPRINT = JSON.stringify({
  plot: DEFAULT_PLOT,
  plants: [] as PlantInstance[],
  site: DEFAULT_SITE,
});

/**
 * A saved design is the plot, the planting and the site — not what you are
 * looking at. The same reasoning as undo below: the season slider and the
 * direction you are facing are ways of inspecting a design, not part of one, and
 * reopening a garden to find the clock wound back to whenever it was saved would
 * be a surprise rather than a restoration.
 */
export function currentDesign(s: AppState): Design {
  return { plot: s.plot, plants: s.plants, site: s.site };
}

/**
 * Whether there is anything to lose.
 *
 * Derived by comparison rather than kept as a flag, because a flag has to be
 * cleared by hand at every edit site and will eventually be missed on one.
 */
export function designFingerprint(design: Design): string {
  return JSON.stringify(design);
}

export function isDirty(s: AppState): boolean {
  return designFingerprint(currentDesign(s)) !== s.savedFingerprint;
}

export type SaveOutcome = { ok: true; name: string } | { ok: false; detail: string };
export type OpenOutcome =
  | { ok: true; name: string; note: string | null }
  | { ok: false; detail: string };

/**
 * Undo.
 *
 * What it covers is the design — the planting and the plot outline — and not
 * what you are looking at. Scrubbing to April, turning to face west or moving
 * the eye are not edits and would only fill the history with noise; every one of
 * them is also trivially reversible by hand, which is exactly what a destroyed
 * planting is not.
 */
interface Snapshot {
  plants: PlantInstance[];
  plot: Plot;
  selectedId: string | null;
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
  return { plants: s.plants, plot: s.plot, selectedId: s.selectedId };
}

function restore(snap: Snapshot) {
  return {
    plants: snap.plants,
    plot: snap.plot,
    // The selection may name a plant that no longer exists on this side of the
    // edit, which would leave a highlight round nothing.
    selectedId: snap.plants.some((p) => p.id === snap.selectedId) ? snap.selectedId : null,
  };
}

function pushHistory(s: AppState, label: string, coalesceKey?: string) {
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

export interface AppState {
  plot: Plot;
  plants: PlantInstance[];
  site: Site;
  time: TimeState;
  baseYear: number;

  tool: Tool;
  draft: Vec2[];
  draftCursor: Vec2 | null;
  selectedId: string | null;
  sightLine: { a: Vec2; b: Vec2 };
  observer: Observer;
  stageView: StageView;
  /**
   * The horizontal field the 360° view is actually rendering. Derived from the
   * panel size rather than chosen, and published here so the view cone drawn on
   * the plan matches what the picture below it shows.
   */
  renderedFov: number;

  showShadows: boolean;
  showGrid: boolean;
  showOverlay: boolean;
  playing: boolean;

  past: HistoryEntry[];
  future: HistoryEntry[];
  lastPushKey: string | null;
  lastPushAt: number;

  /** Null until the design has been saved under a name at least once. */
  projectId: string | null;
  projectName: string;
  /** The design as it was when last saved, for comparison. See `isDirty`. */
  savedFingerprint: string;

  addPlant: (speciesId: string, at: Vec2) => void;
  movePlant: (id: string, at: Vec2) => void;
  removePlant: (id: string) => void;
  /** Plant another of the same kind, just off the original. */
  duplicatePlant: (id: string) => void;
  clearPlants: () => void;
  select: (id: string | null) => void;
  /** Step the selection through the instances of one species, for the count badge. */
  selectNextOfSpecies: (speciesId: string) => void;

  setTime: (patch: Partial<TimeState>) => void;
  setSite: (patch: Partial<Site>) => void;

  setTool: (tool: Tool) => void;
  pushDraftPoint: (p: Vec2) => void;
  setDraftCursor: (p: Vec2 | null) => void;
  commitDraft: () => void;
  cancelDraft: () => void;
  resetPlot: (width: number, height: number) => void;

  setSightEnd: (end: 'a' | 'b', p: Vec2) => void;
  moveObserver: (p: Vec2) => void;
  turnObserver: (byDegrees: number) => void;
  setHeading: (heading: number) => void;
  setFov: (fov: number) => void;
  setPitch: (pitch: number) => void;
  setEyeHeight: (m: number) => void;
  setGroundHeight: (m: number) => void;
  setStageView: (view: StageView) => void;
  undo: () => void;
  redo: () => void;

  newProject: () => void;
  /** Save over the open project, or create one when there is none yet. */
  saveProject: () => SaveOutcome;
  /** Save under a new name, leaving the original where it was. */
  saveProjectAs: (name: string) => SaveOutcome;
  renameProject: (name: string) => void;
  openProject: (id: string) => OpenOutcome;
  deleteSavedProject: (id: string) => void;
  setRenderedFov: (fov: number) => void;
  toggle: (key: 'showShadows' | 'showGrid' | 'showOverlay' | 'playing') => void;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `p${counter}-${Math.floor(Math.random() * 1e6)}`;
}

export const useStore = create<AppState>((set, get) => ({
  plot: DEFAULT_PLOT,
  plants: [],
  site: DEFAULT_SITE,
  // Midday in early June, on the day the garden goes in.
  time: { hour: 13, doy: 155, year: 0 },
  baseYear: new Date().getFullYear(),

  tool: 'select',
  draft: [],
  draftCursor: null,
  selectedId: null,
  sightLine: { a: { x: 0.5, y: 5 }, b: { x: 13.5, y: 5 } },
  // Standing at the near edge looking up the garden, which is where anyone
  // stands when they walk out of the house.
  observer: {
    x: 7,
    y: 9.2,
    heading: 0,
    fov: 90,
    pitch: 12,
    eyeHeight: DEFAULT_EYE_HEIGHT,
    groundHeight: 0,
  },
  stageView: 'elevation',
  renderedFov: 90,

  showShadows: true,
  showGrid: true,
  showOverlay: false,
  playing: false,

  past: [],
  future: [],
  lastPushKey: null,
  lastPushAt: 0,

  projectId: null,
  projectName: DEFAULT_PROJECT_NAME,
  savedFingerprint: EMPTY_FINGERPRINT,

  addPlant: (speciesId, at) =>
    set((s) => {
      const history = pushHistory(s, 'Add plant');
      const plant: PlantInstance = {
        id: newId(),
        speciesId,
        x: at.x,
        y: at.y,
        seed: Math.floor(Math.random() * 1e9),
      };
      return { ...history, plants: [...s.plants, plant], selectedId: plant.id };
    }),

  movePlant: (id, at) =>
    set((s) => ({
      // Keyed on the plant, so one drag is one undo step but moving two plants
      // in turn stays two.
      ...pushHistory(s, 'Move plant', `move:${id}`),
      plants: s.plants.map((p) => (p.id === id ? { ...p, x: at.x, y: at.y } : p)),
    })),

  removePlant: (id) =>
    set((s) => ({
      ...pushHistory(s, 'Remove plant'),
      plants: s.plants.filter((p) => p.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  duplicatePlant: (id) =>
    set((s) => {
      const source = s.plants.find((p) => p.id === id);
      if (!source) return {};
      const history = pushHistory(s, 'Add another');
      const spread = getSpecies(source.speciesId).matureSpread;
      // Offset by a share of the mature spread so the copy lands beside its
      // parent rather than exactly on top of it, where it would be invisible
      // and impossible to grab.
      const step = Math.max(0.4, Math.min(2.5, spread * 0.55));
      const copy: PlantInstance = {
        id: newId(),
        speciesId: source.speciesId,
        x: source.x + step,
        y: source.y + step * 0.35,
        // A fresh seed: a second plant of the same kind, not a clone of the
        // same individual. Two hostas in a border are never identical.
        seed: Math.floor(Math.random() * 1e9),
      };
      return { ...history, plants: [...s.plants, copy], selectedId: copy.id };
    }),

  // The one genuinely destructive action here, and the reason undo exists.
  clearPlants: () =>
    set((s) => ({ ...pushHistory(s, 'Clear planting'), plants: [], selectedId: null })),
  select: (id) => set({ selectedId: id }),

  selectNextOfSpecies: (speciesId) =>
    set((s) => {
      const matches = s.plants.filter((p) => p.speciesId === speciesId);
      if (matches.length === 0) return {};
      const at = matches.findIndex((p) => p.id === s.selectedId);
      // Tapping the badge repeatedly walks round the group rather than sticking
      // on the first one, which is how you find the third of five hostas.
      return { selectedId: matches[(at + 1) % matches.length].id };
    }),

  setTime: (patch) => set((s) => ({ time: { ...s.time, ...patch } })),
  setSite: (patch) => set((s) => ({ site: { ...s.site, ...patch } })),

  setTool: (tool) => set({ tool, draft: [], draftCursor: null }),
  pushDraftPoint: (p) => set((s) => ({ draft: [...s.draft, p] })),
  setDraftCursor: (p) => set({ draftCursor: p }),

  commitDraft: () =>
    set((s) => {
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

  cancelDraft: () => set({ draft: [], draftCursor: null, tool: 'select' }),

  resetPlot: (width, height) =>
    set((s) => ({
      ...pushHistory(s, 'Set plot'),
      plot: rectanglePlot(width, height),
      tool: 'select',
      draft: [],
      sightLine: { a: { x: 0.5, y: height / 2 }, b: { x: width - 0.5, y: height / 2 } },
      observer: {
        ...useStore.getState().observer,
        x: width / 2,
        y: height - 0.8,
        heading: 0,
        pitch: 12,
      },
    })),

  setSightEnd: (end, p) => set((s) => ({ sightLine: { ...s.sightLine, [end]: p } })),

  moveObserver: (p) => set((s) => ({ observer: { ...s.observer, x: p.x, y: p.y } })),
  turnObserver: (byDegrees) =>
    set((s) => ({
      observer: { ...s.observer, heading: normaliseBearing(s.observer.heading + byDegrees) },
    })),
  setHeading: (heading) =>
    set((s) => ({ observer: { ...s.observer, heading: normaliseBearing(heading) } })),
  setFov: (fov) =>
    set((s) => ({ observer: { ...s.observer, fov: Math.max(30, Math.min(160, fov)) } })),
  setPitch: (pitch) => set((s) => ({ observer: { ...s.observer, pitch: clampPitch(pitch) } })),
  setEyeHeight: (m) =>
    set((s) => ({ observer: { ...s.observer, eyeHeight: clampEyeHeight(m) } })),
  setGroundHeight: (m) =>
    set((s) => ({ observer: { ...s.observer, groundHeight: clampGroundHeight(m) } })),
  setStageView: (stageView) => set({ stageView }),

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
  newProject: () =>
    set((s) => ({
      ...pushHistory(s, 'New project'),
      plot: DEFAULT_PLOT,
      plants: [],
      site: DEFAULT_SITE,
      selectedId: null,
      sightLine: { a: { x: 0.5, y: 5 }, b: { x: 13.5, y: 5 } },
      observer: { ...s.observer, x: 7, y: 9.2, heading: 0, pitch: 12 },
      projectId: null,
      projectName: DEFAULT_PROJECT_NAME,
      savedFingerprint: EMPTY_FINGERPRINT,
    })),

  saveProject: () => {
    const s = get();
    // No id yet means this design has never been saved; saving is what names it.
    const id = s.projectId ?? newProjectId();
    const design = currentDesign(s);
    const result = writeProject(id, makeProjectFile(s.projectName, design, new Date()));
    if (!result.ok) return { ok: false, detail: result.detail };
    set({ projectId: id, savedFingerprint: designFingerprint(design) });
    return { ok: true, name: s.projectName };
  },

  saveProjectAs: (name) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return { ok: false, detail: 'A project needs a name.' };
    const s = get();
    const id = newProjectId();
    const design = currentDesign(s);
    const result = writeProject(id, makeProjectFile(trimmed, design, new Date()));
    if (!result.ok) return { ok: false, detail: result.detail };
    set({ projectId: id, projectName: trimmed, savedFingerprint: designFingerprint(design) });
    return { ok: true, name: trimmed };
  },

  renameProject: (name) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const s = get();
    set({ projectName: trimmed });
    if (s.projectId === null) return;
    // Rewrite the *stored* design under the new name rather than the current
    // one, so renaming cannot quietly save edits the user has not saved yet.
    const stored = readProject(s.projectId);
    if (stored !== null && stored.ok) {
      writeProject(s.projectId, makeProjectFile(trimmed, stored.design, new Date(stored.savedAt)));
    }
  },

  openProject: (id) => {
    const result = readProject(id);
    if (result === null) return { ok: false, detail: 'That design is no longer in this browser.' };
    if (!result.ok) return { ok: false, detail: describeFailure(result.failure) };

    const { design, name } = result;
    // Fresh instance ids. The ones in the file were minted in another session
    // and could collide with ids this session goes on to create. The seed —
    // which is what makes a plant look like that particular individual — is
    // carried across untouched.
    const plants = design.plants.map((p) => ({ ...p, id: newId() }));

    const xs = design.plot.map((p) => p.x);
    const ys = design.plot.map((p) => p.y);
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;

    set((s) => ({
      ...pushHistory(s, 'Open project'),
      plot: design.plot,
      plants,
      site: design.site,
      selectedId: null,
      // The sight line and the eye were placed for whatever plot was here
      // before and can land outside this one — which is how the elevation strip
      // comes up empty and the 360° view ends up underground. Same repositioning
      // as drawing a new outline.
      sightLine: { a: { x: Math.min(...xs), y: midY }, b: { x: Math.max(...xs), y: midY } },
      observer: {
        ...s.observer,
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: Math.max(...ys) - 0.8,
      },
      projectId: id,
      projectName: name,
      savedFingerprint: designFingerprint({ ...design, plants }),
    }));

    return { ok: true, name, note: describeSkipped(result.skipped) };
  },

  deleteSavedProject: (id) => {
    deleteStoredProject(id);
    // Deleting the design that is open leaves it on screen but no longer
    // stored, which is exactly the state of one that was never saved.
    if (get().projectId === id) set({ projectId: null });
  },

  setRenderedFov: (renderedFov) =>
    set((s) => (Math.abs(s.renderedFov - renderedFov) < 0.5 ? {} : { renderedFov })),

  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<AppState>),
}));
