import { polygonBounds, polygonCentroid } from '../../model/geometry';
import { DEFAULT_SLICE_DEPTH, SLICE_DEPTH_RANGE } from '../../render/constants';
import {
  DEFAULT_EYE_HEIGHT,
  clampEyeHeight,
  clampFov,
  clampGroundHeight,
  clampPitch,
  normaliseBearing,
  type Observer,
} from '../../model/panorama';
import type { Vec2 } from '../../model/types';
import type { SliceOf } from '../slice';
import type { AppState } from '../store';

/** Which drawing occupies the strip under the plan. */
export type StageView = 'elevation' | 'panorama';

/**
 * Where you are looking from, and what the drawings show you.
 *
 * None of it is part of a design and none of it is saved: the season, the
 * direction you are facing and the depth of the slice are ways of inspecting a
 * garden, not properties of one.
 */
export interface ViewSlice {
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
  setRenderedFov: (fov: number) => void;
  toggle: (key: 'showShadows' | 'showGrid' | 'showOverlay' | 'playing') => void;
}

export const viewSlice: SliceOf<ViewSlice> = (set) => ({
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
    set((s) => ({ observer: { ...s.observer, ...polygonCentroid(s.plot) } })),
  turnObserver: (byDegrees) =>
    set((s) => ({
      observer: { ...s.observer, heading: normaliseBearing(s.observer.heading + byDegrees) },
    })),
  setHeading: (heading) =>
    set((s) => ({ observer: { ...s.observer, heading: normaliseBearing(heading) } })),
  setFov: (fov) =>
    set((s) => ({ observer: { ...s.observer, fov: clampFov(fov) } })),
  setPitch: (pitch) => set((s) => ({ observer: { ...s.observer, pitch: clampPitch(pitch) } })),
  setEyeHeight: (m) =>
    set((s) => ({ observer: { ...s.observer, eyeHeight: clampEyeHeight(m) } })),
  setGroundHeight: (m) =>
    set((s) => ({ observer: { ...s.observer, groundHeight: clampGroundHeight(m) } })),
  setStageView: (stageView) => set({ stageView }),

  setRenderedFov: (renderedFov) =>
    set((s) => (Math.abs(s.renderedFov - renderedFov) < 0.5 ? {} : { renderedFov })),

  toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<AppState>),
});
