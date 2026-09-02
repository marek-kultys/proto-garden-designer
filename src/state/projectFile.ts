import { SPECIES_BY_ID } from '../model/plants';
import { clampHeight, clampThickness, minimumPoints } from '../model/structures';
import type { PlantInstance, Plot, Site, Structure, StructureKind, Vec2 } from '../model/types';

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
export const CURRENT_VERSION = 3;

/**
 * What each version added, so a reader can see what a migration has to do.
 *
 *   1  plot, plants, site
 *   2  walls and raised beds
 *   3  the age a plant was when it went in
 */
const FIRST_VERSION = 1;

/** What a saved design actually consists of. */
export interface Design {
  plot: Plot;
  plants: PlantInstance[];
  site: Site;
  /** Walls and raised beds. Added in version 2; absent from version 1 saves. */
  structures: Structure[];
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
  /**
   * Plants whose record was damaged past rebuilding — a missing position, say.
   *
   * Counted separately from `skipped`, because the two are different losses: a
   * skipped plant is one the library no longer has, which is a fact about the
   * palette, while this is a fact about the file.
   */
  droppedPlants: number;
  /** Walls or beds in the file that were too damaged to rebuild. */
  droppedStructures: number;
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

  /*
   * The slope. Absent means level, which is exactly what a design saved before
   * the ground could tilt meant — so this is read when present and defaulted
   * when not, without a new schema version. Bumping would make an older build
   * refuse the whole design rather than quietly ignore two optional numbers.
   */
  const fall = finiteNumber(v.slopeFall);
  const direction = finiteNumber(v.slopeDirection);

  return {
    latitude,
    longitude,
    altitude,
    northAngle,
    dst: v.dst,
    label,
    slopeFall: fall === null ? 0 : Math.max(0, Math.min(20, fall)),
    slopeDirection: direction === null ? 180 : ((direction % 360) + 360) % 360,
  };
}

function isStructureKind(v: unknown): v is StructureKind {
  return v === 'wall' || v === 'bed';
}

/**
 * Structures are dropped individually rather than failing the whole design.
 *
 * The reasoning is the same as for an unknown plant: losing a wall from a
 * garden you can still open is a far better outcome than losing the garden, and
 * the app says which happened either way.
 */
function parseStructures(v: unknown): { structures: Structure[]; dropped: number } | null {
  if (v === undefined) return { structures: [], dropped: 0 };
  if (!Array.isArray(v)) return null;

  const structures: Structure[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const raw of v) {
    if (!isRecord(raw) || !isStructureKind(raw.kind)) {
      dropped += 1;
      continue;
    }
    const id = nonEmptyString(raw.id);
    const seed = finiteNumber(raw.seed);
    const height = finiteNumber(raw.height);
    const thickness = finiteNumber(raw.thickness);
    if (id === null || seed === null || height === null || thickness === null) {
      dropped += 1;
      continue;
    }

    if (!Array.isArray(raw.points)) {
      dropped += 1;
      continue;
    }
    const points: Vec2[] = [];
    let bad = false;
    for (const rawPoint of raw.points) {
      const point = parseVec2(rawPoint);
      if (point === null) {
        bad = true;
        break;
      }
      points.push(point);
    }
    // Too few points to stand up is not a structure, whatever it claims to be.
    if (bad || points.length < minimumPoints(raw.kind) || seen.has(id)) {
      dropped += 1;
      continue;
    }
    seen.add(id);

    structures.push({
      id,
      kind: raw.kind,
      points,
      // Clamped rather than refused: a height outside the range is a number
      // that means something, unlike a missing one.
      height: clampHeight(raw.kind, height),
      thickness: clampThickness(thickness),
      seed,
    });
  }

  return { structures, dropped };
}

interface PlantParse {
  plants: PlantInstance[];
  skipped: string[];
  dropped: number;
}

/**
 * Plants are dropped one at a time, never all together.
 *
 * This used to fail the whole design if any single plant was malformed, while a
 * malformed wall beside it cost only that wall. The reasoning that applies to a
 * wall applies with more force here: losing one plant from a garden you can
 * still open is a far better outcome than losing the garden, and now that
 * designs are exported as hand-editable files and old ones must keep opening,
 * all-or-nothing was the more damaging of the two policies.
 *
 * A `plants` field that is not an array at all is still a whole-design failure:
 * that is not a damaged plant, it is a file that is not a design.
 */
