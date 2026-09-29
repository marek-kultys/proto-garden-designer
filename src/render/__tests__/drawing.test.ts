import { describe, expect, it } from 'vitest';
import { hexToRgb, kelvinToRgb, lightingFor, mix, mixHex, rgbToCss } from '../palette';
import { fitViewport, niceScaleStep, toPlot, toScreen } from '../viewport';
import { blobPoints, mulberry32, subSeed } from '../sketch';
import { sampleShade } from '../overlay';
import { DRAWN_SHADOW_CAP, SLICE_DEPTH_RANGE, sliceHalfWidth } from '../constants';
import type { ShadeGrid } from '../../model/shade';

/**
 * The arithmetic underneath the drawing.
 *
 * None of it draws anything: it turns a sun position into a colour, a metre
 * into a pixel, a seed into a stable wobble. All of it was untested, which
 * mattered less than it sounds only because the faults it can cause are the
 * loud kind — a garden lit at midnight, a plot off the side of the canvas.
 * What no test could see was the drawing itself; that is what
 * `scripts/check-drawing.mjs` is for, and these are the half that needs no
 * browser.
 */

describe('colour', () => {
  it('reads a hex colour the way CSS does', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#3f80b0')).toEqual({ r: 0x3f, g: 0x80, b: 0xb0 });
    // Round trip, which is how these two are always used together.
    expect(rgbToCss(hexToRgb('#3f80b0'))).toBe('rgb(63, 128, 176)');
    // Alpha is written to three places, which canvas reads the same as "0.5".
    expect(rgbToCss({ r: 10, g: 20, b: 30 }, 0.5)).toBe('rgba(10, 20, 30, 0.500)');
  });

  it('mixes from one colour to the other and stops at each end', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    expect(mix(black, white, 0)).toEqual(black);
    expect(mix(black, white, 1)).toEqual(white);
    expect(mix(black, white, 0.5).r).toBeCloseTo(127.5, 6);
    expect(mixHex('#000000', '#ffffff', 0.5).g).toBeCloseTo(127.5, 6);
  });

  /**
   * Against the physics rather than against itself: a blackbody at 2000 K is
   * orange-red, one at 6500 K is neutral daylight. Both are published figures,
   * which is the point — the curve can be checked without running it first.
   */
  it('makes low colour temperatures red and high ones neutral', () => {
    const candle = kelvinToRgb(2000);
    expect(candle.r).toBeGreaterThan(candle.g);
    expect(candle.g).toBeGreaterThan(candle.b);

    const daylight = kelvinToRgb(6500);
    expect(Math.abs(daylight.r - daylight.b)).toBeLessThan(0.25);
    // Warmer light is always redder than cooler light, at every step.
    for (const k of [2500, 3000, 4000, 5000]) {
      expect(kelvinToRgb(k).b).toBeLessThan(kelvinToRgb(k + 1500).b);
    }
  });
});

describe('the light at a given sun position', () => {
  const noon = lightingFor(58, 180);
  const dusk = lightingFor(3, 275);
  const night = lightingFor(-12, 0);

  it('knows day from night', () => {
    expect(noon.isDay).toBe(true);
    expect(dusk.isDay).toBe(true);
    expect(night.isDay).toBe(false);
    expect(night.daylight).toBeCloseTo(0, 6);
    expect(noon.daylight).toBeCloseTo(1, 6);
  });

  it('is stronger overhead than at the horizon', () => {
    expect(noon.intensity).toBeGreaterThan(dusk.intensity);
    expect(dusk.intensity).toBeGreaterThan(night.intensity);
  });

  /** Low sun is warm light: that is what a summer evening looks like. */
  it('warms as the sun drops', () => {
    expect(dusk.sun.r - dusk.sun.b).toBeGreaterThan(noon.sun.r - noon.sun.b);
  });

  it('gives a shadow to draw only while there is sun to cast it', () => {
    expect(noon.shadowAlpha).toBeGreaterThan(0);
    expect(night.shadowAlpha).toBeLessThanOrEqual(noon.shadowAlpha);
    expect(noon.shadowBlur).toBeGreaterThanOrEqual(0);
  });

  it('returns a sky that is darker at the top than at the horizon by day', () => {
    expect(noon.skyTop).toMatch(/^rgb/);
    expect(noon.skyBottom).toMatch(/^rgb/);
    expect(noon.skyTop).not.toBe(noon.skyBottom);
  });
});

