import { blobPoints } from '../sketch';
import { type Lighting, flowerColour, foliageColour, shade } from '../palette';
import { type PlantForm } from '../form';
import { type Phase, type Species, type Vec2 } from '../../model/types';

/**
 * The vocabulary every plant drawing is written in.
 *
 * Three colours and an outline, and the context each draw call carries: the
 * canvas, the light for the hour, and how many pixels a metre is. Everything
 * else in this folder is built from these, which is why they live on their own
 * — a change to how a leaf is tinted changes every view at once, deliberately.
 */

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  light: Lighting;
  pxPerM: number;
}

/** Types with a woody stem worth marking in plan, so you see where it is planted. */
export const WOODY = new Set<Species['type']>(['tree', 'shrub', 'conifer', 'climber']);

/** Plan-view canopy outline — also used to project shadows. */
export function canopyOutline(form: PlantForm, cx: number, cy: number, radius: number): Vec2[] {
  return blobPoints(cx, cy, radius, radius, form.outline, form.rotation);
}

export function leafFill(species: Species, phase: Phase, light: Lighting, tone: number, alpha: number) {
  const base = foliageColour(species.colors, phase);
  return shade(base, light, { value: 1 + tone * 0.13, alpha });
}

export function flowerFill(species: Species, light: Lighting, seasonT: number, alpha = 1) {
  return shade(flowerColour(species.colors, seasonT), light, { alpha, value: 1.05 });
}
