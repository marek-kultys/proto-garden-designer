import {
  describeFailure,
  describeLosses,
  makeProjectFile,
  renamedProjectFile,
  type Design,
} from '../projectFile';
import {
  deleteProject as deleteStoredProject,
  newProjectId,
  readProject,
  writeProject,
} from '../projectStorage';
import type { PlantInstance, Structure } from '../../model/types';
import { newId } from '../ids';
import type { SliceOf } from '../slice';
import type { AppState } from '../store';
import { pushHistory } from './history';
import { DEFAULT_PLOT } from './plot';
import { DEFAULT_SITE } from './site';

const DEFAULT_PROJECT_NAME = 'Untitled garden';

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

export interface ProjectsSlice {
  /** Null until the design has been saved under a name at least once. */
  projectId: string | null;
  projectName: string;
  /** The design as it was when last saved, for comparison. See `isDirty`. */
  savedFingerprint: string;
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
}

export const projectsSlice: SliceOf<ProjectsSlice> = (set, get) => ({
  projectId: null,
  projectName: DEFAULT_PROJECT_NAME,
  savedFingerprint: EMPTY_FINGERPRINT,

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
});
