import { describe, expect, it } from 'vitest';
import { canopyDensity, computeShadeGrid } from '../shade';
import { rectanglePlot } from '../geometry';
import { getSpecies } from '../plants';
import { phaseAt } from '../phenology';
import type { PlantInstance, Site } from '../types';

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

function plant(speciesId: string, x: number, y: number): PlantInstance {
  return { id: `${speciesId}-${x}-${y}`, speciesId, x, y, seed: 1 };
}

/** Average sun hours over the whole plot, ignoring cells outside it. */
function meanHours(hours: Float32Array): number {
  let sum = 0;
  let n = 0;
  for (const h of hours) {
    if (h >= 0) {
      sum += h;
      n++;
    }
  }
  return n ? sum / n : 0;
}

describe('shade grid', () => {
  it('gives an empty plot full daylight everywhere', () => {
    const grid = computeShadeGrid(PLOT, [], LONDON, { hour: 12, doy: 172, year: 0 }, YEAR);
    expect(grid.bands.fullSun).toBeCloseTo(1, 5);
    expect(meanHours(grid.hours)).toBeCloseTo(grid.maxHours, 1);
  });

  it('reduces sun under a mature tree', () => {
    const withTree = computeShadeGrid(
      PLOT,
      [plant('betula-jacquemontii', 7, 5)],
      LONDON,
      { hour: 12, doy: 172, year: 20 },
      YEAR,
    );
    const empty = computeShadeGrid(PLOT, [], LONDON, { hour: 12, doy: 172, year: 20 }, YEAR);
    expect(meanHours(withTree.hours)).toBeLessThan(meanHours(empty.hours));
    expect(withTree.bands.fullSun).toBeLessThan(1);
  });

  it('shades more in winter than in summer, from the same tree', () => {
    // Lower sun means far longer shadows, so a low winter sun sweeps a much
    // bigger share of the plot even though the tree is bare.
    const tree = [plant('taxus-baccata', 7, 5)];
    const summer = computeShadeGrid(PLOT, tree, LONDON, { hour: 12, doy: 172, year: 20 }, YEAR);
    const winter = computeShadeGrid(PLOT, tree, LONDON, { hour: 12, doy: 355, year: 20 }, YEAR);
    const summerShadedFraction = 1 - meanHours(summer.hours) / summer.maxHours;
    const winterShadedFraction = 1 - meanHours(winter.hours) / winter.maxHours;
    expect(winterShadedFraction).toBeGreaterThan(summerShadedFraction);
  });

  it('never reports more sun than there is daylight', () => {
    const grid = computeShadeGrid(
      PLOT,
      [plant('hydrangea-limelight', 4, 4), plant('acer-osakazuki', 9, 6)],
      LONDON,
      { hour: 12, doy: 200, year: 10 },
      YEAR,
    );
    for (const h of grid.hours) expect(h).toBeLessThanOrEqual(grid.maxHours + 1e-3);
  });

  it('marks cells outside the plot boundary as unmeasured', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const grid = computeShadeGrid(triangle, [], LONDON, { hour: 12, doy: 172, year: 0 }, YEAR);
    // The far corner of the bounding box lies outside the triangle.
    expect(grid.hours[grid.rows * grid.cols - 1]).toBe(-1);
  });
});

describe('canopy density', () => {
  it('lets more light through a bare tree than a leafy one', () => {
    const birch = getSpecies('betula-jacquemontii');
    const winter = canopyDensity(birch, phaseAt(birch, 10, LONDON));
    const summer = canopyDensity(birch, phaseAt(birch, 195, LONDON));
    expect(winter).toBeGreaterThan(0);
    expect(winter).toBeLessThan(summer);
  });

  it('makes clipped yew the densest thing in the palette', () => {
    const yew = getSpecies('taxus-baccata');
    const birch = getSpecies('betula-jacquemontii');
    expect(canopyDensity(yew, phaseAt(yew, 195, LONDON))).toBeGreaterThan(
      canopyDensity(birch, phaseAt(birch, 195, LONDON)),
    );
  });

  it('casts nothing at all from a dormant perennial', () => {
    const hosta = getSpecies('hosta-halcyon');
    expect(canopyDensity(hosta, phaseAt(hosta, 10, LONDON))).toBe(0);
  });
});
