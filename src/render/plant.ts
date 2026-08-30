import {
  blobPoints,
  curvePath,
  drawBlob,
  hachure,
  mulberry32,
  roughCurve,
  roughLine,
  subSeed,
  taperedStroke,
} from './sketch';
import { flowerColour, foliageColour, inkColour, shade, type Lighting } from './palette';
import type { PlantForm } from './form';
import type { Phase, PlantSize, Species, Vec2 } from '../model/types';

/** Types with a woody stem worth marking in plan, so you see where it is planted. */
const WOODY = new Set<Species['type']>(['tree', 'shrub', 'conifer', 'climber']);

/** Habits drawn from above as leaves radiating from a single crown. */
const ROSETTE_HABITS = new Set<Species['habit']>(['clump', 'spire', 'fern', 'treefern']);

/**
 * Drawing a plant, in plan and in elevation.
 *
 * Both views read the same skeleton from `form.ts` and the same phase and size,
 * so a tree that has just dropped its leaves in plan is the same bare tree in
 * the elevation strip below. Plan view carries arrangement and shadow; elevation
 * carries height, silhouette and the seasonal changes that a top-down drawing
 * simply cannot show.
 */

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  light: Lighting;
  pxPerM: number;
}

/** Plan-view canopy outline — also used to project shadows. */
export function canopyOutline(form: PlantForm, cx: number, cy: number, radius: number): Vec2[] {
  return blobPoints(cx, cy, radius, radius, form.outline, form.rotation);
}

function leafFill(species: Species, phase: Phase, light: Lighting, tone: number, alpha: number) {
  const base = foliageColour(species.colors, phase);
  return shade(base, light, { value: 1 + tone * 0.13, alpha });
}

function flowerFill(species: Species, light: Lighting, seasonT: number, alpha = 1) {
  return shade(flowerColour(species.colors, seasonT), light, { alpha, value: 1.05 });
}

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
    ctx.strokeStyle = 'rgba(63, 128, 176, 0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (species.habit === 'globe') {
    drawPlanGlobes(dc, species, form, phase, radius, cx, cy, seasonT);
  } else if (species.habit === 'tussock' || species.habit === 'airy') {
    drawPlanRadiating(dc, species, form, phase, radius, cx, cy, seasonT);
  } else if (species.habit === 'climber') {
    drawPlanClimber(dc, species, form, phase, radius, cx, cy, seasonT, facing);
  } else if (ROSETTE_HABITS.has(species.habit)) {
    // A fern crown and a delphinium's basal leaves both read from above as
    // leaves radiating from one point, which is what the rosette draw does.
    drawPlanRosette(dc, species, form, phase, radius, cx, cy, seasonT);
  } else {
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

  ctx.restore();
}

