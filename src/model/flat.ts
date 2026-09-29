import { convexHull } from './geometry';
import type { PlantInstance, PlantSize, Vec2 } from './types';

/**
 * Plants grown flat, and the shadow they actually throw.
 *
 * A climber, a pleached tree, a fan and a cordon are all one thing from above:
 * a sheet on a support. Their recorded spread is how far they have *run along*
 * that support, not how far they stand out from it — so shading them as a disc
 * of that width says a mature Boston ivy casts a seven-metre circle when the
 * plant is a curtain under half a metre deep, and every bed near a clothed
 * fence reads as deep shade.
 *
 * The plan already drew a band and the sun map still measured a disc, which is
 * the fault this module exists to end: the shape is worked out once, here, and
 * both the measurement and the drawing use it. Two ways of answering the same
 * question is how they came to disagree in the first place.
 */

/**
 * How far out from its support a flat plant stands, in metres.
 *
 * Deliberately generous for a climber on wires and mean for a well-pruned fan,
 * because one number covering both is worth more than a per-habit table nobody
 * can check: what matters is that it is a hand's depth rather than a canopy's.
 */
export const FLAT_DEPTH = 0.45;

const HALF_TURN = Math.PI;

/**
 * Which way this plant's plane runs, in radians on the plan.
 *
 * A plane reads the same from either side, so the answer lives in half a turn.
 * When nobody has turned the plant, its seed picks a stable angle: a fence has
 * to run *somewhere*, and the alternative — every untouched climber lying
 * north–south — claims a direction the garden may not have. The important part
 * is that the drawing and the sun map ask this one function, so whatever angle
 * a plant is given, both of them use it.
 */
export function flatFacing(plant: PlantInstance): number {
  if (plant.facing !== undefined && Number.isFinite(plant.facing)) {
    return ((((plant.facing * Math.PI) / 180) % HALF_TURN) + HALF_TURN) % HALF_TURN;
  }
  // A seed is an integer up to 1e9; the low digits are as good as any.
  return ((Math.abs(Math.trunc(plant.seed)) % 3600) / 3600) * HALF_TURN;
}

/** The ground a flat plant stands on: its run along the support, by its depth. */
export function flatFootprint(plant: PlantInstance, spread: number): Vec2[] {
  const angle = flatFacing(plant);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const run = Math.max(spread, FLAT_DEPTH) / 2;
  const depth = FLAT_DEPTH / 2;
  return [
    { x: plant.x + cos * run - sin * depth, y: plant.y + sin * run + cos * depth },
    { x: plant.x + cos * run + sin * depth, y: plant.y + sin * run - cos * depth },
    { x: plant.x - cos * run + sin * depth, y: plant.y - sin * run - cos * depth },
    { x: plant.x - cos * run - sin * depth, y: plant.y - sin * run + cos * depth },
  ];
}

/** Where the sun is throwing things, and how far per metre of height. */
export interface ShadowCast {
  ux: number;
  uy: number;
  reach: number;
}

/**
 * The ground a flat plant's shadow covers: its footprint, pushed out by
 * anything it is standing on, and swept along the shadow.
 *
 * `cap` bounds the reach in metres. The sun map and the drawing cap it
 * differently — the map because a shadow longer than the plot is wasted
 * arithmetic, the drawing because a blurred shape the size of the paper reads
 * as a stain rather than as a shadow — so the caller says which it wants.
 */
export function flatShadow(
  plant: PlantInstance,
  size: PlantSize,
  base: number,
  cast: ShadowCast,
  cap: number,
): Vec2[] {
  const len = Math.min(cap, Math.max(0, size.height) * cast.reach);
  const lift = Math.min(cap, Math.max(0, base) * cast.reach);
  const foot = flatFootprint(plant, size.spread).map((p) => ({
    x: p.x + cast.ux * lift,
    y: p.y + cast.uy * lift,
  }));
  if (len <= 0) return foot;
  const thrown = foot.map((p) => ({ x: p.x + cast.ux * len, y: p.y + cast.uy * len }));
  return convexHull([...foot, ...thrown]);
}
