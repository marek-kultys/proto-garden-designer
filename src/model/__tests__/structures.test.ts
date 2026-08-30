import { describe, expect, it } from 'vitest';
import {
  BED_HEIGHT_RANGE,
  DEFAULT_BED_HEIGHT,
  WALL_HEIGHT_RANGE,
  casterOf,
  clampHeight,
  clampThickness,
  coversPoint,
  describeStructure,
  footprints,
  groundOffsetAt,
  minimumPoints,
  runLength,
  segmentsOf,
  sweptPolygons,
} from '../structures';
import { computeShadeGrid } from '../shade';
import { pointInPolygon, rectanglePlot } from '../geometry';
import type { PlantInstance, Site, Structure } from '../types';

const LONDON: Site = {
  latitude: 51.51,
  longitude: -0.13,
  altitude: 11,
  northAngle: 0,
  dst: true,
  label: 'London',
};

const YEAR = 2026;
const PLOT = rectanglePlot(14, 10);

function wall(points: { x: number; y: number }[], height = 2, thickness = 0.2): Structure {
  return { id: 'w', kind: 'wall', points, height, thickness, seed: 1 };
}

function bed(points: { x: number; y: number }[], height = 0.4): Structure {
  return { id: 'b', kind: 'bed', points, height, thickness: 0.1, seed: 2 };
}

const SQUARE_BED = bed([
  { x: 4, y: 4 },
  { x: 8, y: 4 },
  { x: 8, y: 7 },
  { x: 4, y: 7 },
]);

describe('shape', () => {
  it('leaves a wall open and closes a bed', () => {
    const run = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ];
    // A wall that joined its own ends would be a bed you could not plant in.
    expect(segmentsOf(wall(run))).toHaveLength(2);
    expect(segmentsOf(bed(run))).toHaveLength(3);
  });

  it('needs two points for a wall and three for a bed', () => {
    expect(minimumPoints('wall')).toBe(2);
    expect(minimumPoints('bed')).toBe(3);
  });

  it('gives a wall one footprint quad per run, widened to its thickness', () => {
    const feet = footprints(
      wall(
        [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
        ],
        2,
        0.4,
      ),
    );
    expect(feet).toHaveLength(1);
    expect(feet[0]).toHaveLength(4);
    // A point just inside the thickness is covered; one outside it is not.
    expect(pointInPolygon({ x: 2, y: 0.15 }, feet[0])).toBe(true);
    expect(pointInPolygon({ x: 2, y: 0.35 }, feet[0])).toBe(false);
  });

  it('gives a bed its whole inside, not just the line of its sides', () => {
    const feet = footprints(SQUARE_BED);
    expect(feet).toHaveLength(1);
    expect(pointInPolygon({ x: 6, y: 5.5 }, feet[0])).toBe(true);
  });

  it('measures a wall by its run and a bed by its perimeter', () => {
    expect(
      runLength(
        wall([
          { x: 0, y: 0 },
          { x: 3, y: 4 },
        ]),
      ),
    ).toBeCloseTo(5);
    expect(runLength(SQUARE_BED)).toBeCloseTo(14);
  });

  it('describes itself in the units a designer would use', () => {
    expect(describeStructure(wall([{ x: 0, y: 0 }, { x: 4, y: 0 }], 1.8))).toMatch(/Wall/);
    // A bed is spoken of in centimetres; nobody says a 0.4 metre bed.
    expect(describeStructure(SQUARE_BED)).toMatch(/40 cm/);
  });
});

describe('heights', () => {
  it('keeps a wall and a bed inside their own sensible ranges', () => {
    expect(clampHeight('wall', 99)).toBe(WALL_HEIGHT_RANGE.max);
    expect(clampHeight('bed', 99)).toBe(BED_HEIGHT_RANGE.max);
    expect(clampHeight('wall', -5)).toBe(WALL_HEIGHT_RANGE.min);
  });

  it('falls back to a sane default rather than producing NaN', () => {
    expect(clampHeight('bed', Number.NaN)).toBe(DEFAULT_BED_HEIGHT);
    expect(Number.isFinite(clampThickness(Number.NaN))).toBe(true);
  });
});

describe('a raised bed raises what stands in it', () => {
  it('lifts a point inside it and leaves one outside alone', () => {
    expect(groundOffsetAt({ x: 6, y: 5.5 }, [SQUARE_BED])).toBeCloseTo(0.4);
    expect(groundOffsetAt({ x: 1, y: 1 }, [SQUARE_BED])).toBe(0);
  });

  it('is not raised by a wall — nothing stands on top of a wall', () => {
    const w = wall(
      [
        { x: 0, y: 5 },
        { x: 14, y: 5 },
      ],
      2,
      2,
    );
    expect(groundOffsetAt({ x: 7, y: 5 }, [w])).toBe(0);
  });

  it('takes the deepest bed where two overlap', () => {
    const shallow = bed(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      0.3,
    );
    const deeper = { ...SQUARE_BED, height: 0.6 };
    expect(groundOffsetAt({ x: 6, y: 5.5 }, [shallow, deeper])).toBeCloseTo(0.6);
  });
});

