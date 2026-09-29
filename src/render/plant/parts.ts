import {
  blobPoints,
  drawBlob,
  mulberry32,
  roughCurve,
  roughLine,
  subSeed,
  taperedStroke,
} from '../sketch';
import { inkColour, shade } from '../palette';
import { type PlantForm } from '../form';
import { type Phase, type Species } from '../../model/types';
import { type DrawContext, flowerFill, leafFill } from './shared';

/**
 * The pieces more than one shape is built from.
 *
 * A tree, a clipped dome and a trained fan are different drawings, but they all
 * carry blossom the same way, drop fruit the same way and leave the same mark
 * on the ground when they are dormant. Those parts live here rather than in any
 * one shape's file, so that fixing blossom fixes it everywhere it appears.
 *
 * The generic tree is here for the same reason: a pleached tree is a clipped
 * panel on a trunk that is drawn by the ordinary tree draw underneath.
 */

export function drawPlanTwigs(
  dc: DrawContext,
  form: PlantForm,
  radius: number,
  cx: number,
  cy: number,
  bark: string,
): void {
  const { ctx, light } = dc;
  ctx.strokeStyle = shade(bark, light, { value: 0.75, alpha: 0.85 });
  ctx.lineWidth = Math.max(0.6, radius * 0.025);
  const rng = mulberry32(form.seed);
  const spokes = 9;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + form.rotation;
    const len = radius * (0.62 + rng() * 0.36);
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    roughLine(ctx, cx, cy, ex, ey, subSeed(form.seed, i), { roughness: 0.9, passes: 1 });
    // A fork near the tip reads as a crown rather than a starburst.
    const fx = cx + Math.cos(a) * len * 0.65;
    const fy = cy + Math.sin(a) * len * 0.65;
    const branchAngle = a + (rng() - 0.5) * 1.3;
    roughLine(
      ctx,
      fx,
      fy,
      fx + Math.cos(branchAngle) * len * 0.4,
      fy + Math.sin(branchAngle) * len * 0.4,
      subSeed(form.seed, i + 40),
      { roughness: 0.8, passes: 1 },
    );
  }
}

