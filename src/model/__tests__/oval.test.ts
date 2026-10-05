import { describe, expect, it } from 'vitest';
import {
  SMALLEST_RADIUS,
  axesFromBox,
  axesOf,
  ovalHandles,
  ovalOutline,
  resizeOval,
} from '../oval';
import { pointInPolygon, polygonArea } from '../geometry';

/**
 * A round or oval bed is a many-cornered outline, so the thing worth asserting
 * is not how it is drawn but that it is the shape it claims to be: the right
 * size, the right place, closed, and still an oval after it has been dragged
 * about by its handles.
 */

const near = (a: number, b: number, within = 0.02) => Math.abs(a - b) <= within;

describe('an oval fills the box it was dragged out in', () => {
  it('takes its centre and radii from two opposite corners', () => {
    const { centre, rx, ry } = axesFromBox({ x: 2, y: 3 }, { x: 8, y: 7 });
    expect(centre).toEqual({ x: 5, y: 5 });
    expect(rx).toBe(3);
    expect(ry).toBe(2);
  });

  it('does not care which corner was clicked first', () => {
    const forwards = axesFromBox({ x: 2, y: 3 }, { x: 8, y: 7 });
    const backwards = axesFromBox({ x: 8, y: 7 }, { x: 2, y: 3 });
    expect(backwards).toEqual(forwards);
  });

  it('drawn upwards and to the left gives the same oval', () => {
    const across = axesFromBox({ x: 8, y: 3 }, { x: 2, y: 7 });
    expect(across.centre).toEqual({ x: 5, y: 5 });
    expect(across.rx).toBe(3);
  });

  it('reads its own outline back to the size it was given', () => {
    const points = ovalOutline({ x: 2, y: 3 }, { x: 8, y: 7 });
    const { centre, rx, ry } = axesOf(points);
    expect(near(centre.x, 5)).toBe(true);
    expect(near(centre.y, 5)).toBe(true);
    expect(near(rx, 3)).toBe(true);
    expect(near(ry, 2)).toBe(true);
  });

  it('refuses to be a speck, however small the box', () => {
    const { rx, ry } = axesFromBox({ x: 5, y: 5 }, { x: 5.001, y: 5.001 });
    expect(rx).toBe(SMALLEST_RADIUS);
    expect(ry).toBe(SMALLEST_RADIUS);
  });
});

describe('a box near enough to square means a circle', () => {
  it('rounds a hand-drawn near-square to a true circle', () => {
    // Nobody drags out a square by eye; within a twelfth is a slip, not intent.
    const { rx, ry } = axesFromBox({ x: 0, y: 0 }, { x: 4, y: 4.2 });
    expect(rx).toBe(ry);
  });

  it('leaves a shape that was plainly meant to be an oval alone', () => {
    const { rx, ry } = axesFromBox({ x: 0, y: 0 }, { x: 6, y: 3 });
    expect(rx).toBe(3);
    expect(ry).toBe(1.5);
  });
});

describe('the outline is a usable polygon', () => {
  it('encloses its own centre', () => {
    const points = ovalOutline({ x: 1, y: 1 }, { x: 5, y: 3 });
    expect(pointInPolygon({ x: 3, y: 2 }, points)).toBe(true);
  });

  it('excludes the corners of the box it was drawn in', () => {
    // The whole point of an oval rather than a rectangle.
    const points = ovalOutline({ x: 1, y: 1 }, { x: 5, y: 3 });
    expect(pointInPolygon({ x: 1.05, y: 1.05 }, points)).toBe(false);
    expect(pointInPolygon({ x: 4.95, y: 2.95 }, points)).toBe(false);
  });

  it('comes close to the area of the ellipse it stands for', () => {
    // A polygon inscribed in an ellipse always falls a little short; more than
    // a couple of per cent means too few corners to read as a curve.
    const rx = 3;
    const ry = 2;
    const points = ovalOutline({ x: 0, y: 0 }, { x: rx * 2, y: ry * 2 });
    const exact = Math.PI * rx * ry;
    expect(polygonArea(points)).toBeGreaterThan(exact * 0.98);
    expect(polygonArea(points)).toBeLessThanOrEqual(exact);
  });

  it('never repeats its first corner at the end', () => {
    // A bed's outline is closed by the drawing, not by a duplicate point.
    const points = ovalOutline({ x: 0, y: 0 }, { x: 4, y: 4 });
    const first = points[0];
    const last = points[points.length - 1];
    expect(first.x === last.x && first.y === last.y).toBe(false);
  });

  it('gives a long thin oval more corners than a small round one', () => {
    const small = ovalOutline({ x: 0, y: 0 }, { x: 1, y: 1 });
    const long = ovalOutline({ x: 0, y: 0 }, { x: 14, y: 3 });
    expect(long.length).toBeGreaterThan(small.length);
  });
});

describe('stretching it by a handle', () => {
  const points = ovalOutline({ x: 2, y: 2 }, { x: 8, y: 6 });

  it('offers four handles, on the ends of the axes', () => {
    const handles = ovalHandles(points);
    expect(handles).toHaveLength(4);
    const { centre, rx, ry } = axesOf(points);
    expect(near(handles[0].x, centre.x - rx)).toBe(true);
    expect(near(handles[1].x, centre.x + rx)).toBe(true);
    expect(near(handles[2].y, centre.y - ry)).toBe(true);
    expect(near(handles[3].y, centre.y + ry)).toBe(true);
  });

  it('keeps the opposite side where it was', () => {
    // Growing about the centre would walk the far edge off whatever it was
    // lined up against — a path, a fence — which is never what was meant.
    const before = axesOf(points);
    const east = before.centre.x + before.rx;

    const after = axesOf(resizeOval(points, 0, { x: 0, y: 4 }));

    expect(near(after.centre.x + after.rx, east)).toBe(true);
    expect(near(after.rx, (east - 0) / 2)).toBe(true);
  });

  it('stretching sideways leaves the depth alone', () => {
    const before = axesOf(points);
    const after = axesOf(resizeOval(points, 1, { x: 12, y: 4 }));
    expect(near(after.ry, before.ry)).toBe(true);
  });

  it('stretching the depth leaves the width alone', () => {
    const before = axesOf(points);
    const after = axesOf(resizeOval(points, 3, { x: 5, y: 11 }));
    expect(near(after.rx, before.rx)).toBe(true);
  });

  it('is still an oval afterwards, not a dented one', () => {
    const stretched = resizeOval(points, 1, { x: 14, y: 4 });
    const { centre, rx, ry } = axesOf(stretched);
    for (const p of stretched) {
      const onTheCurve = ((p.x - centre.x) / rx) ** 2 + ((p.y - centre.y) / ry) ** 2;
      expect(near(onTheCurve, 1, 0.001)).toBe(true);
    }
  });

  it('will not turn inside out when dragged past its far side', () => {
    // The handle would otherwise jump to the opposite side of the bed, under a
    // hand that is still moving the other way.
    const after = axesOf(resizeOval(points, 1, { x: -5, y: 4 }));
    expect(after.rx).toBeGreaterThanOrEqual(SMALLEST_RADIUS);
    expect(Number.isFinite(after.centre.x)).toBe(true);
  });

  it('ignores a handle index it does not have', () => {
    expect(resizeOval(points, 9, { x: 0, y: 0 })).toEqual(points);
  });
});
