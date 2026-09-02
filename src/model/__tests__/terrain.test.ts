import { describe, expect, it } from 'vitest';
import {
  SLOPE_FALL_RANGE,
  clampSlopeFall,
  fallTowards,
  normaliseSlopeDirection,
  shadowCastOnSlope,
  groundAt,
  shadowReachOnSlope,
  terrainOf,
  terrainRange,
} from '../terrain';
import { computeShadeGrid } from '../shade';
import { shadowLengthFactor } from '../sun';
import { DRAWN_SHADOW_CAP } from '../../render/constants';
import { rectanglePlot } from '../geometry';
import type { PlantInstance, Site } from '../types';

/**
 * A garden on a slope is a different garden, and the difference has to show in
 * the numbers rather than only in the picture: a shadow thrown downhill chases
 * ground that is falling away beneath it and reaches much further than the same
 * shadow on the level.
 */

const PLOT = rectanglePlot(20, 20);

function site(fall: number, direction = 180): Site {
  return {
    latitude: 51.5,
    longitude: -0.13,
    altitude: 0,
    northAngle: 0,
    dst: true,
    label: 'London',
    slopeFall: fall,
    slopeDirection: direction,
  };
}

describe('the lie of the land', () => {
  it('is level until it is given a fall', () => {
    expect(terrainOf(PLOT, site(0)).gradient).toBe(0);
    expect(groundAt(terrainOf(PLOT, site(0)), { x: 3, y: 17 })).toBe(0);
  });

  it('measures heights from the middle of the plot, which stays at zero', () => {
    const t = terrainOf(PLOT, site(2));
    expect(groundAt(t, { x: 10, y: 10 })).toBeCloseTo(0, 6);
  });

  /**
   * North is up the page by default, so a fall to the south is a fall down the
   * screen: the top of the plot is the high ground.
   */
  it('puts the high ground at the end it falls away from', () => {
    const t = terrainOf(PLOT, site(2, 180));
    expect(groundAt(t, { x: 10, y: 0 })).toBeGreaterThan(0);
    expect(groundAt(t, { x: 10, y: 20 })).toBeLessThan(0);
  });

  it('drops by the stated fall across the plot, no more and no less', () => {
    const t = terrainOf(PLOT, site(2, 180));
    const { low, high } = terrainRange(PLOT, t);
    expect(high - low).toBeCloseTo(2, 5);
  });

  it('states the same fall as a steeper gradient on a smaller plot', () => {
    const big = terrainOf(rectanglePlot(40, 40), site(2, 180));
    const small = terrainOf(rectanglePlot(10, 10), site(2, 180));
    expect(small.gradient).toBeGreaterThan(big.gradient);
  });

  it('runs across the contour without rising or falling', () => {
    const t = terrainOf(PLOT, site(2, 180));
    // Along the slope is north–south; across it is east–west.
    expect(groundAt(t, { x: 2, y: 10 })).toBeCloseTo(groundAt(t, { x: 18, y: 10 }), 6);
  });

  it('reports how steeply the ground falls away in a given direction', () => {
    const t = terrainOf(PLOT, site(2, 180));
    const downhill = fallTowards(t, 0, 1);
    expect(downhill).toBeGreaterThan(0);
    expect(fallTowards(t, 0, -1)).toBeCloseTo(-downhill, 6);
    // Along the contour the ground neither rises nor falls.
    expect(fallTowards(t, 1, 0)).toBeCloseTo(0, 6);
  });

  it('is level for a plot too small to have a slope across it', () => {
    expect(terrainOf([{ x: 0, y: 0 }], site(2)).gradient).toBe(0);
    expect(terrainOf(PLOT, site(-1)).gradient).toBe(0);
  });
});

