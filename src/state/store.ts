import { create } from 'zustand';
import { polygonBounds, rectanglePlot } from '../model/geometry';
import { DEFAULT_SLICE_DEPTH, SLICE_DEPTH_RANGE } from '../render/constants';
import { getSpecies } from '../model/plants';
import {
  DEFAULT_EYE_HEIGHT,
  clampEyeHeight,
  clampGroundHeight,
  clampPitch,
  normaliseBearing,
  type Observer,
} from '../model/panorama';
import {
  DEFAULT_BED_HEIGHT,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  clampHeight,
  clampThickness,
  minimumPoints,
} from '../model/structures';
import type { PlantInstance, Plot, Site, Structure, TimeState, Vec2 } from '../model/types';
import {
  describeFailure,
  describeLosses,
  makeProjectFile,
  renamedProjectFile,
  type Design,
} from './projectFile';
import {
  deleteProject as deleteStoredProject,
  newProjectId,
  readProject,
  writeProject,
} from './projectStorage';

/**
 * What a click on the plan does.
 *
 * The three drawing tools share one drafting mechanism — points collected as
 * you click, committed when you finish — because they are the same gesture
 * producing different things. Only `commitDraft` knows the difference.
 */
export type Tool = 'select' | 'draw-plot' | 'draw-wall' | 'draw-bed';

export function isDrawingTool(tool: Tool): boolean {
  return tool !== 'select';
}

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
  // Level until told otherwise; south is the fall a slope most often has.
  slopeFall: 0,
  slopeDirection: 180,
};

const DEFAULT_PROJECT_NAME = 'Untitled garden';

/**
 * How old a plant is when it goes in, in years of growth already made.
 *
 * Nursery stock is what you buy by default. Ten years is the semi-mature
 * specimen a designer brings in when a garden needs structure on day one rather
 * than in a decade — one tree, usually, at many times the price.
 */
export const PLACEMENT_AGES = [
  { label: 'Nursery stock', years: 0 },
  { label: '10 years old', years: 10 },
];

/**
 * The fingerprint of an untouched design, so a freshly opened app does not
 * claim to have unsaved changes before anything has been done to it.
 */
const EMPTY_FINGERPRINT = JSON.stringify({
  plot: DEFAULT_PLOT,
  plants: [] as PlantInstance[],
  site: DEFAULT_SITE,
  structures: [] as Structure[],
});

/**
 * A saved design is the plot, the planting and the site — not what you are
 * looking at. The same reasoning as undo below: the season slider and the
 * direction you are facing are ways of inspecting a design, not part of one, and
 * reopening a garden to find the clock wound back to whenever it was saved would
 * be a surprise rather than a restoration.
 */
export function currentDesign(s: AppState): Design {
  return { plot: s.plot, plants: s.plants, site: s.site, structures: s.structures };
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

/**
 * Put a design on screen, from wherever it came — storage or an imported file.
 *
 * Shared so that opening and importing cannot diverge: any care taken over one
 * is automatically taken over the other.
 */
function applyDesign(
  s: AppState,
  name: string,
  design: Design,
  projectId: string | null,
  label: string,
) {
  // Fresh instance ids. The ones in the file were minted in another session —
  // or on another machine entirely, for an imported design — and could collide
  // with ids this session goes on to create. The seed, which is what makes a
  // plant look like that particular individual, is carried across untouched.
  const plants = design.plants.map((p) => ({ ...p, id: newId() }));

  const xs = design.plot.map((p) => p.x);
  const ys = design.plot.map((p) => p.y);
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;

  return {
    ...pushHistory(s, label),
    plot: design.plot,
    plants,
    structures: design.structures,
    site: design.site,
    selectedId: null,
    selectedStructureId: null,
    // The sight line and the eye were placed for whatever plot was here before
    // and can land outside this one — which is how the elevation strip comes up
    // empty and the 360° view ends up underground. Same repositioning as
    // drawing a new outline.
    sightLine: { a: { x: Math.min(...xs), y: midY }, b: { x: Math.max(...xs), y: midY } },
    observer: {
      ...s.observer,
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: Math.max(...ys) - 0.8,
    },
    projectId,
    projectName: name,
    savedFingerprint: designFingerprint({ ...design, plants }),
  };
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
  structures: Structure[];
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
    selectedId: s.selectedId,
    selectedStructureId: s.selectedStructureId,
  };
}

