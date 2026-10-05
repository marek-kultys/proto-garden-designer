import type { Structure, Vec2 } from './types';

/**
 * Round and oval raised beds.
 *
 * There is no curve anywhere in this app's geometry, and this does not add one.
 * An oval bed is an ordinary closed outline with a great many corners — which
 * is exactly what a bed already is, and why the shadow, the elevation mass, the
 * 360° view, bed-on-bed overlap and the lifting of plants standing in it all
 * work on one of these without being told anything. The saved file is unchanged
 * too: a design with an oval bed in it opens in a build that has never heard of
 * ovals, as a bed with forty corners.
 *
 * What `shape: 'oval'` on the structure buys is not the drawing but the
 * handling. A polygon bed puts a grab handle on every corner; forty of those is
 * a ring of dots, and one stray drag leaves a dent in what should be a curve.
 * A bed marked as an oval gets four handles instead, on the ends of its axes,
 * and dragging one stretches the whole shape.
 *
 * The outline stays the single source of truth. The centre and the radii are
 * read back off it rather than stored beside it, so there is no second copy to
 * disagree — and a file that lost the marker still draws correctly.
 *
 * Ovals are upright: no rotation. A bed at an angle is drawn by hand with the
 * ordinary bed tool, which is the shape that tool is good at.
 */

/**
 * Metres of edge per corner.
 *
 * Fine enough that the facets are lost in sketchy line work, coarse enough that
 * a bed is not thousands of points in the saved file. The count is bounded at
 * both ends: a small bed does not need forty corners, and a long one gains
 * nothing from a hundred.
 */
const EDGE_PER_CORNER = 0.4;
const FEWEST_CORNERS = 20;
const MOST_CORNERS = 56;

/**
 * How near to square a box has to be before it is taken to mean a circle.
 *
 * A round bed round a specimen tree is the common case, and nobody drags out a
 * square by eye. Within a twelfth, the difference is a slip of the hand rather
 * than an intention.
 */
const CIRCLE_SNAP = 1 / 12;

export interface OvalAxes {
  centre: Vec2;
  /** Half-width and half-depth, in metres. Always positive. */
  rx: number;
  ry: number;
}

/** The smallest an oval may be, so a stray double-click cannot make a speck. */
export const SMALLEST_RADIUS = 0.25;

function cornerCount(rx: number, ry: number): number {
  // Ramanujan's first approximation is far more accuracy than this needs, but
  // the cheap `2π·mean` badly undercounts a long thin oval, which is the one
  // that shows its corners.
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const wanted = Math.round(perimeter / EDGE_PER_CORNER);
  return Math.max(FEWEST_CORNERS, Math.min(MOST_CORNERS, wanted));
}

/**
 * The outline of an oval filling the box with these two opposite corners.
 *
 * The corners may be given in any order and the box may be dragged out in any
 * direction, because a person clicking two points has no idea which one the
 * code would like first.
 */
export function ovalOutline(a: Vec2, b: Vec2): Vec2[] {
  return outlineOf(axesFromBox(a, b));
}

export function axesFromBox(a: Vec2, b: Vec2): OvalAxes {
  const centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let rx = Math.max(SMALLEST_RADIUS, Math.abs(b.x - a.x) / 2);
  let ry = Math.max(SMALLEST_RADIUS, Math.abs(b.y - a.y) / 2);

  const bigger = Math.max(rx, ry);
  if (Math.abs(rx - ry) / bigger <= CIRCLE_SNAP) {
    const mean = (rx + ry) / 2;
    rx = mean;
    ry = mean;
  }
  return { centre, rx, ry };
}

export function outlineOf({ centre, rx, ry }: OvalAxes): Vec2[] {
  const sides = cornerCount(rx, ry);
  const points: Vec2[] = [];
  for (let i = 0; i < sides; i += 1) {
    const turn = (i / sides) * Math.PI * 2;
    points.push({
      x: centre.x + Math.cos(turn) * rx,
      y: centre.y + Math.sin(turn) * ry,
    });
  }
  return points;
}

/** Read an oval's centre and radii back off the outline that is drawn. */
export function axesOf(points: Vec2[]): OvalAxes {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
    rx: Math.max(SMALLEST_RADIUS, (right - left) / 2),
    ry: Math.max(SMALLEST_RADIUS, (bottom - top) / 2),
  };
}

export function isOval(structure: Structure): boolean {
  return structure.shape === 'oval' && structure.kind === 'bed';
}

/**
 * Where to put the four grab handles: the ends of the two axes, west, east,
 * north and south in plan terms. The order is the index a drag arrives with.
 */
export function ovalHandles(points: Vec2[]): Vec2[] {
  const { centre, rx, ry } = axesOf(points);
  return [
    { x: centre.x - rx, y: centre.y },
    { x: centre.x + rx, y: centre.y },
    { x: centre.x, y: centre.y - ry },
    { x: centre.x, y: centre.y + ry },
  ];
}

/**
 * The outline after one handle has been dragged to a new place.
 *
 * The opposite side stays where it is, as it does when resizing anything by a
 * corner — the alternative, growing about the centre, moves the bed's far edge
 * away from whatever it was lined up against.
 *
 * Dragged past its opposite side, the oval does not turn inside out: it stops
 * at the smallest it may be. There is no useful meaning to a negative radius
 * and flipping would make the handle under the hand jump to the far side.
 */
export function resizeOval(points: Vec2[], handle: number, to: Vec2): Vec2[] {
  const { centre, rx, ry } = axesOf(points);
  const west = centre.x - rx;
  const east = centre.x + rx;
  const north = centre.y - ry;
  const south = centre.y + ry;

  const span = (fixed: number, moved: number): { centre: number; radius: number } => {
    const radius = Math.max(SMALLEST_RADIUS, Math.abs(fixed - moved) / 2);
    return { centre: moved > fixed ? fixed + radius : fixed - radius, radius };
  };

  switch (handle) {
    case 0: {
      const x = span(east, to.x);
      return outlineOf({ centre: { x: x.centre, y: centre.y }, rx: x.radius, ry });
    }
    case 1: {
      const x = span(west, to.x);
      return outlineOf({ centre: { x: x.centre, y: centre.y }, rx: x.radius, ry });
    }
    case 2: {
      const y = span(south, to.y);
      return outlineOf({ centre: { x: centre.x, y: y.centre }, rx, ry: y.radius });
    }
    case 3: {
      const y = span(north, to.y);
      return outlineOf({ centre: { x: centre.x, y: y.centre }, rx, ry: y.radius });
    }
    default:
      return points;
  }
}
