import {
  blobPoints,
  curvePath,
  drawBlob,
  hachure,
  roughCurve,
  roughLine,
  subSeed,
  taperedStroke,
} from '../sketch';
import { foliageColour, inkColour, shade } from '../palette';
import { CORDON_STEM, FAN_LEG, type PlantForm, type TrainedForm } from '../form';
import { type Phase, type Species, type Vec2 } from '../../model/types';
import { type DrawContext, flowerFill, leafFill } from './shared';
import { drawElevTree } from './parts';

/**
 * Trees trained to a shape by pruning and tying in: pleached, umbrella, fan and
 * cordon.
 *
 * They are forms rather than species — any of several trees can be grown each
 * way — and they share a framework that a free-grown crown does not have, which
 * is why they are drawn together here. The ordinary tree draw provides the
 * trunk underneath; everything above it is this file's business.
 */

// ------------------------------------------------------------ trained trees

/**
 * Clear stem under a trained head, in metres — the height a nursery sells it at.
 *
 * Fixed rather than a fraction of the plant, because the stem does not grow:
 * it is bought at this height and the head above it fills out. A fraction would
 * have the stem stretching as the tree matured.
 */
const CLEAR_STEM_M: Partial<Record<Species['habit'], number>> = { pleached: 1.8, umbrella: 2.0 };

/**
 * How square a clipped head is drawn. A pleached panel is clipped to a line and
 * its corners barely rounded; an umbrella's roof is softer at the ends.
 */
const HEAD_SQUARENESS: Partial<Record<Species['habit'], number>> = { pleached: 9, umbrella: 5 };

/** A clipped head as a superellipse — a rectangle with the corners taken off. */
export function clippedHead(
  cx: number,
  bottom: number,
  w: number,
  hh: number,
  squareness: number,
  outline: number[],
): Vec2[] {
  const pts: Vec2[] = [];
  const cy = bottom - hh / 2;
  const n = 40;
  const e = 2 / squareness;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const wob = 1 + (outline[i % outline.length] - 1) * 0.5;
    pts.push({
      x: cx + (w / 2) * Math.sign(c) * Math.abs(c) ** e * wob,
      y: cy - (hh / 2) * Math.sign(s) * Math.abs(s) ** e * wob,
    });
  }
  return pts;
}

