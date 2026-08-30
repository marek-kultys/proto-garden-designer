import { polygonBounds } from './geometry';
import { bearingToCanvas } from './sun';
import type { Plot, Site, Vec2 } from './types';

/**
 * The lie of the land.
 *
 * Everything else in this model assumed the ground was flat at nothing, which
 * is fine for a town garden and wrong for most others. A garden on a slope is a
 * different garden: the light strikes it at a different angle all day, shadows
 * thrown downhill run much further than the same shadow on the level, and what
 * you can see over from the terrace changes entirely.
 *
 * A single plane for now — a fall across the plot in one direction, which is
 * how a site is measured and how a designer describes one. Dips and mounds are
 * a separate and much larger thing, needing a way to sculpt ground rather than
 * two numbers, and are deliberately not here.
 *
 * Heights are metres relative to the middle of the plot, which is therefore
 * always zero. Measuring from the centre rather than the top means a flat
 * garden and a sloping one share the same datum, so nothing has to move when
 * the slope is first set.
 */

export interface Terrain {
  /** Unit vector pointing downhill, in plot space. */
  ux: number;
  uy: number;
  /** Metres of fall per metre travelled downhill. Zero on the level. */
  gradient: number;
  /** The point where the ground is at zero: the middle of the plot. */
  cx: number;
  cy: number;
}

export const LEVEL: Terrain = { ux: 1, uy: 0, gradient: 0, cx: 0, cy: 0 };

/** Metres of fall a garden may be given across its plot. */
export const SLOPE_FALL_RANGE = { min: 0, max: 6, step: 0.1 };

export function terrainOf(plot: Plot, site: Site): Terrain {
  const fall = site.slopeFall ?? 0;
  if (!Number.isFinite(fall) || fall <= 0 || plot.length < 3) return LEVEL;

  const angle = bearingToCanvas(site.slopeDirection ?? 180, site.northAngle);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  const b = polygonBounds(plot);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;

  // How far the plot reaches downhill, so a fall stated "across the garden"
  // means across this garden rather than a fixed distance.
  let lowest = 0;
  let highest = 0;
  for (const p of plot) {
    const along = (p.x - cx) * ux + (p.y - cy) * uy;
    if (along < highest) highest = along;
    if (along > lowest) lowest = along;
  }
  const span = lowest - highest;
  if (span <= 0.01) return LEVEL;

  return { ux, uy, gradient: fall / span, cx, cy };
}

/** Height of the ground at a point, in metres, relative to the plot's middle. */
export function groundAt(terrain: Terrain, p: Vec2): number {
  if (terrain.gradient === 0) return 0;
  const along = (p.x - terrain.cx) * terrain.ux + (p.y - terrain.cy) * terrain.uy;
  return -terrain.gradient * along;
}

/**
 * How steeply the ground falls away in a given direction, as metres per metre.
 *
 * Positive means the ground drops as you go that way. This is the number a
 * shadow needs: a shadow thrown downhill keeps chasing ground that is running
 * away beneath it, and so reaches much further than the same shadow on the
 * level.
 */
export function fallTowards(terrain: Terrain, dx: number, dy: number): number {
  if (terrain.gradient === 0) return 0;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  return terrain.gradient * ((dx * terrain.ux + dy * terrain.uy) / len);
}

/**
 * How far a shadow reaches per metre of height, over ground that is not level.
 *
 * On the flat this is 1/tan(altitude). Downhill the ground falls away from the
 * sun ray and the shadow runs further; uphill it rises to meet it and the
 * shadow is cut short. Where the ground falls as steeply as the sunlight does,
 * the shadow never lands at all — clamped, because a garden is not a mountain
 * and an unbounded shadow helps nobody.
 */
export function shadowReachOnSlope(sunAltitudeDegrees: number, fall: number): number {
  const tan = Math.tan(Math.max(0.05, sunAltitudeDegrees) * (Math.PI / 180));
  const closing = tan - fall;
  // Below a shallow limit the sun is grazing the slope; 60 m of shadow is
  // already longer than any plot here.
  if (closing <= 1 / 60) return 60;
  return Math.min(60, 1 / closing);
}

/** Lowest and highest ground in the plot, for a readout. */
export function terrainRange(plot: Plot, terrain: Terrain): { low: number; high: number } {
  if (terrain.gradient === 0 || plot.length === 0) return { low: 0, high: 0 };
  let low = Infinity;
  let high = -Infinity;
  for (const p of plot) {
    const z = groundAt(terrain, p);
    if (z < low) low = z;
    if (z > high) high = z;
  }
  return { low, high };
}
