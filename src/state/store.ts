import { create } from 'zustand';
import { historySlice, type HistorySlice } from './slices/history';
import { plantsSlice, type PlantsSlice } from './slices/plants';
import { plotSlice, type PlotSlice } from './slices/plot';
import { projectsSlice, type ProjectsSlice } from './slices/projects';
import { selectionSlice, type SelectionSlice } from './slices/selection';
import { siteSlice, type SiteSlice } from './slices/site';
import { structuresSlice, type StructuresSlice } from './slices/structures';
import { viewSlice, type ViewSlice } from './slices/view';

/**
 * Everything the app knows, assembled from one file per subject.
 *
 * It was one file of nine hundred lines, in which a change to how plants are
 * placed meant scrolling past the undo machinery and the project-saving code to
 * find it. Each subject now owns its own fields, its own actions and the
 * reasoning behind both, in `slices/`.
 *
 * The slices are not isolated from each other and are not meant to be: placing
 * a plant writes the undo history, opening a project moves the eye, and
 * selecting a plant clears the selected wall. Every slice is handed the same
 * `set` and `get` as the whole store, so any of them can do that; what the
 * split buys is somewhere to look, not a wall to hide behind.
 *
 * The shape below is the one place the whole of it can be seen at once, and the
 * compiler will not let the pieces drift from it — a field declared in a slice
 * and never provided, or provided and never declared, fails the build.
 */
export type AppState = PlotSlice &
  PlantsSlice &
  StructuresSlice &
  SelectionSlice &
  SiteSlice &
  ViewSlice &
  HistorySlice &
  ProjectsSlice;

export const useStore = create<AppState>((set, get) => ({
  ...plotSlice(set, get),
  ...plantsSlice(set, get),
  ...structuresSlice(set, get),
  ...selectionSlice(set, get),
  ...siteSlice(set, get),
  ...viewSlice(set, get),
  ...historySlice(set, get),
  ...projectsSlice(set, get),
}));

// What the rest of the app asks of the store, kept here so that splitting the
// file behind it changed no import anywhere else.
export { isDrawingTool, type Tool } from './slices/plot';
export { PLACEMENT_AGES } from './slices/plants';
export { LOCATION_PRESETS, type LocationPreset } from './slices/site';
export { type StageView } from './slices/view';
export {
  currentDesign,
  designFingerprint,
  isDirty,
  type OpenOutcome,
  type SaveOutcome,
} from './slices/projects';
