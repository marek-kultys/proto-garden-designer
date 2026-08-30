import { SPECIES_BY_ID } from '../model/plants';
import type { PlantInstance, Plot, Site, Vec2 } from '../model/types';

/**
 * The saved form of a design, and the boundary that reads it back.
 *
 * Everything in here is pure: no localStorage, no browser, no React. That is
 * deliberate, because this is the only code in the app that handles data it did
 * not just create, and it needs to be testable without a browser in the loop.
 *
 * Two failures are worth naming, because both are silent until they are not.
 *
 * A design is stored, and the code that reads it is *newer* than the code that
 * wrote it. Until saving existed, the app's data was always exactly as old as
 * the app, because it died with the tab. Saving is what opens that gap, and
 * every future edit to the plant palette widens it.
 *
 * `getSpecies` throws on an id it does not know, and there is no error boundary
 * in this app — an exception during render unmounts the whole tree. So a design
 * naming a plant that has since been renamed or removed would not lose that one
 * plant, it would white-screen the app, and because the bad data is still in
 * storage it would do it again on every reload, with no way back through the
 * interface. Hence: unknown plants are dropped here and *counted*, so the app
 * can say what it could not restore instead of dying.
 *
 * The palette has only ever grown so far — no id has been renamed or removed in
 * the project's history — but curating the list down is an open question in
 * PRODUCT.md, and that edit is precisely the one this guards against.
 */

/** Tags the payload as ours, so a stray key in localStorage is not mistaken for a design. */
export const SCHEMA = 'garden-designer-project';

/**
 * Bump when the stored shape changes in a way an older reader cannot handle,
 * and add a migration below. The shape has already drifted once in this
 * project's life (`soil` became `soilPh`, and soil type, drainage and lifecycle
 * were added), which is the evidence that this will be needed again.
 */
export const CURRENT_VERSION = 1;

/** What a saved design actually consists of: the plot, the planting, the site. */
export interface Design {
  plot: Plot;
  plants: PlantInstance[];
  site: Site;
}

export interface ProjectFile {
  schema: typeof SCHEMA;
  version: number;
  name: string;
  /** ISO 8601. */
  savedAt: string;
  design: Design;
}

export type LoadFailure =
  /** Written by a newer version of the app than this one understands. */
  | { kind: 'from-the-future'; savedVersion: number }
  /** Not a design at all, or damaged past honest recovery. */
  | { kind: 'malformed'; detail: string };

export interface LoadSuccess {
  ok: true;
  name: string;
  savedAt: string;
  design: Design;
  /**
   * Species ids that were in the file but are not in the palette, one entry per
   * dropped plant. The caller reports the count; it never silently swallows them.
   */
  skipped: string[];
}

export type LoadResult = LoadSuccess | { ok: false; failure: LoadFailure };

// --------------------------------------------------------------- validation

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Finite numbers only — JSON turns NaN and Infinity into null, so anything else is damage. */
function finiteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function parseVec2(v: unknown): Vec2 | null {
  if (!isRecord(v)) return null;
  const x = finiteNumber(v.x);
  const y = finiteNumber(v.y);
  return x === null || y === null ? null : { x, y };
}

function parsePlot(v: unknown): Plot | null {
  if (!Array.isArray(v)) return null;
  const points: Vec2[] = [];
  for (const raw of v) {
    const p = parseVec2(raw);
    if (p === null) return null;
    points.push(p);
  }
  // Fewer than three points is not a polygon; the drawing tool refuses to
  // commit one, so a file holding one is damaged rather than merely empty.
  return points.length >= 3 ? points : null;
}

function parseSite(v: unknown): Site | null {
  if (!isRecord(v)) return null;
  const latitude = finiteNumber(v.latitude);
  const longitude = finiteNumber(v.longitude);
  const altitude = finiteNumber(v.altitude);
  const northAngle = finiteNumber(v.northAngle);
  const label = typeof v.label === 'string' ? v.label : null;
  if (
    latitude === null ||
    longitude === null ||
    altitude === null ||
    northAngle === null ||
    label === null ||
    typeof v.dst !== 'boolean'
  ) {
    return null;
  }
  // Out-of-range coordinates would put the sun somewhere impossible rather than
  // merely somewhere odd, so they are damage, not a preference.
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude, altitude, northAngle, dst: v.dst, label };
}