describe('how far a shadow reaches over sloping ground', () => {
  const level = shadowReachOnSlope(30, 0);

  it('matches the flat case when the ground is level', () => {
    expect(level).toBeCloseTo(1 / Math.tan((30 * Math.PI) / 180), 5);
  });

  it('reaches further downhill and less far uphill', () => {
    expect(shadowReachOnSlope(30, 0.2)).toBeGreaterThan(level);
    expect(shadowReachOnSlope(30, -0.2)).toBeLessThan(level);
  });

  /**
   * Where the ground falls as steeply as the light does, a shadow never lands.
   * A garden is not a mountain, so it is clamped rather than left unbounded.
   */
  it('does not run away when the slope matches the sun', () => {
    const grazing = shadowReachOnSlope(10, Math.tan((10 * Math.PI) / 180));
    expect(Number.isFinite(grazing)).toBe(true);
    expect(grazing).toBeLessThanOrEqual(60);
    expect(shadowReachOnSlope(5, 2)).toBeLessThanOrEqual(60);
  });

  it('never returns a shadow pointing backwards', () => {
    for (const fall of [0, 0.3, 0.9, 3]) {
      for (const alt of [1, 10, 30, 60]) {
        expect(shadowReachOnSlope(alt, fall)).toBeGreaterThan(0);
      }
    }
  });
});

describe('what a slope does to the sun map', () => {
  const noon = { hour: 12, doy: 172, year: 0 };
  const YEAR = 2026;
  const yew = (x: number, y: number): PlantInstance => ({
    id: `${x}-${y}`,
    speciesId: 'taxus-baccata',
    x,
    y,
    seed: 1,
    plantedAge: 10,
  });

  const totalSun = (s: Site, plants: PlantInstance[]) => {
    const grid = computeShadeGrid(PLOT, plants, s, noon, YEAR);
    let sum = 0;
    for (const h of grid.hours) if (h >= 0) sum += h;
    return sum;
  };

  it('leaves an empty garden alone — the ground still faces the sky', () => {
    // Nothing casts, so nothing changes: this model bounds shadows, and does
    // not claim to compute how much energy a tilted surface receives.
    expect(totalSun(site(3, 180), [])).toBeCloseTo(totalSun(site(0), []), 5);
  });

  it('costs more sun when shadows are thrown downhill', () => {
    const plants = [yew(10, 8)];
    // At London the sun is south all day, so shadows fall north. Ground falling
    // north runs away beneath them and they reach further.
    const downhill = totalSun(site(3, 0), plants);
    const level = totalSun(site(0), plants);
    expect(downhill).toBeLessThan(level);
  });

  it('costs less when the ground rises to meet the shadow', () => {
    const plants = [yew(10, 8)];
    expect(totalSun(site(3, 180), plants)).toBeGreaterThan(totalSun(site(0), plants));
  });

  it('never reports more sun than there is daylight, however steep', () => {
    const grid = computeShadeGrid(PLOT, [yew(10, 10)], site(6, 0), noon, YEAR);
    // The hours are accumulated in 32-bit floats, whose resolution at sixteen
    // hours is a few millionths — so the tolerance is set by the storage, not
    // by how much slack the model is being allowed.
    for (const h of grid.hours) expect(h).toBeLessThanOrEqual(grid.maxHours + 1e-4);
  });
});