describe('fitting the plot to the canvas', () => {
  const bounds = { minX: 0, minY: 0, maxX: 14, maxY: 10 };
  const view = fitViewport(bounds, 800, 600);

  it('centres the plot and leaves a margin', () => {
    const middle = toScreen(view, { x: 7, y: 5 });
    expect(middle.x).toBeCloseTo(400, 6);
    expect(middle.y).toBeCloseTo(300, 6);

    const corner = toScreen(view, { x: 0, y: 0 });
    expect(corner.x).toBeGreaterThan(0);
    expect(corner.y).toBeGreaterThan(0);
    expect(toScreen(view, { x: 14, y: 10 }).x).toBeLessThan(800);
  });

  it('converts back to metres exactly', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 7, y: 5 }, { x: 13.75, y: 2.4 }]) {
      const back = toPlot(view, toScreen(view, p).x, toScreen(view, p).y);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('never divides by nothing when the plot has no size yet', () => {
    const empty = fitViewport({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, 800, 600);
    expect(Number.isFinite(empty.scale)).toBe(true);
    expect(empty.scale).toBeGreaterThan(0);
  });

  it('picks a round number for the scale bar', () => {
    for (const scale of [8, 20, 55, 120, 400]) {
      const step = niceScaleStep(scale);
      expect([0.5, 1, 2, 5, 10, 20, 50, 100]).toContain(step);
      // Close to the length it aims for: never more than double, never under
      // a tenth, or the bar stops meaning anything on the page.
      expect(step * scale).toBeLessThan(110 * 2.5);
      expect(step * scale).toBeGreaterThan(110 / 10);
    }
  });
});

describe('the seeded randomness every sketch is built on', () => {
  it('gives the same sequence for the same seed, and a different one otherwise', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const c = mulberry32(1235);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
  });

  it('stays inside nought to one', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('derives child seeds that are stable and distinct', () => {
    expect(subSeed(42, 3)).toBe(subSeed(42, 3));
    expect(subSeed(42, 3)).not.toBe(subSeed(42, 4));
    expect(subSeed(42, 3)).not.toBe(subSeed(43, 3));
    expect(Number.isInteger(subSeed(42, 3))).toBe(true);
  });

  it('draws a blob as a closed ring around its centre', () => {
    const wobble = [1, 1, 1, 1, 1, 1];
    const pts = blobPoints(10, 20, 3, 3, wobble);
    expect(pts).toHaveLength(6);
    for (const p of pts) {
      expect(Math.hypot(p.x - 10, p.y - 20)).toBeCloseTo(3, 6);
    }
    // Wobble stretches a point out along its own radius, nothing else.
    const bumpy = blobPoints(0, 0, 2, 2, [1.5, 1, 1, 1, 1, 1]);
    expect(Math.hypot(bumpy[0].x, bumpy[0].y)).toBeCloseTo(3, 6);
  });
});

describe('reading the sun map', () => {
  const grid: ShadeGrid = {
    cols: 2,
    rows: 2,
    cellSize: 1,
    originX: 0,
    originY: 0,
    hours: Float32Array.from([6, 3, -1, 0]),
    maxHours: 16,
    bands: { fullSun: 0.25, partial: 0.25, shade: 0.5 },
    thresholds: { fullSun: 6, partial: 3 },
  };

  it('finds the cell a point stands in', () => {
    expect(sampleShade(grid, 0.5, 0.5)).toBe(6);
    expect(sampleShade(grid, 1.5, 0.5)).toBe(3);
    expect(sampleShade(grid, 1.5, 1.5)).toBe(0);
  });

  it('says nothing for ground it has no reading for', () => {
    // Outside the plot is -1 in the grid, which is not "no sun at all".
    expect(sampleShade(grid, 0.5, 1.5)).toBeNull();
    expect(sampleShade(grid, -1, 0.5)).toBeNull();
    expect(sampleShade(grid, 99, 0.5)).toBeNull();
  });
});

describe('the drawing constants', () => {
  it('keeps the elevation slice inside the range the control offers', () => {
    expect(sliceHalfWidth(SLICE_DEPTH_RANGE.min)).toBe(SLICE_DEPTH_RANGE.min / 2);
    expect(sliceHalfWidth(SLICE_DEPTH_RANGE.max)).toBe(SLICE_DEPTH_RANGE.max / 2);
    // A depth from an old file, or a fat-fingered slider, is brought back in.
    expect(sliceHalfWidth(0)).toBe(SLICE_DEPTH_RANGE.min / 2);
    expect(sliceHalfWidth(1000)).toBe(SLICE_DEPTH_RANGE.max / 2);
  });

  it('caps a drawn shadow shorter than the sun map measures', () => {
    // The map goes to sixty times the height, because at a grazing sun that is
    // the truth; a drawing cannot, or one shadow covers the paper.
    expect(DRAWN_SHADOW_CAP).toBeLessThan(60);
    expect(DRAWN_SHADOW_CAP).toBeGreaterThan(1);
  });
});