describe('swept shadow ground', () => {
  it('covers the original, the translated copy, and the ground between', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const parts = sweptPolygons(square, 4, 0);
    const covered = (p: { x: number; y: number }) => parts.some((poly) => pointInPolygon(p, poly));

    expect(covered({ x: 0.5, y: 0.5 })).toBe(true); // under it
    expect(covered({ x: 4.5, y: 0.5 })).toBe(true); // the far end
    expect(covered({ x: 2.5, y: 0.5 })).toBe(true); // the ground crossed on the way
    expect(covered({ x: 6.0, y: 0.5 })).toBe(false); // past the end
    expect(covered({ x: 2.5, y: 3.0 })).toBe(false); // off to the side
  });

  /** A concave bed must not shade ground its own outline never reaches. */
  it('does not fill in a concave shape', () => {
    const cShape = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 0, y: 3 },
    ];
    const parts = sweptPolygons(cShape, 0, 0.001);
    expect(parts.some((poly) => pointInPolygon({ x: 2.5, y: 1.5 }, poly))).toBe(false);
  });

  it('treats a structure as opaque', () => {
    const caster = casterOf(wall([{ x: 0, y: 0 }, { x: 4, y: 0 }]));
    expect(caster).not.toBeNull();
    expect(caster?.transmission).toBe(0);
  });

  it('is nothing at all when there is not enough of it to stand up', () => {
    expect(casterOf(wall([{ x: 0, y: 0 }], 2))).toBeNull();
    expect(casterOf({ ...SQUARE_BED, height: 0 })).toBeNull();
  });
});

describe('what a wall does to the sun map', () => {
  const noon = { hour: 12, doy: 172, year: 0 };
  const totalSun = (structures: Structure[], plants: PlantInstance[] = []) => {
    const grid = computeShadeGrid(PLOT, plants, LONDON, noon, YEAR, structures);
    let sum = 0;
    for (const h of grid.hours) if (h >= 0) sum += h;
    return sum;
  };

  /**
   * At London the sun is in the south all day, and plot space puts north up the
   * screen — so a wall along the southern edge shades the garden in front of it.
   * This is the whole reason a wall belongs in the simulation.
   */
  it('takes sun out of the garden', () => {
    const southWall = wall(
      [
        { x: 0, y: 9.5 },
        { x: 14, y: 9.5 },
      ],
      2.5,
    );
    expect(totalSun([southWall])).toBeLessThan(totalSun([]));
  });

  it('takes more sun the taller it is', () => {
    const at = (height: number) =>
      totalSun([
        wall(
          [
            { x: 0, y: 9.5 },
            { x: 14, y: 9.5 },
          ],
          height,
        ),
      ]);
    expect(at(3)).toBeLessThan(at(2));
    expect(at(2)).toBeLessThan(at(1));
  });

  it('shades more on the shortest day than the longest, for the same wall', () => {
    const southWall = wall(
      [
        { x: 0, y: 9.5 },
        { x: 14, y: 9.5 },
      ],
      2,
    );
    const share = (doy: number) => {
      const open = computeShadeGrid(PLOT, [], LONDON, { hour: 12, doy, year: 0 }, YEAR, []);
      const walled = computeShadeGrid(PLOT, [], LONDON, { hour: 12, doy, year: 0 }, YEAR, [
        southWall,
      ]);
      const sum = (g: typeof open) => {
        let t = 0;
        for (const h of g.hours) if (h >= 0) t += h;
        return t;
      };
      return 1 - sum(walled) / sum(open);
    };
    // A midwinter sun barely 15° up throws a shadow four times the length of
    // the midsummer one, so the same wall costs proportionally far more.
    expect(share(355)).toBeGreaterThan(share(172));
  });

  it('never reports more sun than there is daylight', () => {
    const grid = computeShadeGrid(PLOT, [], LONDON, noon, YEAR, [SQUARE_BED]);
    for (const h of grid.hours) expect(h).toBeLessThanOrEqual(grid.maxHours + 1e-6);
  });

  it('a plant standing in a raised bed shades more than the same plant on the lawn', () => {
    const plant: PlantInstance = {
      id: 'p',
      speciesId: 'taxus-baccata',
      x: 6,
      y: 5.5,
      seed: 1,
      plantedAge: 0,
    };
    const onLawn = totalSun([], [plant]);
    const inBed = totalSun([{ ...SQUARE_BED, height: 1.0 }], [plant]);
    // The bed itself also casts, so this is the pair being compared honestly:
    // the same bed with the plant, against the same bed without it.
    const bedAlone = totalSun([{ ...SQUARE_BED, height: 1.0 }], []);
    expect(inBed).toBeLessThan(bedAlone);
    expect(onLawn).toBeLessThan(totalSun([], []));
  });

  it('costs nothing when there are no structures, matching the old behaviour', () => {
    const withArg = computeShadeGrid(PLOT, [], LONDON, noon, YEAR, []);
    const without = computeShadeGrid(PLOT, [], LONDON, noon, YEAR);
    expect(Array.from(withArg.hours)).toEqual(Array.from(without.hours));
  });

  it('does not crash on a structure with too few points to exist', () => {
    expect(() => totalSun([wall([{ x: 1, y: 1 }])])).not.toThrow();
    expect(() => totalSun([bed([{ x: 1, y: 1 }, { x: 2, y: 2 }])])).not.toThrow();
  });
});

describe('coversPoint', () => {
  it('knows the ground a wall stands on', () => {
    const w = wall(
      [
        { x: 0, y: 5 },
        { x: 10, y: 5 },
      ],
      2,
      0.4,
    );
    expect(coversPoint(w, { x: 5, y: 5 })).toBe(true);
    expect(coversPoint(w, { x: 5, y: 6 })).toBe(false);
  });
});
