import { pointInPolygon } from './geometry';
import type { Structure, Vec2 } from './types';

/**
 * The geometry of built things, shared by every view and by the shade model.
 *
 * A wall and a raised bed are drawn differently and mean different things, but
 * they answer the same three questions — what ground do you cover, how tall are
 * you, and what shadow do you throw — so the answers live here once rather than
 * being re-derived in the plan, the elevation, the panorama and the sun map.
 */

/** Metres. A wall taller than this is a building, which this is not modelling. */
export const WALL_HEIGHT_RANGE = { min: 0.2, max: 4, step: 0.1 };
/** A raised bed above about a metre is a terrace wall, and should be drawn as one. */
export const BED_HEIGHT_RANGE = { min: 0.1, max: 1.2, step: 0.05 };
export const WALL_THICKNESS_RANGE = { min: 0.05, max: 0.6, step: 0.05 };

export const DEFAULT_WALL_HEIGHT = 1.8;
export const DEFAULT_WALL_THICKNESS = 0.22;
export const DEFAULT_BED_HEIGHT = 0.4;

export function heightRange(kind: Structure['kind']) {
  return kind === 'wall' ? WALL_HEIGHT_RANGE : BED_HEIGHT_RANGE;
}

export function clampHeight(kind: Structure['kind'], metres: number): number {
  const range = heightRange(kind);
  if (!Number.isFinite(metres)) return kind === 'wall' ? DEFAULT_WALL_HEIGHT : DEFAULT_BED_HEIGHT;
  return Math.max(range.min, Math.min(range.max, metres));
}

export function clampThickness(metres: number): number {
  if (!Number.isFinite(metres)) return DEFAULT_WALL_THICKNESS;
  return Math.max(WALL_THICKNESS_RANGE.min, Math.min(WALL_THICKNESS_RANGE.max, metres));
}

/** The least a run or an outline needs before it is a structure at all. */
export function minimumPoints(kind: Structure['kind']): number {
  return kind === 'wall' ? 2 : 3;
}

export interface Segment {
  a: Vec2;
  b: Vec2;
}

/** The runs of a wall, or the closed edges of a bed. */
export function segmentsOf(structure: Structure): Segment[] {
  const pts = structure.points;
  const segments: Segment[] = [];
  for (let i = 0; i + 1 < pts.length; i += 1) segments.push({ a: pts[i], b: pts[i + 1] });
  // A bed is closed; a wall is not — a wall that joined its ends would be a bed
  // you could not plant in.
  if (structure.kind === 'bed' && pts.length >= 3) {
    segments.push({ a: pts[pts.length - 1], b: pts[0] });
  }
  return segments;
}

/** One segment widened to its thickness, as a quad. */
function segmentQuad(segment: Segment, thickness: number): Vec2[] {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const half = thickness / 2;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    { x: segment.a.x + nx, y: segment.a.y + ny },
    { x: segment.b.x + nx, y: segment.b.y + ny },
    { x: segment.b.x - nx, y: segment.b.y - ny },
    { x: segment.a.x - nx, y: segment.a.y - ny },
  ];
}

/**
 * The ground a structure stands on, as one or more polygons.
 *
 * A wall is a quad per run; a bed is its own outline, because the bed occupies
 * all the ground inside it, not just the line of its sides.
 */
export function footprints(structure: Structure): Vec2[][] {
  if (structure.kind === 'bed') {
    return structure.points.length >= 3 ? [structure.points] : [];
  }
  return segmentsOf(structure)
    .map((s) => segmentQuad(s, structure.thickness))
    .filter((quad) => quad.length === 4);
}

/**
 * The middle of the ground a structure covers.
 *
 * A built thing sits at one height rather than following every undulation
 * beneath it, so it needs a single point to take that height from. The middle
 * of its own run is the honest choice, and it is what the elevation already
 * assumed.
 */