function parsePlants(v: unknown): PlantParse | null {
  if (!Array.isArray(v)) return null;
  const plants: PlantInstance[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const raw of v) {
    if (!isRecord(raw)) {
      dropped += 1;
      continue;
    }
    const id = nonEmptyString(raw.id);
    const speciesId = nonEmptyString(raw.speciesId);
    const x = finiteNumber(raw.x);
    const y = finiteNumber(raw.y);
    const seed = finiteNumber(raw.seed);
    if (id === null || speciesId === null || x === null || y === null || seed === null) {
      dropped += 1;
      continue;
    }

    // Versions 1 and 2 knew nothing of a head start, so their plants simply
    // have no `plantedAge` and were all nursery stock — which is what an absent
    // field reads as here. Clamped rather than refused: a nonsense age is a
    // number that still means something, unlike a missing position.
    const rawAge = finiteNumber(raw.plantedAge);
    const plantedAge = rawAge === null ? 0 : Math.max(0, Math.min(50, rawAge));

    /*
     * Which way a climber's plane runs. Deliberately not a new schema version:
     * an absent facing means "however it was drawn before", which is exactly
     * what an older file means by leaving it out — and bumping the version
     * would make an older build refuse the whole design rather than quietly
     * ignore one optional field.
     */
    const rawFacing = finiteNumber(raw.facing);
    const facing = rawFacing === null ? undefined : ((rawFacing % 180) + 180) % 180;

    // The guard this whole file exists for.
    if (!(speciesId in SPECIES_BY_ID)) {
      skipped.push(speciesId);
      continue;
    }

    // Two plants sharing an instance id would make the selection ambiguous and
    // the React keys collide. Keep the first and drop the rest.
    if (seen.has(id)) continue;
    seen.add(id);

    plants.push(
      facing === undefined
        ? { id, speciesId, x, y, seed, plantedAge }
        : { id, speciesId, x, y, seed, plantedAge, facing },
    );
  }

  return { plants, skipped, dropped };
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

/**
 * The same design under a new name, keeping the moment it was actually saved.
 *
 * Renaming is not saving, so the timestamp must not move — and it is carried
 * across as the string it already is rather than rebuilt through a `Date`.
 * That round trip was a real fault: `savedAt` is only guaranteed here to be a
 * non-empty string, since a design is worth keeping even when its metadata is
 * damaged, so `new Date(savedAt).toISOString()` threw `RangeError` on anything
 * unparseable and took the rename down with it.
 */
export function renamedProjectFile(name: string, design: Design, savedAt: string): ProjectFile {
  return { schema: SCHEMA, version: CURRENT_VERSION, name, savedAt, design };
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

  // Version 1 is the first that ever shipped, so anything below it never
  // existed and is damage rather than history.
  if (version < FIRST_VERSION) {
    return fail({ kind: 'malformed', detail: `unknown version ${version}` });
  }
  //
  // Migrations live below, in the parsers themselves rather than as a rewriting
  // pass over the raw object. Version 1 knew nothing of walls and raised beds,
  // so its files simply have no `structures` key — and `parseStructures` reads
  // an absent one as "none", which is exactly right. A version 1 design opens
  // as the garden it always was.
  //
  // A future version that *changes* a field rather than adding one will need
  // more than this; that is the point at which a real step-by-step migration
  // belongs here, one function per version, oldest first.

  const name = nonEmptyString(raw.name);
  if (name === null) return fail({ kind: 'malformed', detail: 'no name' });

  /*
   * Checked as a string, not as a date. A garden is worth keeping even when the
   * moment it was saved is unreadable — the list simply shows the date as
   * unknown. Callers must therefore treat this as opaque text and never assume
   * `new Date(savedAt)` is valid.
   */
  const savedAt = nonEmptyString(raw.savedAt);
  if (savedAt === null) return fail({ kind: 'malformed', detail: 'no saved date' });

  if (!isRecord(raw.design)) return fail({ kind: 'malformed', detail: 'no design' });

  const plot = parsePlot(raw.design.plot);
  if (plot === null) return fail({ kind: 'malformed', detail: 'damaged plot outline' });

  const site = parseSite(raw.design.site);
  if (site === null) return fail({ kind: 'malformed', detail: 'damaged site' });

  const parsed = parsePlants(raw.design.plants);
  if (parsed === null) return fail({ kind: 'malformed', detail: 'damaged planting' });

  const built = parseStructures(raw.design.structures);
  if (built === null) return fail({ kind: 'malformed', detail: 'damaged walls and beds' });

  return {
    ok: true,
    name,
    savedAt,
    design: { plot, plants: parsed.plants, site, structures: built.structures },
    skipped: parsed.skipped,
    droppedPlants: parsed.dropped,
    droppedStructures: built.dropped,
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

/**
 * Wording for what a load could not bring back, or null when nothing was lost.
 *
 * Takes the whole result rather than a list of counts. A third kind of loss was
 * added and the two callers both had to be found and changed by hand — which is
 * exactly how the second kind came to be computed and then not reported at all
 * for a while. Passing the result means a new category is carried to every
 * caller for free.
 */
export function describeLosses(losses: {
  skipped: string[];
  droppedPlants?: number;
  droppedStructures?: number;
}): string | null {
  const parts: string[] = [];
  const { skipped, droppedPlants = 0, droppedStructures = 0 } = losses;

  if (skipped.length > 0) {
    const unique = new Set(skipped);
    const plants = skipped.length === 1 ? '1 plant' : `${skipped.length} plants`;
    const kinds = unique.size === 1 ? 'it is' : 'they are';
    parts.push(`${plants} could not be restored — ${kinds} no longer in the library.`);
  }

  // A different loss from the one above, and worth saying so: this is a damaged
  // record rather than a plant the library has stopped carrying.
  if (droppedPlants > 0) {
    const plants = droppedPlants === 1 ? '1 plant' : `${droppedPlants} plants`;
    parts.push(`${plants} could not be rebuilt.`);
  }

  if (droppedStructures > 0) {
    const built = droppedStructures === 1 ? '1 wall or bed' : `${droppedStructures} walls or beds`;
    parts.push(`${built} could not be rebuilt.`);
  }

  return parts.length === 0 ? null : parts.join(' ');
}
