import { describe, expect, it } from 'vitest';
import {
  distance,
  pointInPolygon,
  pointToSegment,
  polygonArea,
  polygonBounds,
  polygonCentroid,
  rectanglePlot,
} from '../geometry';

/**
 * The arithmetic everything else stands on.
 *
 * These seven functions are the least visible code in the project and the most
 * depended upon: raised beds ask whether a plant is inside them, the shade model
 * asks what ground a shadow covers, the plan asks what you clicked on, and the
 * terrain asks how far the plot reaches. A fault here would be wrong everywhere
 * and obvious nowhere — no view would break, the numbers would simply be
 * slightly wrong in every one of them at once.
 *
 * So these assert against arithmetic that is true independently of the code —
 * a 3-4-5 triangle is 6, a unit square is 1 — and against the properties that
 * must hold whatever the implementation: symmetric, never negative, bounded,
 * and unchanged by the order the corners happen to be listed in.
 */

const SQUARE = rectanglePlot(10, 10);

/**
 * An L, traced anticlockwise. The notch at the top right is the point of it:
 * a convex test would call the notch inside, and beds drawn freehand are very
 * often this shape.
 */
const L_SHAPE = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 10 },
  { x: 0, y: 10 },
];

describe('the bounding box of a shape', () => {
  it('is the shape itself for a rectangle', () => {
    expect(polygonBounds(rectanglePlot(14, 10))).toEqual({
      minX: 0,
      minY: 0,
      maxX: 14,
      maxY: 10,
    });
  });

  it('does not care what order the corners are listed in', () => {
    const reversed = [...SQUARE].reverse();
    expect(polygonBounds(reversed)).toEqual(polygonBounds(SQUARE));
  });

  it('collapses to the point itself when there is only one', () => {
    expect(polygonBounds([{ x: 3, y: 7 }])).toEqual({ minX: 3, minY: 7, maxX: 3, maxY: 7 });
  });

  /**
   * Zeroes rather than Infinities. Callers divide by the span, and an empty plot
   * is a real state — it is what exists before the first outline is drawn.
   */
  it('gives zeroes for an empty shape rather than infinities', () => {
    const b = polygonBounds([]);
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
    expect(Number.isFinite(b.maxX)).toBe(true);
  });

  it('handles corners in negative space', () => {
    expect(polygonBounds([{ x: -5, y: -2 }, { x: 3, y: 8 }])).toEqual({
      minX: -5,
      minY: -2,
      maxX: 3,
      maxY: 8,
    });
  });
});

