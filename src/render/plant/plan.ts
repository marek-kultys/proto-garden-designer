import { blobPoints, curvePath, roughCurve, roughLine, subSeed } from '../sketch';
import { inkColour, shade } from '../palette';
import { type PlantForm } from '../form';
import { unhandled } from '../exhaustive';
import { type Phase, type PlantSize, type Species } from '../../model/types';
import { type DrawContext, WOODY, canopyOutline, flowerFill, leafFill } from './shared';
import { drawDormantMarker, drawPlanFlowers, drawPlanFruit, drawPlanTwigs } from './parts';
import { drawPlanClimber } from './climber';
import { chrome } from '../chrome';

/**
 * A plant seen from above.
 *
 * Plan view carries arrangement and shadow — where things are, how much ground
 * they take, what they leave room for. It says almost nothing about height,
 * which is the elevation's job, so the drawings here are deliberately flatter
 * and more diagrammatic than the ones in `elevation.ts`.
 */

// ---------------------------------------------------------------- plan view

export function drawPlantPlan(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  size: PlantSize,
  cx: number,
  cy: number,
  seasonT: number,
  selected: boolean,
  /**
   * Which way a climber's plane runs, in radians. Only a climber has one, and
   * only when the person drawing has said where the fence is; otherwise the
   * instance's own sketchy rotation stands in, exactly as before.
   */
  facing?: number,
): void {
  const { ctx, light, pxPerM } = dc;
  if (phase.dormant) {
    drawDormantMarker(dc, cx, cy, Math.max(6, (size.spread / 2) * pxPerM * 0.5), form.seed);
    return;
  }

  const radius = Math.max(3, (size.spread / 2) * pxPerM);
  const ink = inkColour(light, 0.75);
  const leafy = phase.leafCover > 0.06;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = chrome('accent', 0.9);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /*
   * Every shape, named. Grouped by what the plan makes of them rather than by
   * what they are: from above, a hosta and a tree fern are both a rosette.
   *
   * A list of cases rather than a chain of ifs so that the last branch can ask
   * the type checker whether the list is complete. It used to end in an "else"
   * that drew a canopy, so a shape nobody had wired up here drew as a generic
   * blob and said nothing about it.
   */
  switch (species.habit) {
    case 'globe':
      drawPlanGlobes(dc, species, form, phase, radius, cx, cy, seasonT);
      break;
    case 'tussock':
    case 'airy':
      drawPlanRadiating(dc, species, form, phase, radius, cx, cy, seasonT);
      break;
    // A climber, a fan, a cordon and a pleached tree are all a sheet seen edge
    // on from above: a shallow band along whatever they are trained against.
    // These four are what `isTrainedFlat` knows as flat and what the sun map
    // shades as a band; a fifth flat shape has to be added in both places.
    case 'climber':
    case 'pleached':
    case 'fan':
    case 'cordon':
      drawPlanClimber(dc, species, form, phase, radius, cx, cy, seasonT, facing);
      break;
    // A fern crown and a delphinium's basal leaves both read from above as
    // leaves radiating from one point, which is what the rosette draw does.
    case 'clump':
    case 'spire':
    case 'fern':
    case 'treefern':
      drawPlanRosette(dc, species, form, phase, radius, cx, cy, seasonT);
      break;
    // A mass with an outline: a crown, a clipped column, a dome, or the level
    // roof of an umbrella tree, which is round from above however it is grown.
    case 'round':
    case 'multistem':
    case 'columnar':
    case 'mound':
    case 'umbrella':
      drawPlanCanopy(dc, species, form, phase, radius, cx, cy, seasonT, leafy, ink);
      break;
    default:
      unhandled(species.habit, 'the plan');
      drawPlanCanopy(dc, species, form, phase, radius, cx, cy, seasonT, leafy, ink);
  }

  ctx.restore();
}

/**
 * A plant drawn from above as a mass: its canopy outline, the leaf clumps
 * inside it, whatever it is carrying, and the stem it stands on.
 */
