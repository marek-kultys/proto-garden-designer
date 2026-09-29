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

/** Signed area doubled; positive for clockwise winding in screen coordinates. */
export function polygonArea(poly: Plot): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(area / 2);
}

export function polygonCentroid(poly: Plot): Vec2 {
  const b = polygonBounds(poly);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
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