describe('the one shadow cast that map and drawing share', () => {
  const level = terrainOf(PLOT, site(0));
  const fallsSouth = terrainOf(PLOT, site(3, 180));

  /**
   * The fault this closes: the sun map was given the slope while the plan, the
   * walls and the elevation each kept a flat copy of the same sum, so on a
   * hillside the overlay and the picture beneath it disagreed about one shadow.
   */
  it('gives the same direction the sun map steps shadows along', () => {
    // Sun in the south at noon, so shadows fall north — up the page.
    const cast = shadowCastOnSlope(level, 60, 180, 0);
    expect(cast.uy).toBeLessThan(0);
    expect(Math.abs(cast.ux)).toBeLessThan(1e-9);
    expect(Math.hypot(cast.ux, cast.uy)).toBeCloseTo(1, 9);
  });

  it('matches the flat calculation exactly when the ground is level', () => {
    for (const altitude of [5, 20, 45, 70]) {
      expect(shadowCastOnSlope(level, altitude, 180, 0).reach).toBeCloseTo(
        1 / Math.tan((altitude * Math.PI) / 180),
        6,
      );
    }
  });

  it('lengthens a shadow thrown downhill and shortens one thrown uphill', () => {
    const flat = shadowCastOnSlope(level, 30, 180, 0).reach;
    // Shadows fall north; ground falling north runs away beneath them.
    const downhill = shadowCastOnSlope(terrainOf(PLOT, site(3, 0)), 30, 180, 0).reach;
    const uphill = shadowCastOnSlope(fallsSouth, 30, 180, 0).reach;
    expect(downhill).toBeGreaterThan(flat);
    expect(uphill).toBeLessThan(flat);
  });

  it('turns with the north dial, so the slope is read in the right direction', () => {
    // Same garden, dial turned a quarter: the fall now lies across the shadow.
    const straightOn = shadowCastOnSlope(fallsSouth, 30, 180, 0).reach;
    const acrossTheFall = shadowCastOnSlope(fallsSouth, 30, 180, 90).reach;
    expect(acrossTheFall).not.toBeCloseTo(straightOn, 3);
  });

  /**
   * The guarantee that let this change ship: a level garden is drawn exactly as
   * it was. Capping the shared reach at twelve reproduces the flat calculation
   * term for term, so nothing moves on the flat gardens already in use.
   */
  it('draws a level garden identically to the flat calculation it replaced', () => {
    for (const altitude of [0.6, 1, 5, 15, 30, 45, 60, 85]) {
      const drawn = Math.min(DRAWN_SHADOW_CAP, shadowCastOnSlope(level, altitude, 180, 0).reach);
      expect(drawn).toBeCloseTo(shadowLengthFactor(altitude), 9);
    }
  });

  it('never hands a drawing a shadow it cannot cap', () => {
    for (const fall of [0, 3, 6]) {
      for (const altitude of [0.5, 5, 30, 80]) {
        const { reach } = shadowCastOnSlope(terrainOf(PLOT, site(fall, 0)), altitude, 180, 0);
        expect(Number.isFinite(reach)).toBe(true);
        expect(reach).toBeGreaterThan(0);
      }
    }
  });
});

describe('one range for the fall, at every boundary', () => {
  /**
   * Three places used to disagree about the same figure: the control stopped at
   * six, the file reader allowed twenty, and the store accepted anything. A
   * file carrying fifteen drew a fifteen-metre fall while the slider sat at
   * six, and the first touch of that slider silently rewrote the garden.
   */
  it('brings any figure into the range the control can reach', () => {
    expect(clampSlopeFall(15)).toBe(SLOPE_FALL_RANGE.max);
    expect(clampSlopeFall(-3)).toBe(SLOPE_FALL_RANGE.min);
    expect(clampSlopeFall(2.5)).toBe(2.5);
  });

  it('reads nonsense as level rather than as a slope of nothing-in-particular', () => {
    // Neither is a figure the ground can be built from, so both mean level —
    // the same answer, rather than one of them becoming the steepest garden
    // the app allows.
    expect(clampSlopeFall(Number.NaN)).toBe(0);
    expect(clampSlopeFall(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampSlopeFall(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('wraps a direction onto the compass', () => {
    expect(normaliseSlopeDirection(370)).toBeCloseTo(10, 9);
    expect(normaliseSlopeDirection(-90)).toBeCloseTo(270, 9);
    expect(normaliseSlopeDirection(180)).toBeCloseTo(180, 9);
    expect(normaliseSlopeDirection(Number.NaN)).toBe(180);
  });

  it('never builds ground the control could not have made', () => {
    // Whatever comes in, the terrain is one the slider can reproduce.
    for (const fall of [-5, 0, 3, 15, 1e9, Number.NaN, Number.POSITIVE_INFINITY]) {
      const clamped = clampSlopeFall(fall);
      expect(clamped).toBeGreaterThanOrEqual(SLOPE_FALL_RANGE.min);
      expect(clamped).toBeLessThanOrEqual(SLOPE_FALL_RANGE.max);
    }
  });
});