interface PlantParse {
  plants: PlantInstance[];
  skipped: string[];
}

function parsePlants(v: unknown): PlantParse | null {
  if (!Array.isArray(v)) return null;
  const plants: PlantInstance[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();

  for (const raw of v) {
    if (!isRecord(raw)) return null;
    const id = nonEmptyString(raw.id);
    const speciesId = nonEmptyString(raw.speciesId);
    const x = finiteNumber(raw.x);
    const y = finiteNumber(raw.y);
    const seed = finiteNumber(raw.seed);
    if (id === null || speciesId === null || x === null || y === null || seed === null) {
      return null;
    }

    // The guard this whole file exists for.
    if (!(speciesId in SPECIES_BY_ID)) {
      skipped.push(speciesId);
      continue;
    }

    // Two plants sharing an instance id would make the selection ambiguous and
    // the React keys collide. Keep the first and drop the rest.
    if (seen.has(id)) continue;
    seen.add(id);

    plants.push({ id, speciesId, x, y, seed });
  }

  return { plants, skipped };
}

// ------------------------------------------------------------------- public

export function makeProjectFile(name: string, design: Design, savedAt: Date): ProjectFile {
  return {
    schema: SCHEMA,
    version: CURRENT_VERSION,
    name,
    savedAt: savedAt.toISOString(),
    design,
  };
}

function fail(failure: LoadFailure): LoadResult {
  return { ok: false, failure };
}

/**
 * Read a stored design. Never throws: every route out is a value, because the
 * caller is a render path and an exception here takes the app down.
 */
export function parseProjectFile(raw: unknown): LoadResult {
  if (!isRecord(raw)) return fail({ kind: 'malformed', detail: 'not an object' });
  if (raw.schema !== SCHEMA) return fail({ kind: 'malformed', detail: 'not a garden design' });

  const version = finiteNumber(raw.version);
  if (version === null) return fail({ kind: 'malformed', detail: 'no version stamp' });

  // Refuse clearly rather than guessing at a shape we have never seen. Guessing
  // is how a newer file gets silently truncated to an older one and saved back.
  if (version > CURRENT_VERSION) return fail({ kind: 'from-the-future', savedVersion: version });

  // Migrations for older versions go here, one step per version, oldest first.
  // Version 1 is the first that ever shipped, so anything below it never
  // existed and is damage rather than history.
  if (version < CURRENT_VERSION) {
    return fail({ kind: 'malformed', detail: `unknown version ${version}` });
  }

  const name = nonEmptyString(raw.name);
  if (name === null) return fail({ kind: 'malformed', detail: 'no name' });

  const savedAt = nonEmptyString(raw.savedAt);
  if (savedAt === null) return fail({ kind: 'malformed', detail: 'no saved date' });

  if (!isRecord(raw.design)) return fail({ kind: 'malformed', detail: 'no design' });

  const plot = parsePlot(raw.design.plot);
  if (plot === null) return fail({ kind: 'malformed', detail: 'damaged plot outline' });

  const site = parseSite(raw.design.site);
  if (site === null) return fail({ kind: 'malformed', detail: 'damaged site' });

  const parsed = parsePlants(raw.design.plants);
  if (parsed === null) return fail({ kind: 'malformed', detail: 'damaged planting' });

  return {
    ok: true,
    name,
    savedAt,
    design: { plot, plants: parsed.plants, site },
    skipped: parsed.skipped,
  };
}

/** Wording for a load that could not happen at all. */
export function describeFailure(failure: LoadFailure): string {
  switch (failure.kind) {
    case 'from-the-future':
      return 'That design was saved by a newer version of Garden Designer, so this one cannot open it safely.';
    case 'malformed':
      return `That design could not be read (${failure.detail}).`;
  }
}

/** Wording for what a load could not bring back, or null when nothing was lost. */
export function describeSkipped(skipped: string[]): string | null {
  if (skipped.length === 0) return null;
  const unique = new Set(skipped);
  const plants = skipped.length === 1 ? '1 plant' : `${skipped.length} plants`;
  const kinds = unique.size === 1 ? 'it is' : 'they are';
  return `${plants} could not be restored — ${kinds} no longer in the library.`;
}
