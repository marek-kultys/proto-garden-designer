import { create } from 'zustand';
import { rectanglePlot } from '../model/geometry';
import { clampPitch, normaliseBearing, type Observer } from '../model/panorama';
import type { PlantInstance, Plot, Site, TimeState, Vec2 } from '../model/types';

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

  addPlant: (speciesId: string, at: Vec2) => void;
  movePlant: (id: string, at: Vec2) => void;
  removePlant: (id: string) => void;
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
  setStageView: (view: StageView) => void;
  setRenderedFov: (fov: number) => void;
  toggle: (key: 'showShadows' | 'showGrid' | 'showOverlay' | 'playing') => void;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `p${counter}-${Math.floor(Math.random() * 1e6)}`;
}

export const useStore = create<AppState>((set) => ({
  plot: DEFAULT_PLOT,
  plants: [],
  site: {
    latitude: 51.51,
    longitude: -0.13,
    altitude: 11,
    northAngle: 0,
    dst: true,
    label: 'London',
  },
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
  observer: { x: 7, y: 9.2, heading: 0, fov: 90, pitch: 12 },
  stageView: 'elevation',
  renderedFov: 90,

  showShadows: true,
  showGrid: true,
  showOverlay: false,
  playing: false,

  addPlant: (speciesId, at) =>
    set((s) => {
      const plant: PlantInstance = {
        id: newId(),
        speciesId,
        x: at.x,
        y: at.y,
        seed: Math.floor(Math.random() * 1e9),
      };
      return { plants: [...s.plants, plant], selectedId: plant.id };
    }),

  movePlant: (id, at) =>
    set((s) => ({
      plants: s.plants.map((p) => (p.id === id ? { ...p, x: at.x, y: at.y } : p)),
    })),

  removePlant: (id) =>
    set((s) => ({
      plants: s.plants.filter((p) => p.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  clearPlants: () => set({ plants: [], selectedId: null }),
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
    set({
      plot: rectanglePlot(width, height),
      tool: 'select',
      draft: [],
      sightLine: { a: { x: 0.5, y: height / 2 }, b: { x: width - 0.5, y: height / 2 } },
      observer: { x: width / 2, y: height - 0.8, heading: 0, fov: 90, pitch: 12 },
    }),

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
  setStageView: (stageView) => set({ stageView }),
  setRenderedFov: (renderedFov) =>
    set((s) => (Math.abs(s.renderedFov - renderedFov) < 0.5 ? {} : { renderedFov })),

  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<AppState>),
}));