function drawPlanTwigs(
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

function drawPlanFlowers(
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
function drawPlanFruit(
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

/**
 * Alliums in plan: a scatter of small circles, one per flower stem, because
 * from above that is genuinely all there is — the foliage has usually gone over
 * by the time the heads are up.
 */
function drawPlanGlobes(
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

function drawPlanRadiating(
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

function drawPlanRosette(
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

function drawDormantMarker(
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
    default:
      drawElevTree(dc, species, form, phase, w, h, baseX, baseY, seasonT);
  }

  ctx.restore();
}

function drawElevTree(
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

function drawElevColumn(
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

function drawElevMound(
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

function drawElevTussock(
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
  const winter = phase.seedhead > phase.leafCover;
  const foliage = winter
    ? shade(species.colors.leafAutumn, light, { alpha: 0.95 })
    : leafFill(species, phase, light, 0, 0.95);

  // Foliage is the lower third; flower stems carry the rest of the height.
  const foliageH = h * 0.4 * Math.max(phase.leafCover, phase.seedhead * 0.55);
  ctx.strokeStyle = foliage;
  form.stems.forEach((stem, i) => {
    const bladeH = foliageH * (0.55 + stem.h * 0.45);
    ctx.lineWidth = Math.max(0.7, w * 0.035);
    const tipX = baseX + stem.ax * w * 0.55 + stem.lean * w * 0.5;
    roughLine(ctx, baseX + stem.ax * w * 0.16, baseY, tipX, baseY - bladeH, subSeed(form.seed, i), {
      roughness: 0.7,
      passes: 1,
    });
  });

  const spikePresence = Math.max(phase.flower, phase.seedhead);
  if (spikePresence > 0.05) {
    const stemColour = winter
      ? shade(species.colors.leafAutumn, light, { value: 0.9 })
      : leafFill(species, phase, light, 0.2, 0.9);
    const headColour = winter
      ? shade(species.colors.flowerLate ?? species.colors.flower, light, { value: 0.95 })
      : flowerFill(species, light, seasonT);

    form.stems.slice(0, 14).forEach((stem, i) => {
      const stemH = h * (0.72 + stem.h * 0.28) * spikePresence;
      const topX = baseX + stem.ax * w * 0.42 + stem.lean * w * 0.22;
      const topY = baseY - stemH;
      ctx.strokeStyle = stemColour;
      ctx.lineWidth = Math.max(0.6, w * 0.022);
      roughLine(ctx, baseX + stem.ax * w * 0.2, baseY, topX, topY, subSeed(form.seed, i + 100), {
        roughness: 0.5,
        passes: 1,
      });
      // The plume itself.
      const plumeH = stemH * 0.26;
      taperedStroke(
        ctx,
        { x: topX, y: topY + plumeH },
        { x: topX + stem.lean * w * 0.1, y: topY },
        Math.max(1.4, w * 0.07),
        Math.max(0.8, w * 0.02),
        stem.bend * 2,
        headColour,
      );
    });
  }
}

function drawElevAiry(
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
  const presence = Math.max(phase.leafCover, phase.seedhead);
  if (presence < 0.04) return;

  const stemColour = leafFill(species, phase, light, 0, 0.9);
  const head = phase.seedhead > phase.flower
    ? shade(species.colors.leafAutumn, light, { value: 0.9 })
    : flowerFill(species, light, seasonT);

  form.stems.forEach((stem, i) => {
    const stemH = h * stem.h * presence;
    const topX = baseX + stem.ax * w + stem.lean * w * 0.25;
    const topY = baseY - stemH;
    ctx.strokeStyle = stemColour;
    ctx.lineWidth = Math.max(0.7, w * 0.03);
    roughLine(ctx, baseX + stem.ax * w * 0.35, baseY, topX, topY, subSeed(form.seed, i), {
      roughness: 0.8,
      passes: 1,
    });
    if (phase.flower > 0.05 || phase.seedhead > 0.05) {
      const r = Math.max(1.2, w * 0.09) * Math.max(phase.flower, phase.seedhead);
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.ellipse(topX, topY, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawElevFlowers(
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

function drawElevFruit(
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

/**
 * Alliums in elevation, which is the view that earns them: bare vertical stems,
 * each holding a sphere well clear of everything around it.
 */
function drawElevGlobes(
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
  const presence = Math.max(phase.flower, phase.seedhead);

  if (phase.leafCover > 0.05) {
    ctx.strokeStyle = leafFill(species, phase, light, 0, 0.85);
    ctx.lineWidth = Math.max(1, w * 0.12);
    for (let i = 0; i < 5; i++) {
      const lean = ((i - 2) / 5) * 1.6;
      roughLine(
        ctx,
        baseX,
        baseY,
        baseX + lean * w * 0.9,
        baseY - h * 0.3 * phase.leafCover,
        subSeed(form.seed, i + 60),
        { roughness: 1, passes: 1 },
      );
    }
  }

  if (presence < 0.05) return;
  const dry = phase.seedhead > phase.flower;
  const headColour = dry
    ? shade(species.colors.leafAutumn, light, { value: 0.95 })
    : flowerFill(species, light, seasonT);
  const stemColour = shade(dry ? species.colors.leafAutumn : species.colors.bark, light, {
    value: 0.9,
  });

  // The head is about as wide as the plant's spread — that is what an allium is.
  const headR = Math.max(2, (w / 2) * 0.9 * (0.55 + 0.45 * presence));

  form.stems.forEach((stem, i) => {
    const stemH = h * (0.78 + stem.h * 0.22) * (0.5 + 0.5 * presence);
    const topX = baseX + stem.ax * w * 1.1 + stem.lean * w * 0.3;
    const topY = baseY - stemH;

    ctx.strokeStyle = stemColour;
    ctx.lineWidth = Math.max(0.8, w * 0.06);
    roughLine(ctx, baseX + stem.ax * w * 0.5, baseY, topX, topY, subSeed(form.seed, i), {
      roughness: 0.5,
      passes: 1,
    });

    ctx.fillStyle = headColour;
    ctx.beginPath();
    ctx.arc(topX, topY - headR * 0.6, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = inkColour(light, 0.28);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });
}

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

function drawPlanClimber(
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
 * A spire: a low cushion of basal leaves with tall flower spikes standing clear
 * of it. Keeping the two separate is the point — a delphinium at 1.8 m is 40 cm
 * of leaf and well over a metre of flower, and drawing it as one mass loses the
 * thing that makes it worth planting.
 */
function drawElevSpire(
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
  if (phase.leafCover < 0.04 && phase.flower < 0.04) return;

  // Basal foliage: a squat mound in the bottom fifth or so.
  const leafH = h * 0.24 * phase.leafCover;
  if (leafH > 0.6) {
    form.elevClumps.forEach((clump, i) => {
      const cr = clump.r * w * 0.9;
      const lx = baseX + clump.ax * w * 0.85;
      const ly = baseY - leafH * (0.35 + clump.ay * 0.8);
      const pts = blobPoints(lx, ly, cr, cr * 0.62, clump.wobble, 0);
      ctx.fillStyle = leafFill(species, phase, light, clump.tone, 0.9);
      ctx.fill(curvePath(pts, true));
      ctx.strokeStyle = inkColour(light, 0.3);
      ctx.lineWidth = 0.7;
      roughCurve(ctx, pts, true, subSeed(form.seed, i), { roughness: 0.5, passes: 1 });
    });
  }

  const spike = Math.max(phase.flower, phase.seedhead);
  if (spike < 0.05) return;

  const dry = phase.seedhead > phase.flower;
  const stemColour = dry
    ? shade(species.colors.leafAutumn, light, { value: 0.85 })
    : leafFill(species, phase, light, 0.15, 0.95);
  const headColour = dry
    ? shade(species.colors.leafAutumn, light, { value: 0.95 })
    : flowerFill(species, light, seasonT);

  form.stems.forEach((stem, i) => {
    const top = h * stem.h * spike;
    const x0 = baseX + stem.ax * w * 0.4;
    const topX = x0 + stem.lean * w * 0.25;
    const topY = baseY - top;
    ctx.strokeStyle = stemColour;
    ctx.lineWidth = Math.max(0.8, w * 0.03);
    roughLine(ctx, x0, baseY - leafH * 0.4, topX, topY, subSeed(form.seed, i + 40), {
      roughness: 0.4,
      passes: 1,
    });

    // The flower column: florets up the top two-thirds of the stem.
    const colH = top * 0.62;
    const colW = Math.max(1.6, w * 0.13);
    const florets = 7;
    for (let f = 0; f < florets; f++) {
      const t = f / (florets - 1);
      const fy = topY + colH * t;
      const fx = topX - stem.lean * w * 0.25 * t;
      // Tapered: fat at the bottom of the spike, pinched at the tip.
      const r = colW * (0.45 + 0.55 * t) * spike;
      ctx.fillStyle = headColour;
      ctx.beginPath();
      ctx.ellipse(fx, fy, r, r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/**
 * A fern crown, optionally lifted on a trunk.
 *
 * `trunkFraction` of 0 gives a shuttlecock sitting on the ground (dryopteris);
 * anything above that gives a tree fern, where the fibrous trunk is most of the
 * plant and the crown sits on top of it.
 */
function drawElevFern(
  dc: DrawContext,
  species: Species,
  form: PlantForm,
  phase: Phase,
  w: number,
  h: number,
  baseX: number,
  baseY: number,
  trunkFraction: number,
): void {
  const { ctx, light } = dc;
  if (phase.leafCover < 0.04) return;

  const crownY = baseY - h * trunkFraction;

  if (trunkFraction > 0.01) {
    // A tree fern trunk is a mat of old frond bases, not bark — drawn as a
    // straight column with cross-hatching rather than a taper.
    const tw = Math.max(2, w * 0.22);
    const bark = shade(species.colors.bark, light, { value: 0.85 });
    ctx.fillStyle = bark;
    ctx.fillRect(baseX - tw / 2, crownY, tw, baseY - crownY);
    ctx.strokeStyle = inkColour(light, 0.35);
    ctx.lineWidth = 0.7;
    const rings = Math.max(3, Math.round((baseY - crownY) / Math.max(3, tw * 0.55)));
    for (let i = 1; i < rings; i++) {
      const y = crownY + ((baseY - crownY) * i) / rings;
      roughLine(ctx, baseX - tw / 2, y, baseX + tw / 2, y + tw * 0.12, subSeed(form.seed, i + 80), {
        roughness: 0.7,
        passes: 1,
      });
    }
  }

  const frondLen = (h * (1 - trunkFraction)) / 0.85;
  const green = leafFill(species, phase, light, 0, 0.95);
  const ink = inkColour(light, 0.32);

  form.stems.forEach((stem, i) => {
    const len = frondLen * stem.h * (0.5 + 0.5 * phase.leafCover);
    // Fronds rise from the crown and arch over: the tip ends up out to the side
    // and below where it peaked, which is what makes a fern read as a fern.
    const tipX = baseX + stem.lean * w * 0.52;
    const tipY = crownY - len * 0.55;
    const midX = baseX + stem.lean * w * 0.22;
    const midY = crownY - len * 0.92;

    ctx.strokeStyle = green;
    ctx.lineWidth = Math.max(0.8, w * 0.035);
    ctx.beginPath();
    ctx.moveTo(baseX, crownY);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.stroke();

    // Pinnae: short ticks either side of the midrib.
    const pinnae = 6;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(0.5, w * 0.016);
    for (let k = 1; k <= pinnae; k++) {
      const t = k / (pinnae + 1);
      const px = (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * midX + t * t * tipX;
      const py = (1 - t) * (1 - t) * crownY + 2 * (1 - t) * t * midY + t * t * tipY;
      const pl = len * 0.16 * Math.sin(Math.PI * t);
      roughLine(ctx, px, py, px + Math.sign(stem.lean || 1) * pl * 0.4, py + pl, subSeed(form.seed, i * 10 + k), {
        roughness: 0.6,
        passes: 1,
      });
    }
  });
}

/**
 * A climber in elevation: a sheet of leaf covering its support, rather than a
 * canopy balanced on a trunk. The mass fills the full height and width, because
 * that is what a climber does — it is as tall as whatever it is growing up.
 */
function drawElevClimber(
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

function drawDormantSoil(
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