function restore(snap: Snapshot) {
  return {
    plants: snap.plants,
    plot: snap.plot,
    structures: snap.structures,
    // The selection may name a plant that no longer exists on this side of the
    // edit, which would leave a highlight round nothing.
    selectedId: snap.plants.some((p) => p.id === snap.selectedId) ? snap.selectedId : null,
    selectedStructureId: snap.structures.some((x) => x.id === snap.selectedStructureId)
      ? snap.selectedStructureId
      : null,
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
  structures: Structure[];
  site: Site;
  time: TimeState;
  baseYear: number;

  tool: Tool;
  draft: Vec2[];
  draftCursor: Vec2 | null;
  selectedId: string | null;
  selectedStructureId: string | null;
  sightLine: { a: Vec2; b: Vec2 };
  /**
   * Depth of the slice the elevation shows, in metres. A way of looking rather
   * than part of the design, like the sight line itself, so it is not saved.
   */
  sliceDepth: number;
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

  /**
   * The head start given to the next plant placed. A tool setting rather than
   * part of the design, so it is deliberately not saved with one.
   */
  placementAge: number;

  /**
   * Set while an existing structure's outline is being drawn again. Committing
   * then replaces that structure's shape rather than adding another one beside
   * it, which is what "redraw" has to mean.
   */
  redrawingId: string | null;

  /** Null until the design has been saved under a name at least once. */
  projectId: string | null;
  projectName: string;
  /** The design as it was when last saved, for comparison. See `isDirty`. */
  savedFingerprint: string;

  addPlant: (speciesId: string, at: Vec2) => void;
  setPlacementAge: (years: number) => void;
  /** Turn a climber's plane to follow the fence it is growing on. */
  setPlantFacing: (id: string, degrees: number) => void;
  movePlant: (id: string, at: Vec2) => void;
  removePlant: (id: string) => void;
  /** Plant another of the same kind, just off the original. */
  duplicatePlant: (id: string) => void;
  clearPlants: () => void;
  select: (id: string | null) => void;
  /** Step the selection through the instances of one species, for the count badge. */
  selectNextOfSpecies: (speciesId: string) => void;

  moveStructure: (id: string, by: Vec2) => void;
  /** Drag one corner of a wall or bed, reshaping it. */
  moveStructurePoint: (id: string, index: number, to: Vec2) => void;
  /** Draw the outline again from scratch, keeping its height and thickness. */
  redrawStructure: (id: string) => void;
  removeStructure: (id: string) => void;
  setStructureHeight: (id: string, metres: number) => void;
  setStructureThickness: (id: string, metres: number) => void;
  selectStructure: (id: string | null) => void;

  setTime: (patch: Partial<TimeState>) => void;
  setSite: (patch: Partial<Site>) => void;

  setTool: (tool: Tool) => void;
  pushDraftPoint: (p: Vec2) => void;
  setDraftCursor: (p: Vec2 | null) => void;
  commitDraft: () => void;
  cancelDraft: () => void;
  resetPlot: (width: number, height: number) => void;

  setSightEnd: (end: 'a' | 'b', p: Vec2) => void;
  setSliceDepth: (metres: number) => void;
  moveObserver: (p: Vec2) => void;
  /** Put the eye back in the middle of the plot, for when it has been lost. */
  centreObserver: () => void;
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
  /** Put an already-parsed design on screen, as an unsaved project. */
  importDesign: (name: string, design: Design) => void;
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
  structures: [],
  site: DEFAULT_SITE,
  // Midday in early June, on the day the garden goes in.
  time: { hour: 13, doy: 155, year: 0 },
  baseYear: new Date().getFullYear(),

  tool: 'select',
  draft: [],
  draftCursor: null,
  selectedId: null,
  selectedStructureId: null,
  sightLine: { a: { x: 0.5, y: 5 }, b: { x: 13.5, y: 5 } },
  sliceDepth: DEFAULT_SLICE_DEPTH,
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

  placementAge: 0,
  redrawingId: null,
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
        plantedAge: s.placementAge,
      };
      return { ...history, plants: [...s.plants, plant], selectedId: plant.id };
    }),

  setPlacementAge: (years) => set({ placementAge: Math.max(0, years) }),

  setPlantFacing: (id, degrees) =>
    set((s) => ({
      // Coalesced: turning the dial fires continuously, and one undo step per
      // degree would bury whatever came before it.
      ...pushHistory(s, 'Turn climber', `facing:${id}`),
      // A plane reads the same from either side, so the useful range is a half
      // turn; anything else is the same plane described twice.
      plants: s.plants.map((p) => (p.id === id ? { ...p, facing: ((degrees % 180) + 180) % 180 } : p)),
    })),

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
        // The same age as the one it was taken from, not whatever the tool is
        // currently set to — "add another" means another of *that* plant.
        plantedAge: source.plantedAge,
      };
      return { ...history, plants: [...s.plants, copy], selectedId: copy.id };
    }),

  // The one genuinely destructive action here, and the reason undo exists.
  clearPlants: () =>
    set((s) => ({ ...pushHistory(s, 'Clear planting'), plants: [], selectedId: null })),
  // One selection at a time: the header and the side panel both describe "the
  // selected thing", and two highlights at once would make that a lie.
  select: (id) => set({ selectedId: id, selectedStructureId: null }),
  selectStructure: (id) => set({ selectedStructureId: id, selectedId: null }),

  selectNextOfSpecies: (speciesId) =>
    set((s) => {
      const matches = s.plants.filter((p) => p.speciesId === speciesId);
      if (matches.length === 0) return {};
      const at = matches.findIndex((p) => p.id === s.selectedId);
      // Tapping the badge repeatedly walks round the group rather than sticking
      // on the first one, which is how you find the third of five hostas.
      return { selectedId: matches[(at + 1) % matches.length].id };
    }),

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

  setTime: (patch) => set((s) => ({ time: { ...s.time, ...patch } })),
  setSite: (patch) => set((s) => ({ site: { ...s.site, ...patch } })),

  setTool: (tool) => set({ tool, draft: [], draftCursor: null, redrawingId: null }),
  pushDraftPoint: (p) => set((s) => ({ draft: [...s.draft, p] })),
  setDraftCursor: (p) => set({ draftCursor: p }),

  commitDraft: () =>
    set((s) => {
      // A wall or a bed is the same gesture as a plot outline, producing a
      // different thing — so the drafting, the preview and the cancel are
      // shared, and only the commit knows which tool was in hand.
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
        ...useStore.getState().observer,
        x: width / 2,
        y: height - 0.8,
        heading: 0,
        pitch: 12,
      },
    })),

  setSightEnd: (end, p) => set((s) => ({ sightLine: { ...s.sightLine, [end]: p } })),

  setSliceDepth: (metres) =>
    set({
      sliceDepth: Number.isFinite(metres)
        ? Math.max(SLICE_DEPTH_RANGE.min, Math.min(SLICE_DEPTH_RANGE.max, metres))
        : DEFAULT_SLICE_DEPTH,
    }),

  /**
   * Move the eye, but keep it within reach.
   *
   * Standing a little outside the garden is a real thing to want — you look at
   * a border from the house, not from inside it — so this allows a margin round
   * the plot rather than pinning the eye inside it. What it will not allow is
   * dragging the eye so far out that it leaves the drawing altogether: once it
   * is off the plan, or hidden behind the view below, there is no way to take
   * hold of it again and the 360° view is stuck wherever it was left.
   */
  moveObserver: (p) =>
    set((s) => {
      const b = polygonBounds(s.plot);
      const margin = Math.max(1, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.12);
      return {
        observer: {
          ...s.observer,
          x: Math.max(b.minX - margin, Math.min(b.maxX + margin, p.x)),
          y: Math.max(b.minY - margin, Math.min(b.maxY + margin, p.y)),
        },
      };
    }),

  centreObserver: () =>
    set((s) => {
      const b = polygonBounds(s.plot);
      return {
        observer: { ...s.observer, x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 },
      };
    }),
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
      structures: [],
      site: DEFAULT_SITE,
      selectedId: null,
      selectedStructureId: null,
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

    // Never saved, so the name lives only on screen and there is nothing that
    // could disagree with it.
    if (s.projectId === null) {
      set({ projectName: trimmed });
      return;
    }

    // Rewrite the *stored* design under the new name rather than the current
    // one, so renaming cannot quietly save edits the user has not saved yet.
    const stored = readProject(s.projectId);
    if (stored === null || !stored.ok) {
      set({ projectName: trimmed });
      return;
    }

    /*
     * The header is only changed once the new name has actually been recorded.
     *
     * Setting it first and writing afterwards looks harmless and is not: any
     * failure in between — a full quota, storage switched off, or the
     * `RangeError` this used to throw rebuilding an unparseable saved date —
     * left the header showing one name and the saved file holding another,
     * which is precisely the divergence this function exists to prevent.
     */
    const result = writeProject(
      s.projectId,
      renamedProjectFile(trimmed, stored.design, stored.savedAt),
    );
    if (result.ok) set({ projectName: trimmed });
  },

  openProject: (id) => {
    const result = readProject(id);
    if (result === null) return { ok: false, detail: 'That design is no longer in this browser.' };
    if (!result.ok) return { ok: false, detail: describeFailure(result.failure) };
    set((s) => applyDesign(s, result.name, result.design, id, 'Open project'));
    return {
      ok: true,
      name: result.name,
      note: describeLosses(result),
    };
  },

  /**
   * An imported design is not yet saved in this browser, so it arrives with no
   * project id — Save is what adopts it. Otherwise it is opened exactly as a
   * stored one is, through the same code, so the two cannot drift apart.
   */
  importDesign: (name, design) => {
    set((s) => applyDesign(s, name, design, null, 'Import design'));
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