describe('whether a point is inside a shape', () => {
  it('says yes in the middle and no well outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 50 }, SQUARE)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 5 }, SQUARE)).toBe(false);
  });

  /**
   * The property the whole ray-casting approach exists for. A bed drawn freehand
   * is routinely concave, and "inside the bounding box" or "inside the hull"
   * would both put this point in the bed.
   */
  it('excludes the notch of a concave shape', () => {
    expect(pointInPolygon({ x: 7, y: 7 }, L_SHAPE)).toBe(false);
    expect(pointInPolygon({ x: 2, y: 7 }, L_SHAPE)).toBe(true);
    expect(pointInPolygon({ x: 7, y: 2 }, L_SHAPE)).toBe(true);
  });

  it('gives the same answer whichever way round the outline was drawn', () => {
    const clockwise = [...L_SHAPE].reverse();
    for (const p of [
      { x: 7, y: 7 },
      { x: 2, y: 7 },
      { x: 7, y: 2 },
      { x: 2, y: 2 },
    ]) {
      expect(pointInPolygon(p, clockwise)).toBe(pointInPolygon(p, L_SHAPE));
    }
  });

  it('is never inside a shape with no area', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(pointInPolygon({ x: 1, y: 1 }, [{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe(false);
  });
});

describe('the area of a shape', () => {
  it('matches arithmetic done by hand', () => {
    expect(polygonArea(rectanglePlot(10, 10))).toBeCloseTo(100, 9);
    expect(polygonArea(rectanglePlot(14, 10))).toBeCloseTo(140, 9);
    // A 3-4-5 right triangle: half of three times four.
    expect(polygonArea([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }])).toBeCloseTo(6, 9);
    // The L is the 10×10 square less the 6×6 notch.
    expect(polygonArea(L_SHAPE)).toBeCloseTo(64, 9);
  });

  /**
   * Absolute, not signed — despite the doc comment on the function, which
   * describes the intermediate shoelace sum rather than what is returned. Pinned
   * here because a caller reading that comment would expect the sign to tell it
   * the winding direction, and it never will.
   */
  it('is never negative, whichever way the outline was drawn', () => {
    const clockwise = [...L_SHAPE].reverse();
    expect(polygonArea(clockwise)).toBeCloseTo(polygonArea(L_SHAPE), 9);
    expect(polygonArea(clockwise)).toBeGreaterThan(0);
  });

  it('is zero for a shape that encloses nothing', () => {
    expect(polygonArea([])).toBe(0);
    expect(polygonArea([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBeCloseTo(0, 9);
  });
});

describe('the middle of a shape', () => {
  it('is the centre of a rectangle', () => {
    expect(polygonCentroid(rectanglePlot(14, 10))).toEqual({ x: 7, y: 5 });
  });

  /**
   * The middle of the *bounding box*, not the true centre of mass — for the L
   * those differ, and this is the box. Pinned deliberately: the name invites a
   * later "fix" to a real centroid, which would silently move every plot's
   * datum, and with it the terrain's zero height.
   */
  it('is the box centre rather than the centre of mass', () => {
    expect(polygonCentroid(L_SHAPE)).toEqual({ x: 5, y: 5 });
  });

  it('sits inside its own bounds', () => {
    const c = polygonCentroid(L_SHAPE);
    const b = polygonBounds(L_SHAPE);
    expect(c.x).toBeGreaterThanOrEqual(b.minX);
    expect(c.x).toBeLessThanOrEqual(b.maxX);
    expect(c.y).toBeGreaterThanOrEqual(b.minY);
    expect(c.y).toBeLessThanOrEqual(b.maxY);
  });
});

describe('a rectangular plot', () => {
  it('has four corners the stated size apart', () => {
    const plot = rectanglePlot(14, 10);
    expect(plot).toHaveLength(4);
    expect(polygonBounds(plot)).toEqual({ minX: 0, minY: 0, maxX: 14, maxY: 10 });
    expect(polygonArea(plot)).toBeCloseTo(140, 9);
  });

  it('starts at the origin, so a plot and its screen space share a corner', () => {
    expect(rectanglePlot(5, 3)[0]).toEqual({ x: 0, y: 0 });
  });

  it('contains its own middle and excludes a point beyond its edge', () => {
    const plot = rectanglePlot(14, 10);
    expect(pointInPolygon({ x: 7, y: 5 }, plot)).toBe(true);
    expect(pointInPolygon({ x: 14.1, y: 5 }, plot)).toBe(false);
  });
});

describe('distance between two points', () => {
  it('is the hypotenuse of a 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 9);
  });

  it('is symmetric, and zero only for the same point', () => {
    const a = { x: -2, y: 6 };
    const b = { x: 9, y: 1.5 };
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 9);
    expect(distance(a, a)).toBe(0);
    expect(distance(a, b)).toBeGreaterThan(0);
  });
});

describe('distance from a point to a wall segment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('drops a perpendicular when the foot lands on the segment', () => {
    const r = pointToSegment({ x: 4, y: 3 }, a, b);
    expect(r.dist).toBeCloseTo(3, 9);
    expect(r.t).toBeCloseTo(0.4, 9);
  });

  /**
   * Past the end it must measure to the end, not to the infinite line. A wall is
   * ten metres long, and something twenty metres past it is not touching it.
   */
  it('clamps to the ends rather than measuring to the infinite line', () => {
    const before = pointToSegment({ x: -5, y: 0 }, a, b);
    expect(before.dist).toBeCloseTo(5, 9);
    expect(before.t).toBe(0);

    const after = pointToSegment({ x: 20, y: 0 }, a, b);
    expect(after.dist).toBeCloseTo(10, 9);
    expect(after.t).toBe(1);
  });

  it('keeps the position along the segment between the two ends', () => {
    for (const p of [
      { x: -100, y: -100 },
      { x: 5, y: 50 },
      { x: 200, y: 3 },
      { x: 0, y: 0 },
    ]) {
      const { t, dist } = pointToSegment(p, a, b);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      expect(dist).toBeGreaterThanOrEqual(0);
    }
  });

  it('treats a zero-length wall as the point it stands on', () => {
    const r = pointToSegment({ x: 3, y: 4 }, a, a);
    expect(r.dist).toBeCloseTo(5, 9);
    expect(r.t).toBe(0);
  });

  it('is zero when the point is on the wall', () => {
    expect(pointToSegment({ x: 6, y: 0 }, a, b).dist).toBeCloseTo(0, 9);
  });

  it('does not depend on which end is given first', () => {
    const p = { x: 4, y: 3 };
    expect(pointToSegment(p, a, b).dist).toBeCloseTo(pointToSegment(p, b, a).dist, 9);
  });
});