export function drawPlanFlowers(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  radius: number,
  cx: number,
  cy: number,
  seasonT: number,
): void {
  const { ctx, light } = dc;
  ctx.fillStyle = flowerFill(species, light, seasonT, 0.85);
  const shown = Math.round(form.flowers.length * phase.flower);
  for (let i = 0; i < shown; i++) {
    const f = form.flowers[i];
    const r = Math.max(1, f.r * radius * 1.7 * (0.6 + 0.4 * phase.flower));
    ctx.beginPath();
    ctx.arc(cx + f.ax * radius * 1.6, cy + f.ay * radius * 1.6, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Berries and fruit, drawn from the tail of the same position list the flowers
 * use — so a crab apple's fruit sits roughly where its blossom was, which is
 * where fruit actually comes from.
 */
export function drawPlanFruit(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  radius: number,
  cx: number,
  cy: number,
): void {
  const { ctx, light } = dc;
  ctx.fillStyle = shade(species.colors.fruit ?? '#b8322a', light, { alpha: 0.92, value: 1.02 });
  const shown = Math.round(form.flowers.length * phase.fruit * 0.75);
  for (let i = 0; i < shown; i++) {
    const f = form.flowers[form.flowers.length - 1 - i];
    const r = Math.max(1, f.r * radius * 1.25 * (0.7 + 0.3 * phase.fruit));
    ctx.beginPath();
    ctx.arc(cx + f.ax * radius * 1.5, cy + f.ay * radius * 1.5, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawDormantMarker(
  dc: DrawContext,
  cx: number,
  cy: number,
  radius: number,
  seed: number,
): void {
  const { ctx, light } = dc;
  ctx.save();
  ctx.strokeStyle = inkColour(light, 0.3);
  ctx.setLineDash([3, 5]);
  ctx.lineWidth = 1;
  roughCurve(
    ctx,
    blobPoints(cx, cy, radius, radius, [1, 1, 1, 1, 1, 1, 1, 1]),
    true,
    seed,
    { roughness: 0.5, passes: 1 },
  );
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawElevTree(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  w: number,
  h: number,
  baseX: number,
  baseY: number,
  seasonT: number,
): void {
  const { ctx, light } = dc;
  const bark = shade(species.colors.bark, light, { value: 0.95 });
  const barkDark = shade(species.colors.bark, light, { value: 0.6 });

  // Trunks first, then branches, then the leaf canopy over the top.
  const trunkTopY = baseY - h * form.trunkFraction;
  const trunkWidth = Math.max(1.5, w * 0.055);
  for (const trunk of form.trunks) {
    const topX = baseX + trunk.lean * w * 0.5;
    taperedStroke(
      ctx,
      { x: baseX + trunk.ax * w * 0.35, y: baseY },
      { x: topX, y: trunkTopY },
      trunkWidth * 1.25,
      trunkWidth * 0.8,
      trunk.lean * h * 0.04,
      bark,
    );
  }

  ctx.strokeStyle = barkDark;
  form.branches.forEach((branch, i) => {
    ctx.lineWidth = Math.max(0.6, trunkWidth * (branch.depth === 0 ? 0.6 : branch.depth === 1 ? 0.38 : 0.22));
    roughLine(
      ctx,
      baseX + branch.x0 * w,
      baseY - branch.y0 * h,
      baseX + branch.x1 * w,
      baseY - branch.y1 * h,
      subSeed(form.seed, i),
      { roughness: 0.7, passes: 1 },
    );
  });

  if (phase.leafCover > 0.05) {
    const scale = 0.5 + 0.5 * phase.leafCover;
    for (const clump of form.elevClumps) {
      const cx = baseX + clump.ax * w;
      const cy = baseY - clump.ay * h;
      const r = clump.r * w * 1.6 * scale;
      const pts = blobPoints(cx, cy, r, r * 0.85, clump.wobble);
      drawBlob(
        ctx,
        pts,
        clump.seed,
        leafFill(species, phase, light, clump.tone, 0.72),
        inkColour(light, 0.25),
        { roughness: 0.5, passes: 1, lineWidth: 0.7 },
      );
    }
  }

  if (phase.flower > 0.05) {
    drawElevFlowers(dc, species, form, phase, w, h, baseX, baseY, seasonT, 0.55, 1);
  }
  if (phase.fruit > 0.05) {
    drawElevFruit(dc, species, form, phase, w, h, baseX, baseY, 0.6);
  }
}

export function drawElevFlowers(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  w: number,
  h: number,
  baseX: number,
  baseY: number,
  seasonT: number,
  heightBias: number,
  sizeScale: number,
): void {
  const { ctx, light } = dc;
  ctx.fillStyle = flowerFill(species, light, seasonT, 0.9);
  const shown = Math.round(form.flowers.length * phase.flower);
  for (let i = 0; i < shown; i++) {
    const f = form.flowers[i];
    const r = Math.max(1.2, f.r * w * 1.5 * sizeScale);
    const fy = baseY - h * (heightBias + f.ay * 0.5);
    ctx.beginPath();
    ctx.ellipse(baseX + f.ax * w * 1.2, Math.min(baseY - 1, fy), r, r * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawElevFruit(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  w: number,
  h: number,
  baseX: number,
  baseY: number,
  heightBias: number,
): void {
  const { ctx, light } = dc;
  ctx.fillStyle = shade(species.colors.fruit ?? '#b8322a', light, { alpha: 0.95, value: 1.02 });
  const shown = Math.round(form.flowers.length * phase.fruit * 0.75);
  for (let i = 0; i < shown; i++) {
    const f = form.flowers[form.flowers.length - 1 - i];
    const r = Math.max(1.2, f.r * w * 1.15);
    const fy = baseY - h * (heightBias + f.ay * 0.5);
    ctx.beginPath();
    ctx.arc(baseX + f.ax * w * 1.4, Math.min(baseY - 1, fy), r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawDormantSoil(
  dc: DrawContext,
  baseX: number,
  baseY: number,
  w: number,
  seed: number,
): void {
  const { ctx, light } = dc;
  ctx.strokeStyle = inkColour(light, 0.28);
  ctx.lineWidth = 1;
  roughLine(ctx, baseX - w / 2, baseY, baseX + w / 2, baseY, seed, { roughness: 1.2, passes: 1 });
}