export function footprintCentre(structure: Structure): Vec2 {
  const pts = structure.points;
  if (pts.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/** Height of the ground a structure stands on. */
export function baseHeightOf(structure: Structure, groundAt: (p: Vec2) => number): number {
  return groundAt(footprintCentre(structure));
}

/**
 * The height of a raised bed's soil: level, at its own height above the ground
 * beneath its middle.
 *
 * Level on purpose. The soil in a built box does not slope with the hillside
 * under it, and a plant anywhere in the bed stands on that one surface — which
 * is what lets the plant and the bed agree exactly, rather than only near the
 * middle.
 */
export function surfaceHeightOf(structure: Structure, groundAt: (p: Vec2) => number): number {
  return baseHeightOf(structure, groundAt) + structure.height;
}

/**
 * The height of whatever a plant at this point is standing on.
 *
 * The single answer the three views share. Before it existed, a plant took its
 * bed's height plus the ground under its own feet while the bed was drawn from
 * the ground under its middle — so on any slope the plant floated above the
 * soil it was supposedly rooted in.
 *
 * Where beds overlap the highest soil surface wins, which is the same rule as
 * "the deepest bed", generalised to ground that is not level.
 */
export function standingHeightAt(
  point: Vec2,
  structures: Structure[],
  groundAt: (p: Vec2) => number,
): number {
  let surface: number | null = null;
  for (const structure of structures) {
    if (structure.kind !== 'bed' || structure.points.length < 3) continue;
    if (!pointInPolygon(point, structure.points)) continue;
    const top = surfaceHeightOf(structure, groundAt);
    if (surface === null || top > surface) surface = top;
  }
  return surface === null ? groundAt(point) : surface;
}

/**
 * How high the ground is under a point, given the beds in the garden.
 *
 * This is what makes a raised bed raise anything: a plant standing in one is
 * drawn, and casts its shadow, from the top of the bed rather than from the
 * lawn. Walls are not standable, so they do not count — a plant is never on top
 * of a wall.
 *
 * The deepest bed wins where two overlap, which is the same answer as building
 * one bed inside another and filling both.
 */
export function groundOffsetAt(point: Vec2, structures: Structure[]): number {
  let offset = 0;
  for (const structure of structures) {
    if (structure.kind !== 'bed' || structure.points.length < 3) continue;
    if (pointInPolygon(point, structure.points) && structure.height > offset) {
      offset = structure.height;
    }
  }
  return offset;
}

/**
 * The ground a polygon's shadow falls on, swept along the shadow direction.
 *
 * Returned as a list of polygons rather than one, because a garden bed can be
 * concave and the convex hull of the two copies would shade ground the bed
 * never reaches. The swept region is exactly the original, the translated copy,
 * and one quad per edge joining the two — which is right for any shape.
 */
export function sweptPolygons(poly: Vec2[], vx: number, vy: number): Vec2[][] {
  if (poly.length < 3) return [];
  const moved = poly.map((p) => ({ x: p.x + vx, y: p.y + vy }));
  const parts: Vec2[][] = [poly, moved];
  for (let i = 0; i < poly.length; i += 1) {
    const j = (i + 1) % poly.length;
    parts.push([poly[i], poly[j], moved[j], moved[i]]);
  }
  return parts;
}

export interface StructureCaster {
  /** Ground polygons the structure stands on. */
  footprints: Vec2[][];
  /** Metres from the ground to the top. */
  height: number;
  /**
   * How much light gets through, 0–1. Solid masonry and close-boarded fence are
   * opaque; nothing in the current palette of structures is not.
   */
  transmission: number;
}

export function casterOf(structure: Structure): StructureCaster | null {
  const feet = footprints(structure);
  if (feet.length === 0 || structure.height <= 0) return null;
  return { footprints: feet, height: structure.height, transmission: 0 };
}

/** Whether a point is standing on the ground a structure occupies. */
export function coversPoint(structure: Structure, point: Vec2): boolean {
  return footprints(structure).some((poly) => pointInPolygon(point, poly));
}

/** Axis-aligned bounds of everything a structure covers. */
export function structureBounds(structure: Structure): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const pts = structure.points;
  if (pts.length === 0) return null;
  const pad = structure.kind === 'wall' ? structure.thickness / 2 : 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

/** Total run of a wall, or perimeter of a bed, in metres. */
export function runLength(structure: Structure): number {
  return segmentsOf(structure).reduce(
    (total, s) => total + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y),
    0,
  );
}

/** A short description for the header and the structure list. */
export function describeStructure(structure: Structure): string {
  const metres = runLength(structure);
  const size = metres < 10 ? metres.toFixed(1) : Math.round(metres).toString();
  return structure.kind === 'wall'
    ? `Wall, ${size} m long, ${structure.height.toFixed(1)} m high`
    : `Raised bed, ${size} m around, ${(structure.height * 100).toFixed(0)} cm high`;
}