export function drawPlanCanopy(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  radius: number,
  cx: number,
  cy: number,
  seasonT: number,
  leafy: boolean,
  ink: string,
): void {
  const { ctx, light } = dc;
  {
    const outline = canopyOutline(form, cx, cy, radius);

    if (leafy) {
      const path = curvePath(outline, true);
      ctx.fillStyle = leafFill(species, phase, light, -0.35, 0.55 + 0.35 * phase.leafCover);
      ctx.fill(path);

      // Leaf masses inside the canopy give it texture and a sense of volume.
      for (const clump of form.planClumps) {
        const cr = clump.r * radius * 1.6 * (0.55 + 0.45 * phase.leafCover);
        const pts = blobPoints(
          cx + clump.ax * radius * 1.4,
          cy + clump.ay * radius * 1.4,
          cr,
          cr,
          clump.wobble,
        );
        ctx.fillStyle = leafFill(species, phase, light, clump.tone, 0.5);
        ctx.fill(curvePath(pts, true));
      }

      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.1;
      roughCurve(ctx, outline, true, form.seed, { roughness: radius * 0.03 + 0.6 });
    } else {
      // Bare: the plan of a deciduous plant in winter is its twig structure.
      drawPlanTwigs(dc, form, radius, cx, cy, species.colors.bark);
      ctx.strokeStyle = inkColour(light, 0.35);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      roughCurve(ctx, canopyOutline(form, cx, cy, radius), true, form.seed, {
        roughness: 0.4,
        passes: 1,
      });
      ctx.setLineDash([]);
    }

    // Not gated on leaf cover: magnolia opens its whole crop of flowers on
    // bare wood, weeks before a leaf appears.
    if (phase.flower > 0.05) {
      drawPlanFlowers(dc, species, form, phase, radius, cx, cy, seasonT);
    }
    if (phase.fruit > 0.05) {
      drawPlanFruit(dc, species, form, phase, radius, cx, cy);
    }

    // The stem itself, so you can see exactly where the plant is planted.
    if (WOODY.has(species.type)) {
      ctx.fillStyle = shade(species.colors.bark, light, { value: 0.85 });
      for (const trunk of form.trunks) {
        const tr = Math.max(1.6, radius * 0.075);
        ctx.beginPath();
        ctx.arc(cx + trunk.ax * radius, cy + trunk.lean * radius * 0.4, tr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * Alliums in plan: a scatter of small circles, one per flower stem, because
 * from above that is genuinely all there is — the foliage has usually gone over
 * by the time the heads are up.
 */
export function drawPlanGlobes(
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
  const presence = Math.max(phase.flower, phase.seedhead);

  if (phase.leafCover > 0.05) {
    // Strappy basal leaves, flopping outward.
    ctx.strokeStyle = leafFill(species, phase, light, 0, 0.8);
    ctx.lineWidth = Math.max(0.8, radius * 0.14);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + form.rotation;
      const len = radius * (0.7 + 0.5 * phase.leafCover);
      roughLine(ctx, cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len, subSeed(form.seed, i), {
        roughness: 0.9,
        passes: 1,
      });
    }
  }

  if (presence < 0.05) return;
  const dry = phase.seedhead > phase.flower;
  ctx.fillStyle = dry
    ? shade(species.colors.leafAutumn, light, { alpha: 0.9 })
    : flowerFill(species, light, seasonT, 0.92);
  ctx.strokeStyle = inkColour(light, 0.3);
  ctx.lineWidth = 0.8;

  for (let i = 0; i < form.stems.length; i++) {
    const stem = form.stems[i];
    const gx = cx + stem.ax * radius * 1.3;
    const gy = cy + stem.lean * radius * 1.3;
    const r = Math.max(1.5, radius * 0.38 * presence);
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawPlanRadiating(
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
  const cover = Math.max(phase.leafCover, phase.seedhead * 0.6);
  if (cover < 0.04 && phase.seedhead < 0.04) return;

  const green = species.habit === 'tussock' && phase.seedhead > phase.leafCover
    ? shade(species.colors.leafAutumn, light, { alpha: 0.9 })
    : leafFill(species, phase, light, 0, 0.9);

  ctx.strokeStyle = green;
  ctx.lineWidth = Math.max(0.8, radius * 0.06);
  for (let i = 0; i < form.stems.length; i++) {
    const stem = form.stems[i];
    const a = (i / form.stems.length) * Math.PI * 2 + form.rotation;
    const len = radius * (0.55 + stem.h * 0.5) * (0.4 + 0.6 * cover);
    roughLine(
      ctx,
      cx + Math.cos(a) * radius * 0.1,
      cy + Math.sin(a) * radius * 0.1,
      cx + Math.cos(a + stem.lean * 0.2) * len,
      cy + Math.sin(a + stem.lean * 0.2) * len,
      subSeed(form.seed, i),
      { roughness: 0.8, passes: 1 },
    );
  }

  if (phase.flower > 0.05) {
    drawPlanFlowers(dc, species, form, phase, radius, cx, cy, seasonT);
  }
}

export function drawPlanRosette(
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
  if (phase.leafCover < 0.04) return;
  const scale = 0.45 + 0.55 * phase.leafCover;

  form.planClumps.forEach((clump, i) => {
    const a = (i / form.planClumps.length) * Math.PI * 2 + form.rotation;
    const dist = radius * 0.42 * scale;
    const lx = cx + Math.cos(a) * dist;
    const ly = cy + Math.sin(a) * dist;
    const lr = radius * 0.46 * scale;
    // Leaves are drawn as elongated blobs pointing away from the crown.
    const pts = blobPoints(lx, ly, lr, lr * 0.6, clump.wobble, a);
    ctx.fillStyle = leafFill(species, phase, light, clump.tone, 0.82);
    ctx.fill(curvePath(pts, true));
    ctx.strokeStyle = inkColour(light, 0.35);
    ctx.lineWidth = 0.8;
    roughCurve(ctx, pts, true, subSeed(form.seed, i), { roughness: 0.5, passes: 1 });
  });

  if (phase.flower > 0.05) {
    drawPlanFlowers(dc, species, form, phase, radius, cx, cy, seasonT);
  }
}
