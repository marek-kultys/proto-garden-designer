import { blobPoints, curvePath, hachure, roughCurve, roughLine, subSeed } from '../sketch';
import { inkColour, shade } from '../palette';
import { type PlantForm } from '../form';
import { unhandled } from '../exhaustive';
import { type Phase, type PlantSize, type Species, type Vec2 } from '../../model/types';
import { type DrawContext, leafFill } from './shared';
import { drawDormantSoil, drawElevFlowers, drawElevFruit, drawElevTree } from './parts';
import {
  drawElevAiry,
  drawElevFern,
  drawElevGlobes,
  drawElevSpire,
  drawElevTussock,
} from './herbaceous';
import { drawElevCordon, drawElevFan, drawElevTrainedHead } from './trained';
import { drawElevClimber } from './climber';

/**
 * A plant seen from the side, and the choice of which drawing to use.
 *
 * This is where a shape becomes a picture: the dispatcher names every shape the
 * library can hold and sends it to the file that draws it — the soft ones to
 * `herbaceous.ts`, the trained ones to `trained.ts`, the sheet on a support to
 * `climber.ts`, and the masses to the draws kept here.
 *
 * Elevation carries height, silhouette and the seasonal changes a top-down
 * drawing simply cannot show.
 */

// ----------------------------------------------------------- elevation view

export function drawPlantElevation(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  size: PlantSize,
  baseX: number,
  baseY: number,
  seasonT: number,
  selected: boolean,
): void {
  const { ctx, pxPerM } = dc;
  if (phase.dormant && phase.seedhead < 0.03) {
    drawDormantSoil(dc, baseX, baseY, Math.max(8, size.spread * pxPerM * 0.4), form.seed);
    return;
  }

  const h = size.height * pxPerM;
  const w = size.spread * pxPerM;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (selected) {
    ctx.strokeStyle = 'rgba(63, 128, 176, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(baseX - w / 2 - 5, baseY - h - 5, w + 10, h + 10);
    ctx.setLineDash([]);
  }

  switch (species.habit) {
    case 'tussock':
      drawElevTussock(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    case 'airy':
      drawElevAiry(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    case 'globe':
      drawElevGlobes(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    case 'clump':
      drawElevMound(dc, species, form, phase, w, h, baseX, baseY, seasonT, 0.9);
      break;
    case 'columnar':
      drawElevColumn(dc, species, form, phase, w, h, baseX, baseY);
      break;
    case 'spire':
      drawElevSpire(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    case 'fern':
      drawElevFern(dc, species, form, phase, w, h, baseX, baseY, 0);
      break;
    case 'treefern':
      drawElevFern(dc, species, form, phase, w, h, baseX, baseY, form.trunkFraction);
      break;
    case 'climber':
      drawElevClimber(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    case 'mound':
      drawElevMound(dc, species, form, phase, w, h, baseX, baseY, seasonT, 0.75);
      break;
    case 'pleached':
    case 'umbrella':
      drawElevTrainedHead(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    case 'fan':
      drawElevFan(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    case 'cordon':
      drawElevCordon(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    // A broad crown on a trunk, one stem or several: the ordinary tree draw.
    case 'round':
    case 'multistem':
      drawElevTree(dc, species, form, phase, w, h, baseX, baseY, seasonT);
      break;
    default:
      // Unreachable while the shapes above cover the union — which is the
      // point. A shape left out of this list used to be drawn as a generic
      // tree and look merely wrong; now it fails the build instead.
      unhandled(species.habit, 'the side view');
      drawElevTree(dc, species, form, phase, w, h, baseX, baseY, seasonT);
  }

  ctx.restore();
}

export function drawElevColumn(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  w: number,
  h: number,
  baseX: number,
  baseY: number,
): void {
  const { ctx, light } = dc;
  // A clipped shape: crisp, near-symmetrical, and shaded with pen hatching.
  // The sides run straight and only the top rounds over — a yew column is not a
  // leaf, and tapering it at the base makes it read as one.
  const profile = (t: number) =>
    Math.sin(Math.min(1, (1 - t) / 0.18) * Math.PI * 0.5);

  const pts: Vec2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wobble = form.outline[i % form.outline.length];
    pts.push({ x: baseX - (w / 2) * wobble * profile(t), y: baseY - t * h });
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const wobble = form.outline[(i + 5) % form.outline.length];
    pts.push({ x: baseX + (w / 2) * wobble * profile(t), y: baseY - t * h });
  }

  const path = curvePath(pts, true);
  ctx.fillStyle = leafFill(species, phase, light, -0.2, 0.92);
  ctx.fill(path);
  hachure(ctx, path, { x: baseX - w, y: baseY - h, w: w * 2, h }, form.seed, {
    angle: -60,
    gap: Math.max(3, w * 0.16),
    roughness: 0.6,
  });
  ctx.strokeStyle = inkColour(light, 0.6);
  ctx.lineWidth = 1;
  roughCurve(ctx, pts, true, form.seed, { roughness: 0.6, passes: 1 });
}

export function drawElevMound(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  w: number,
  h: number,
  baseX: number,
  baseY: number,
  seasonT: number,
  flatness: number,
): void {
  const { ctx, light } = dc;
  if (phase.leafCover < 0.04) {
    // Deciduous shrub in winter: a low thicket of bare stems.
    ctx.strokeStyle = shade(species.colors.bark, light, { value: 0.8 });
    ctx.lineWidth = Math.max(0.7, w * 0.02);
    form.elevClumps.forEach((clump, i) => {
      roughLine(
        ctx,
        baseX,
        baseY,
        baseX + clump.ax * w * 1.4,
        baseY - h * (0.5 + clump.depth * 0.5),
        subSeed(form.seed, i),
        { roughness: 0.8, passes: 1 },
      );
    });
    return;
  }

  const scale = 0.45 + 0.55 * phase.leafCover;
  const domePts = blobPoints(baseX, baseY - h * flatness * 0.55, (w / 2) * scale, h * 0.55 * scale, form.outline);
  const dome = domePts.map((p) => ({ x: p.x, y: Math.min(baseY, p.y) }));
  ctx.fillStyle = leafFill(species, phase, light, -0.3, 0.85);
  ctx.fill(curvePath(dome, true));

  for (const clump of form.elevClumps) {
    const cx = baseX + clump.ax * w;
    const cy = baseY - Math.max(0.06, clump.ay) * h;
    const r = clump.r * w * 1.4 * scale;
    ctx.fillStyle = leafFill(species, phase, light, clump.tone, 0.6);
    ctx.fill(curvePath(blobPoints(cx, cy, r, r * 0.8, clump.wobble), true));
  }

  ctx.strokeStyle = inkColour(light, 0.5);
  ctx.lineWidth = 1;
  roughCurve(ctx, dome, true, form.seed, { roughness: 0.7, passes: 1 });

  if (phase.flower > 0.05) {
    drawElevFlowers(dc, species, form, phase, w, h, baseX, baseY, seasonT, 0.75, 1.3);
  }
  if (phase.fruit > 0.05) {
    drawElevFruit(dc, species, form, phase, w, h, baseX, baseY, 0.72);
  }
}
