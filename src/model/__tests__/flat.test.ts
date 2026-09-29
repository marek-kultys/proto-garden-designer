import { describe, expect, it } from 'vitest';
import { FLAT_DEPTH, flatFacing, flatFootprint, flatShadow } from '../flat';
import { polygonArea, pointInPolygon, rectanglePlot } from '../geometry';
import { computeShadeGrid } from '../shade';
import type { PlantInstance, Site } from '../types';

/**
 * A plant grown flat is a sheet on a support, and its shade has to say so.
 *
 * The fault these pin down was live for months: the plan drew a climber as a
 * band while the sun map shaded a disc as wide as the plant had run along its
 * fence, so a mature Boston ivy — seven metres of ivy a foot deep — put a
 * seven-metre circle of shade on the map, and every bed near a clothed fence
 * read far darker than it was. The numbers below are chosen to fail if that
 * disc ever comes back: the same scene measured 93% of the plot in full sun
 * under the old model and 98% under this one.
 */

const LONDON: Site = {
  latitude: 51.5,
  longitude: -0.13,
  altitude: 0,
  northAngle: 0,
  dst: true,
  label: 'London',
};

const PLOT = rectanglePlot(14, 10);
const YEAR = 2026;
const MIDSUMMER = { hour: 13, doy: 172, year: 8 };

function ivy(facing?: number): PlantInstance {
  return {
    id: 'ivy',
    speciesId: 'parthenocissus-tricuspidata',
    x: 7,
    y: 8,
    seed: 12345,
    plantedAge: 0,
    ...(facing === undefined ? {} : { facing }),
  };
}

const STILL_AIR = { ux: 1, uy: 0, reach: 2 };

describe('which way a flat plant runs', () => {
  it('follows the angle it was given', () => {
    expect(flatFacing({ ...ivy(90) })).toBeCloseTo(Math.PI / 2, 9);
    expect(flatFacing({ ...ivy(0) })).toBeCloseTo(0, 9);
  });

  /** A plane reads the same from either side, so the answer lives in half a turn. */
  it('treats a half turn as the same plane', () => {
    expect(flatFacing(ivy(270))).toBeCloseTo(flatFacing(ivy(90)), 9);
    expect(flatFacing(ivy(-90))).toBeCloseTo(flatFacing(ivy(90)), 9);
  });

  it('gives an unturned plant a stable angle of its own', () => {
    const first = flatFacing(ivy());
    expect(flatFacing(ivy())).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(Math.PI);
    // Two plants of the same species differ, because two fences may.
    expect(flatFacing({ ...ivy(), seed: 999 })).not.toBe(first);
  });
});

describe('the ground a flat plant stands on', () => {
  it('is its run along the support by its depth, not a disc of its spread', () => {
    const foot = flatFootprint(ivy(0), 6);
    expect(polygonArea(foot)).toBeCloseTo(6 * FLAT_DEPTH, 6);
    // A disc of that spread would cover nearly thirty square metres.
    expect(polygonArea(foot)).toBeLessThan(Math.PI * 3 * 3 * 0.15);
  });

  /**
   * Facing zero lies along the plan's x axis — east–west while north points up
   * the page — which is what the control that turns a climber assumes when it
   * converts an angle to a compass line. Pinned because the two must agree: a
   * quarter turn between them would label every fence wrongly.
   */
  it('points the way the plant has been turned', () => {
    const along = flatFootprint(ivy(0), 6);
    expect(pointInPolygon({ x: 9, y: 8 }, along)).toBe(true);
    expect(pointInPolygon({ x: 7, y: 10 }, along)).toBe(false);

    const across = flatFootprint(ivy(90), 6);
    expect(pointInPolygon({ x: 7, y: 10 }, across)).toBe(true);
    expect(pointInPolygon({ x: 9, y: 8 }, across)).toBe(false);
  });
});

