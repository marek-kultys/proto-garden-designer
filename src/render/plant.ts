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

/** How far through its flowering window the plant is, for blooms that age. */
export function flowerAge(species: Species, doy: number): number {
  const span = species.flowerEnd - species.flowerStart;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (doy - species.flowerStart) / span));
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

  if (species.habit === 'tussock' || species.habit === 'airy') {
    drawPlanRadiating(dc, species, form, phase, radius, cx, cy, seasonT);
  } else if (species.habit === 'clump') {
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

    if (phase.flower > 0.05 && leafy) {
      drawPlanFlowers(dc, species, form, phase, radius, cx, cy, seasonT);
    }

    // The stem itself, so you can see exactly where the plant is planted.
    if (species.type === 'tree' || species.type === 'shrub' || species.type === 'conifer') {
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
    case 'clump':
      drawElevMound(dc, species, form, phase, w, h, baseX, baseY, seasonT, 0.9);
      break;
    case 'columnar':
      drawElevColumn(dc, species, form, phase, w, h, baseX, baseY);
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