/** Blossom, then fruit, where the framework says they are. */
export function drawTrainedBuds(
  dc: DrawContext,
  species: Species,
  phase: Phase,
  trained: TrainedForm,
  at: (ax: number, ay: number) => Vec2,
  w: number,
  seasonT: number,
): void {
  const { ctx, light } = dc;
  if (phase.flower > 0.05) {
    ctx.fillStyle = flowerFill(species, light, seasonT, 0.9);
    const shown = Math.round(trained.buds.length * phase.flower);
    for (let i = 0; i < shown; i++) {
      const bud = trained.buds[i];
      const p = at(bud.ax, bud.ay);
      const r = Math.max(1.2, bud.r * w);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (phase.fruit > 0.05) {
    ctx.fillStyle = shade(species.colors.fruit ?? '#b8322a', light, { alpha: 0.95, value: 1.02 });
    const shown = Math.round(trained.buds.length * phase.fruit * 0.75);
    for (let i = 0; i < shown; i++) {
      const bud = trained.buds[trained.buds.length - 1 - i];
      const p = at(bud.ax, bud.ay);
      const r = Math.max(1.4, bud.r * w * 1.15);
      // Fruit hangs from where the flower was.
      ctx.beginPath();
      ctx.arc(p.x, p.y + r * 0.7, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** The framework's branches, drawn in bark. */
export function drawTrainedBranches(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  trained: TrainedForm,
  at: (ax: number, ay: number) => Vec2,
  stemWidth: number,
): void {
  const { ctx, light } = dc;
  ctx.strokeStyle = shade(species.colors.bark, light, { value: 0.6 });
  trained.branches.forEach((branch, i) => {
    ctx.lineWidth = Math.max(0.6, stemWidth * (branch.depth === 0 ? 0.5 : 0.28));
    const a = at(branch.x0, branch.y0);
    const b = at(branch.x1, branch.y1);
    roughLine(ctx, a.x, a.y, b.x, b.y, subSeed(form.seed, 40 + i), { roughness: 0.6, passes: 1 });
  });
}

/**
 * A pleached or umbrella tree: a bare stem, and a head clipped to a hard edge.
 *
 * The crispness is the whole of the difference between these and a tree, so
 * the head is one clipped shape with pen hatching, as the yew column is — not
 * the loose clumps a free-grown crown gets. It thins with the leaf, so in
 * spring and autumn the tiers or spokes it is trained on show through, and in
 * winter they are all there is.
 */
export function drawElevTrainedHead(
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
  const trained = form.trained;
  if (trained === undefined) {
    drawElevTree(dc, species, form, phase, w, h, baseX, baseY, seasonT);
    return;
  }
  const { ctx, light, pxPerM } = dc;
  // Never let the stem take the whole plant, on a young one that is mostly stem.
  const stemH = Math.min(h * 0.8, (CLEAR_STEM_M[species.habit] ?? 1.8) * pxPerM);
  const headBottom = baseY - stemH;
  const headH = h - stemH;
  const at = (ax: number, ay: number): Vec2 => ({ x: baseX + ax * w, y: headBottom - ay * headH });
  const stemWidth = Math.max(1.5, 0.13 * pxPerM);

  taperedStroke(
    ctx,
    { x: baseX, y: baseY },
    { x: baseX, y: headBottom - headH * 0.4 },
    stemWidth * 1.2,
    stemWidth * 0.75,
    0,
    shade(species.colors.bark, light, { value: 0.95 }),
  );
  drawTrainedBranches(dc, species, form, trained, at, stemWidth);

  if (phase.leafCover > 0.04 && headH > 1) {
    const pts = clippedHead(baseX, headBottom, w, headH, HEAD_SQUARENESS[species.habit] ?? 6, form.outline);
    const path = curvePath(pts, true);
    ctx.fillStyle = leafFill(species, phase, light, -0.2, 0.22 + 0.7 * phase.leafCover);
    ctx.fill(path);
    if (phase.leafCover > 0.5) {
      // Hatched in a darker shade of its own leaf, with a thin line, and spaced
      // in metres. `hachure` draws with whatever stroke is current, which here
      // was the thick dark bark of the framework just drawn — on a lime's clear
      // yellow autumn that came out as black and yellow stripes.
      ctx.strokeStyle = shade(foliageColour(species.colors, phase), light, { value: 0.66, alpha: 0.75 });
      ctx.lineWidth = 1;
      hachure(ctx, path, { x: baseX - w, y: headBottom - headH, w: w * 2, h: headH }, form.seed, {
        angle: -60,
        gap: Math.max(4, 0.2 * pxPerM),
        roughness: 0.6,
      });
    }
    ctx.strokeStyle = inkColour(light, 0.3 + 0.35 * phase.leafCover);
    ctx.lineWidth = 1;
    roughCurve(ctx, pts, true, form.seed, { roughness: 0.5, passes: 1 });
  }

  drawTrainedBuds(dc, species, phase, trained, at, w, seasonT);
}

/**
 * A fan: a short leg, ribs spreading flat from the top of it, leaves along the
 * ribs. In winter the bare ribs are the picture — a fan is at its best then.
 */
export function drawElevFan(
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
  const trained = form.trained;
  if (trained === undefined) {
    drawElevTree(dc, species, form, phase, w, h, baseX, baseY, seasonT);
    return;
  }
  const { ctx, light, pxPerM } = dc;
  const at = (ax: number, ay: number): Vec2 => ({ x: baseX + ax * w, y: baseY - ay * h });
  const stemWidth = Math.max(1.5, 0.1 * pxPerM);

  taperedStroke(
    ctx,
    { x: baseX, y: baseY },
    at(0, FAN_LEG),
    stemWidth * 1.2,
    stemWidth * 0.9,
    0,
    shade(species.colors.bark, light, { value: 0.95 }),
  );
  drawTrainedBranches(dc, species, form, trained, at, stemWidth);
  drawTrainedLeaves(dc, species, phase, trained, at, w);
  drawTrainedBuds(dc, species, phase, trained, at, w, seasonT);
}

/** A cordon: one stem at a slant, with spurs, leaves and fruit along it. */
export function drawElevCordon(
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
  const trained = form.trained;
  if (trained === undefined) {
    drawElevTree(dc, species, form, phase, w, h, baseX, baseY, seasonT);
    return;
  }
  const { light, pxPerM } = dc;
  const at = (ax: number, ay: number): Vec2 => ({ x: baseX + ax * w, y: baseY - ay * h });
  const stemWidth = Math.max(1.5, 0.08 * pxPerM);

  taperedStroke(
    dc.ctx,
    at(CORDON_STEM.x0, CORDON_STEM.y0),
    at(CORDON_STEM.x1, CORDON_STEM.y1),
    stemWidth * 1.3,
    stemWidth * 0.55,
    0,
    shade(species.colors.bark, light, { value: 0.95 }),
  );
  drawTrainedBranches(dc, species, form, trained, at, stemWidth);
  drawTrainedLeaves(dc, species, phase, trained, at, w);
  drawTrainedBuds(dc, species, phase, trained, at, w, seasonT);
}

/** Leaves along a framework, thinning to nothing as they fall. */
export function drawTrainedLeaves(
  dc: DrawContext,
  species: Species,
  phase: Phase,
  trained: TrainedForm,
  at: (ax: number, ay: number) => Vec2,
  w: number,
): void {
  if (phase.leafCover <= 0.05) return;
  const { ctx, light } = dc;
  const scale = 0.45 + 0.55 * phase.leafCover;
  for (const leaf of trained.leaves) {
    const c = at(leaf.ax, leaf.ay);
    const r = Math.max(1.5, leaf.r * w * scale);
    drawBlob(
      ctx,
      blobPoints(c.x, c.y, r, r * 0.8, leaf.wobble),
      leaf.seed,
      leafFill(species, phase, light, leaf.tone, 0.72),
      inkColour(light, 0.25),
      { roughness: 0.5, passes: 1, lineWidth: 0.7 },
    );
  }
}