describe('the shadow a flat plant throws', () => {
  const size = { height: 2.2, spread: 6 };

  it('is the band itself when the sun is overhead', () => {
    const shape = flatShadow(ivy(0), { height: 0, spread: 6 }, 0, STILL_AIR, 40);
    expect(polygonArea(shape)).toBeCloseTo(6 * FLAT_DEPTH, 6);
  });

  it('reaches further the taller the plant and the longer the shadow', () => {
    const shortReach = polygonArea(flatShadow(ivy(90), size, 0, STILL_AIR, 40));
    const longReach = polygonArea(flatShadow(ivy(90), size, 0, { ...STILL_AIR, reach: 6 }, 40));
    expect(longReach).toBeGreaterThan(shortReach);
    // Broadside to the sun, a six-metre band thrown 4.4 m covers its own
    // footprint plus six metres by that throw.
    expect(shortReach).toBeCloseTo(6 * FLAT_DEPTH + 6 * 2.2 * 2, 1);
  });

  /**
   * Which is the whole point: the same plant, turned, shades a tenth of the
   * ground. A disc knows nothing of this, and neither did the sun map.
   */
  it('shades far less ground edge-on to the sun than broadside', () => {
    const edgeOn = polygonArea(flatShadow(ivy(0), size, 0, STILL_AIR, 40));
    const broadside = polygonArea(flatShadow(ivy(90), size, 0, STILL_AIR, 40));
    expect(edgeOn).toBeCloseTo(FLAT_DEPTH * (6 + 2.2 * 2), 1);
    expect(edgeOn).toBeLessThan(broadside / 5);
  });

  it('stops at the cap however low the sun', () => {
    const capped = flatShadow(ivy(0), size, 0, { ux: 1, uy: 0, reach: 400 }, 40);
    let maxX = -Infinity;
    for (const p of capped) maxX = Math.max(maxX, p.x);
    // The plant's own half-run, and then forty metres of shadow and no more.
    expect(maxX).toBeCloseTo(7 + 3 + 40, 6);
  });

  it('starts further out when the plant stands in a raised bed', () => {
    const onTheGround = flatShadow(ivy(0), size, 0, STILL_AIR, 40);
    const raised = flatShadow(ivy(0), size, 0.5, STILL_AIR, 40);
    const leftmost = (poly: { x: number }[]) => Math.min(...poly.map((p) => p.x));
    expect(leftmost(raised)).toBeGreaterThan(leftmost(onTheGround));
  });
});

describe('a climber on the sun map', () => {
  it('leaves the garden round it in sun, as a foot-deep plant does', () => {
    const grid = computeShadeGrid(PLOT, [ivy(0)], LONDON, MIDSUMMER, YEAR);
    // Under the disc this was 93% and 7%. The plant has not changed; what it
    // claims about the ground beside it has.
    expect(grid.bands.fullSun).toBeGreaterThan(0.96);
    expect(grid.bands.partial).toBeLessThan(0.03);
  });

  it('shades different ground depending which way it is turned', () => {
    const along = computeShadeGrid(PLOT, [ivy(0)], LONDON, MIDSUMMER, YEAR);
    const across = computeShadeGrid(PLOT, [ivy(90)], LONDON, MIDSUMMER, YEAR);
    let differing = 0;
    for (let i = 0; i < along.hours.length; i++) {
      if (along.hours[i] >= 0 && Math.abs(along.hours[i] - across.hours[i]) > 0.25) differing++;
    }
    // Turning a climber used to change nothing at all here: the disc it was
    // shaded as had no orientation to turn.
    expect(differing).toBeGreaterThan(50);
  });

  it('still takes light from the ground its own shadow falls on', () => {
    const empty = computeShadeGrid(PLOT, [], LONDON, MIDSUMMER, YEAR);
    const grid = computeShadeGrid(PLOT, [ivy(90)], LONDON, MIDSUMMER, YEAR);
    let lost = 0;
    for (let i = 0; i < grid.hours.length; i++) {
      if (grid.hours[i] >= 0 && empty.hours[i] - grid.hours[i] > 0.5) lost++;
    }
    expect(lost).toBeGreaterThan(20);
  });
});
