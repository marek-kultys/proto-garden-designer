import { blobPoints, curvePath, roughCurve, roughLine, subSeed } from '../sketch';
import { inkColour, shade } from '../palette';
import { type PlantForm } from '../form';
import { type Phase, type Species } from '../../model/types';
import { type DrawContext, leafFill } from './shared';
import { drawElevFlowers, drawElevFruit, drawPlanFlowers } from './parts';

/**
 * A climber, in both views.
 *
 * The one plant that is a sheet on a support rather than a free-standing mass,
 * so from above it is a shallow band and from the side a curtain of growth.
 * Both views are kept together because the thing they have to agree about —
 * how deep the sheet is, which way it runs — is the same fact.
 */

/**
 * A climber in plan: a shallow band rather than a circle.
 *
 * `matureSpread` for a climber means how wide a face it covers, not how far it
 * stands out from its support, so drawing it as a disc like a shrub would put a
 * five-metre blob in the border where there is really a metre of growth against
 * a wall. The band is oriented by the instance rotation, which stands in for
 * which way the support runs.
 *
 * How far it stands off that support is a real measurement, not a proportion of
 * how far it has run. Taking it as a fraction of the length meant a climber got
 * deeper as it spread: once climbers were capped at trellis height and their
 * growth went sideways, a mature clematis came out as an enormous lens filling
 * the border instead of a band along the fence.
 */
/** Metres a climber stands out from whatever it is growing on. */
const CLIMBER_DEPTH = 0.45;

export function drawPlanClimber(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  radius: number,
  cx: number,
  cy: number,
  seasonT: number,
  facing?: number,
): void {
  const { ctx, light } = dc;
  const cover = phase.leafCover;
  if (cover < 0.04 && phase.flower < 0.04) return;

  const halfW = radius;
  const depth = Math.max(2, (CLIMBER_DEPTH / 2) * dc.pxPerM);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(facing ?? form.rotation);

  ctx.fillStyle = leafFill(species, phase, light, -0.3, 0.55 + 0.35 * cover);
  ctx.beginPath();
  ctx.ellipse(0, 0, halfW, depth, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const clump of form.planClumps) {
    // Sized off how far the plant stands out, not how far it has run. Taken
    // from the length, a climber that had spread sixteen metres along a fence
    // grew sixteen-metre leaf clumps and filled the whole border.
    const cr = clump.r * depth * 2.6 * (0.55 + 0.45 * cover);
    const pts = blobPoints(clump.ax * halfW * 2, clump.ay * depth * 1.6, cr, cr * 0.7, clump.wobble, 0);
    ctx.fillStyle = leafFill(species, phase, light, clump.tone, 0.5);
    ctx.fill(curvePath(pts, true));
  }

  ctx.strokeStyle = inkColour(light, 0.4);
  ctx.lineWidth = 1;
  roughCurve(
    ctx,
    blobPoints(0, 0, halfW, depth, form.outline, 0),
    true,
    subSeed(form.seed, 7),
    { roughness: 0.6, passes: 1 },
  );
  ctx.restore();

  if (phase.flower > 0.05) {
    drawPlanFlowers(dc, species, form, phase, radius, cx, cy, seasonT);
  }
}

/**
 * A climber in elevation: a sheet of leaf covering its support, rather than a
 * canopy balanced on a trunk. The mass fills the full height and width, because
 * that is what a climber does — it is as tall as whatever it is growing up.
 */
export function drawElevClimber(
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
  const cover = phase.leafCover;

  // A hint of the support, drawn first and faintly. Without it a climber reads
  // as a small multi-stemmed tree, because a mass of leaf on stems is exactly
  // what a small tree looks like — and the one thing that distinguishes a
  // climber is that it is holding on to something.
  ctx.strokeStyle = inkColour(light, 0.16);
  ctx.lineWidth = Math.max(0.6, w * 0.012);
  const postX = [baseX - w * 0.42, baseX + w * 0.42];
  for (const px of postX) {
    ctx.beginPath();
    ctx.moveTo(px, baseY);
    ctx.lineTo(px, baseY - h);
    ctx.stroke();
  }
  const wires = 4;
  for (let i = 1; i <= wires; i++) {
    const y = baseY - (h * i) / (wires + 0.5);
    ctx.beginPath();
    ctx.moveTo(postX[0], y);
    ctx.lineTo(postX[1], y);
    ctx.stroke();
  }

  // Stems are visible year-round; on a bare deciduous climber they are all
  // there is to see, which is the whole winter character of a vine.
  const stemColour = shade(species.colors.bark, light, { value: 0.8 });
  ctx.strokeStyle = stemColour;
  ctx.lineWidth = Math.max(0.8, w * 0.028);
  form.stems.forEach((stem, i) => {
    const topY = baseY - h * stem.h;
    roughLine(
      ctx,
      baseX + stem.ax * w * 0.15,
      baseY,
      baseX + stem.ax * w * 0.5 + stem.lean * w * 0.3,
      topY,
      subSeed(form.seed, i + 20),
      { roughness: 0.9, passes: 1 },
    );
  });

  if (cover > 0.04) {
    /*
     * The leaf mass is laid along the run in cells about as wide as the sheet
     * is tall, rather than one set of clumps stretched over the whole width.
     *
     * Sizing clumps off the width made a long climber grow enormous leaves;
     * sizing them off the height alone left a sixteen-metre run covered by a
     * handful of small blobs with gaps between. Repeating the pattern keeps the
     * cover even however far it has spread — which is what a fence smothered in
     * clematis actually looks like.
     */
    const cell = Math.max(1, Math.min(w, h * 1.25));
    const runs = Math.max(1, Math.round(w / cell));
    for (let run = 0; run < runs; run += 1) {
      const centre = (run + 0.5) / runs - 0.5;
      for (const clump of form.elevClumps) {
        const cr = clump.r * cell * 0.85 * (0.55 + 0.45 * cover);
        const lx = baseX + (centre + (clump.ax * 0.5) / runs) * w * 1.05;
        const ly = baseY - h * (0.06 + clump.ay * 0.94);
        const pts = blobPoints(lx, ly, cr, cr * 0.8, clump.wobble, 0);
        ctx.fillStyle = leafFill(species, phase, light, clump.tone, 0.72);
        ctx.fill(curvePath(pts, true));
      }
    }
    ctx.strokeStyle = inkColour(light, 0.3);
    ctx.lineWidth = 0.7;
    form.elevClumps.slice(0, 8).forEach((clump, i) => {
      const cr = clump.r * w * 1.35 * (0.55 + 0.45 * cover);
      const lx = baseX + clump.ax * w * 1.05;
      const ly = baseY - h * (0.06 + clump.ay * 0.94);
      roughCurve(ctx, blobPoints(lx, ly, cr, cr * 0.8, clump.wobble, 0), true, subSeed(form.seed, i), {
        roughness: 0.5,
        passes: 1,
      });
    });
  }

  if (phase.flower > 0.05) {
    // Spread over the whole face rather than clustered at the top: a clematis
    // flowers all the way up its support.
    drawElevFlowers(dc, species, form, phase, w, h, baseX, baseY, seasonT, 0.55, 1);
  }
  if (phase.fruit > 0.05) {
    drawElevFruit(dc, species, form, phase, w, h, baseX, baseY, 0.55);
  }
}
