import type { Plot, Vec2 } from './types';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function polygonBounds(poly: Plot): Bounds {
  if (poly.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function pointInPolygon(pt: Vec2, poly: Plot): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * The area a shape encloses, in square metres, never negative.
 *
 * The shoelace sum inside is signed — it comes out negative for one winding
 * direction and positive for the other — but the sign is thrown away here, and
 * the doc comment used to describe the sum rather than what is returned. That
 * matters more than a wording slip: a caller who believed the comment would
 * read the sign to learn which way an outline was drawn, and would get the
 * same answer whichever way it was. A test pins the behaviour described here.
 *
 * Nothing in the app calls this today: no view states a plot's size in square
 * metres. It is kept, tested and honest rather than deleted, because "how big
 * is this bed" is a question a designer asks, and the arithmetic for it should
 * not have to be written again from scratch the day someone wants it shown.
 */
export function polygonArea(poly: Plot): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(area / 2);
}

/**
 * The middle of a bounding box.
 *
 * Three places wanted this and each wrote it out again: dropping a plant in the
 * middle of the plot, sending the viewer back to the middle, and centring the
 * plot on the canvas. Three copies of one line is how they come to disagree —
 * and "the middle of the plot" is the datum the terrain measures height from,
 * so they have to agree.
 */
export function boundsCentre(b: Bounds): Vec2 {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/**
 * The middle of a shape's bounding box — *not* its centre of mass.
 *
 * For an L-shaped plot those differ, and this is the box. Pinned by a test,
 * because the name invites a later "fix" to a true centroid, which would
 * silently move every plot's datum and with it the terrain's zero height.
 */
export function polygonCentroid(poly: Plot): Vec2 {
  return boundsCentre(polygonBounds(poly));
}

export function rectanglePlot(width: number, height: number): Plot {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shortest distance from a point to a line segment, plus the closest point. */
export function pointToSegment(p: Vec2, a: Vec2, b: Vec2): { dist: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { dist: distance(p, a), t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { dist: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

/**
 * The smallest convex outline containing every point given, anticlockwise.
 *
 * Andrew's monotone chain. It exists for one job: the ground a flat plant's
 * shadow covers is its footprint swept along the shadow — which is the hull of
 * the footprint and its translated copy. Sweeping by building the footprint,
 * the copy and a quad per edge (as walls do, because a bed can be concave)
 * would hand back overlapping pieces, and a piece counted twice would shade the
 * ground twice over; one convex outline can be tested, and filled, exactly once.
 *
 * Fewer than three points come back unchanged: there is no hull to take.
 */
export function convexHull(points: Vec2[]): Vec2[] {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const half = (pts: Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };

  const hull = [...half(sorted), ...half([...sorted].reverse())];
  // Every point identical, or all on one line: no area, so no hull.
  return hull.length >= 3 ? hull : [...points];
}
