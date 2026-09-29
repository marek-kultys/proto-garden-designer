import { blobPoints, curvePath, roughCurve, roughLine, subSeed, taperedStroke } from '../sketch';
import { inkColour, shade } from '../palette';
import { type PlantForm } from '../form';
import { type Phase, type Species } from '../../model/types';
import { type DrawContext, flowerFill, leafFill } from './shared';

/**
 * The soft shapes from the side: grasses, airy stems, drumstick heads, flower
 * spikes and ferns.
 *
 * What they have in common is that they are drawn stem by stem or frond by
 * frond rather than as a mass with an outline. A grass is its stems; a fern is
 * its fronds; draw either as a blob and it stops being the plant.
 */

export function drawElevTussock(
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

export function drawElevAiry(
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

/**
 * Alliums in elevation, which is the view that earns them: bare vertical stems,
 * each holding a sphere well clear of everything around it.
 */
export function drawElevGlobes(
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
 * A spire: a low cushion of basal leaves with tall flower spikes standing clear
 * of it. Keeping the two separate is the point — a delphinium at 1.8 m is 40 cm
 * of leaf and well over a metre of flower, and drawing it as one mass loses the
 * thing that makes it worth planting.
 */
export function drawElevSpire(
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
  // Nothing to draw only when there is no leaf, no flower and no standing seed
  // spike. Checking just leaf and flower returned before the dry spike below was
  // ever reached, so every herbaceous spire left standing for the winter —
  // mullein, foxtail lily, bear's breeches and eight more — vanished from the
  // side views from the day its leaves died until spring.
  if (phase.leafCover < 0.04 && phase.flower < 0.04 && phase.seedhead < 0.05) return;

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
export function drawElevFern(
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
