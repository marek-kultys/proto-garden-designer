import { mulberry32 } from './sketch';
import type { Species } from '../model/types';

/**
 * The fixed "skeleton" of an individual plant.
 *
 * Every random decision about a plant — where its branches fork, where its leaf
 * masses sit, how its outline bulges — is made once, here, from the instance
 * seed, and cached. Rendering then reads this structure and varies only size,
 * colour and how much of it is visible.
 *
 * The alternative, deciding those things while drawing, quietly breaks the whole
 * illusion: the number of leaf clumps changes as the season slider moves, which
 * changes how much randomness has been consumed, which rearranges the plant.
 * Scrubbing time would look like the garden was being replanted each frame
 * instead of growing. Separating skeleton from state is what makes a plant feel
 * like the same plant at every point on all three sliders.
 */

export interface Clump {
  /** Offsets as a fraction of spread (x) and height (y). */
  ax: number;
  ay: number;
  /** Radius as a fraction of spread. */
  r: number;
  /** −1 to 1, used to vary tone so masses read as separate. */
  tone: number;
  wobble: number[];
  seed: number;
  /** Draw order front-to-back. */
  depth: number;
}

export interface Branch {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bend: number;
  depth: number;
}

export interface Stem {
  /** Base offset as a fraction of spread. */
  ax: number;
  /** Height as a fraction of full height. */
  h: number;
  lean: number;
  bend: number;
  seed: number;
}

/**
 * The framework of a trained tree, for the elevation.
 *
 * Kept apart from `branches`, `elevClumps` and `flowers` on purpose. Those are
 * placed for a free-grown crown and are read by the tree drawing with its own
 * offsets — flowers, for instance, are pushed into the upper half and widened —
 * so a fan's blossom put there would float in the air beside its ribs rather
 * than sit on them. And `flowers` is overwritten for every plant once its shape
 * is built, for the plan view. Everything here is literal: x is a fraction of
 * the plant's width, centred on its stem; y is a fraction of the height of the
 * part it belongs to — the whole plant for a fan or a cordon, the trained head
 * above the clear stem for a pleached or umbrella tree.
 */
export interface TrainedForm {
  branches: Branch[];
  leaves: Clump[];
  /** Where blossom and then fruit sit, on the framework. */
  buds: { ax: number; ay: number; r: number; seed: number }[];
}

/** A fan's short leg, below its lowest ribs, as a fraction of its height. */
export const FAN_LEG = 0.12;

/** A cordon's single stem, bottom to top, in the same fractions as `TrainedForm`. */
export const CORDON_STEM = { x0: -0.42, y0: 0, x1: 0.42, y1: 0.97 };

export interface PlantForm {
  seed: number;
  /** Wobble profile for the plan-view canopy outline. */
  outline: number[];
  planClumps: Clump[];
  elevClumps: Clump[];
  branches: Branch[];
  stems: Stem[];
  flowers: { ax: number; ay: number; r: number; seed: number; depth: number }[];
  /** Fraction of total height that is clear trunk. */
  trunkFraction: number;
  trunks: { ax: number; lean: number }[];
  rotation: number;
  /** Only for the trained habits. */
  trained?: TrainedForm;
}

function wobbleProfile(rng: () => number, n: number, amount: number): number[] {
  const raw = Array.from({ length: n }, () => 1 + (rng() - 0.5) * 2 * amount);
  // Smooth it so the outline undulates instead of spiking.
  return raw.map((_, i) => {
    const prev = raw[(i - 1 + n) % n];
    const next = raw[(i + 1) % n];
    return (prev + raw[i] * 2 + next) / 4;
  });
}

function makeClumps(
  rng: () => number,
  count: number,
  spreadX: number,
  spreadY: number,
  centreY: number,
  radius: [number, number],
): Clump[] {
  const clumps: Clump[] = [];
  for (let i = 0; i < count; i++) {
    // Rejection-free polar placement, biased outward so the middle is not bald.
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(0.15 + rng() * 0.85);
    clumps.push({
      ax: Math.cos(a) * d * spreadX,
      ay: centreY + Math.sin(a) * d * spreadY,
      r: radius[0] + rng() * (radius[1] - radius[0]),
      tone: rng() * 2 - 1,
      wobble: wobbleProfile(rng, 9, 0.22),
      seed: Math.floor(rng() * 1e9),
      depth: rng(),
    });
  }
  return clumps.sort((a, b) => a.depth - b.depth);
}

function makeBranches(rng: () => number, trunkTop: number, spread: number): Branch[] {
  const branches: Branch[] = [];

  const grow = (
    x0: number,
    y0: number,
    angle: number,
    length: number,
    depth: number,
  ): void => {
    const x1 = x0 + Math.cos(angle) * length * spread;
    const y1 = y0 + Math.sin(angle) * length;
    branches.push({ x0, y0, x1, y1, bend: (rng() - 0.5) * 0.06, depth });
    if (depth >= 2) return;
    const forks = depth === 0 ? 2 + Math.floor(rng() * 2) : 2;
    for (let i = 0; i < forks; i++) {
      const spreadAngle = (rng() - 0.5) * 1.5;
      grow(x1, y1, angle + spreadAngle, length * (0.5 + rng() * 0.2), depth + 1);
    }
  };

  const primary = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < primary; i++) {
    // Angles measured with y increasing upward; fan them either side of vertical.
    const angle = Math.PI / 2 + ((i - (primary - 1) / 2) / primary) * 1.9 + (rng() - 0.5) * 0.3;
    grow(0, trunkTop, angle, 0.26 + rng() * 0.16, 0);
  }
  return branches;
}

function makeStems(rng: () => number, count: number): Stem[] {
  return Array.from({ length: count }, () => ({
    ax: (rng() - 0.5) * 0.9,
    h: 0.62 + rng() * 0.38,
    lean: (rng() - 0.5) * 0.5,
    bend: (rng() - 0.5) * 0.35,
    seed: Math.floor(rng() * 1e9),
  }));
}

/** A leaf clump at a literal position, for a trained framework. */
function leafAt(rng: () => number, ax: number, ay: number, r: number): Clump {
  return {
    ax,
    ay,
    r,
    tone: rng() * 2 - 1,
    wobble: wobbleProfile(rng, 9, 0.22),
    seed: Math.floor(rng() * 1e9),
    depth: rng(),
  };
}

/** Points along a straight run from (x0, y0) to (x1, y1), with a little scatter. */
function along(
  rng: () => number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  count: number,
  from: number,
  scatter: number,
): { x: number; y: number; t: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const t = from + ((1 - from) * (i + 0.5)) / count;
    return {
      x: x0 + (x1 - x0) * t + (rng() - 0.5) * scatter,
      y: y0 + (y1 - y0) * t + (rng() - 0.5) * scatter,
      t,
    };
  });
}

/**
 * Pleached: tiers of branches tied along a frame, out from a central leader.
 * In the head's own fractions, so the tiers stay on the panel however the clear
 * stem compares with the head as the tree fills out.
 */
function pleachedFramework(rng: () => number): TrainedForm {
  const branches: Branch[] = [{ x0: 0, y0: 0, x1: 0, y1: 0.98, bend: 0, depth: 0 }];
  for (const tier of [0.12, 0.42, 0.72, 0.95]) {
    for (const side of [-1, 1]) {
      branches.push({
        x0: 0,
        y0: tier,
        x1: side * (0.46 + rng() * 0.03),
        y1: tier + (rng() - 0.5) * 0.04,
        bend: (rng() - 0.5) * 0.04,
        depth: 1,
      });
    }
  }
  const buds = Array.from({ length: 16 }, () => ({
    ax: (rng() - 0.5) * 0.86,
    ay: 0.1 + rng() * 0.85,
    r: 0.014 + rng() * 0.012,
    seed: Math.floor(rng() * 1e9),
  }));
  return { branches, leaves: [], buds };
}

/**
 * Umbrella: spokes run out level from the top of the stem to the edge of the
 * frame. Seen side-on, the ones running towards or away from you look short.
 */
function umbrellaFramework(rng: () => number): TrainedForm {
  const spokes = 8;
  const branches: Branch[] = Array.from({ length: spokes }, (_, i) => {
    const bearing = (i / spokes) * Math.PI * 2 + rng() * 0.2;
    return {
      x0: 0,
      y0: 0.05,
      x1: Math.cos(bearing) * (0.46 + rng() * 0.03),
      y1: 0.18 + rng() * 0.12,
      bend: (rng() - 0.5) * 0.04,
      depth: 0,
    };
  });
  const buds = Array.from({ length: 18 }, () => ({
    ax: (rng() - 0.5) * 0.9,
    ay: 0.35 + rng() * 0.6,
    r: 0.009 + rng() * 0.008,
    seed: Math.floor(rng() * 1e9),
  }));
  return { branches, leaves: [], buds };
}

/**
 * Fan: ribs spread from the top of a short leg to the edge of a half-ellipse,
 * the lowest nearly level, each carrying short side shoots. Leaves and fruit
 * follow the ribs, because on a fan that is the only place they can be.
 */
function fanFramework(rng: () => number): TrainedForm {
  const ribs = 9;
  const branches: Branch[] = [];
  const leaves: Clump[] = [];
  const buds: TrainedForm['buds'] = [];
  for (let i = 0; i < ribs; i++) {
    const angle = (Math.PI * (18 + (144 * i) / (ribs - 1))) / 180 + (rng() - 0.5) * 0.05;
    const x1 = Math.cos(angle) * 0.49;
    const y1 = FAN_LEG + Math.sin(angle) * (1 - FAN_LEG) * 0.97;
    branches.push({ x0: 0, y0: FAN_LEG, x1, y1, bend: (rng() - 0.5) * 0.03, depth: 0 });

    for (const p of along(rng, 0, FAN_LEG, x1, y1, 3, 0.3, 0)) {
      const turn = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.2);
      const len = 0.06 + rng() * 0.05;
      branches.push({
        x0: p.x,
        y0: p.y,
        x1: p.x + Math.cos(angle + turn) * len,
        y1: p.y + Math.sin(angle + turn) * len * 1.4,
        bend: 0,
        depth: 1,
      });
    }
    for (const p of along(rng, 0, FAN_LEG, x1, y1, 6, 0.18, 0.035)) {
      leaves.push(leafAt(rng, p.x, p.y, 0.028 + rng() * 0.018));
    }
    for (const p of along(rng, 0, FAN_LEG, x1, y1, 4, 0.25, 0.03)) {
      buds.push({ ax: p.x, ay: p.y, r: 0.007 + rng() * 0.005, seed: Math.floor(rng() * 1e9) });
    }
  }
  leaves.sort((a, b) => a.depth - b.depth);
  return { branches, leaves, buds };
}

/**
 * Cordon: one stem at a slant, fruiting spurs alternating off it. The stem is
 * drawn from `CORDON_STEM`; these are the spurs, leaves and fruit along it.
 */
function cordonFramework(rng: () => number): TrainedForm {
  const { x0, y0, x1, y1 } = CORDON_STEM;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  // Square to the stem, allowing for the drawing being taller than it is wide.
  const px = -dy / len;
  const py = dx / len;
  const branches: Branch[] = [];
  const leaves: Clump[] = [];
  const buds: TrainedForm['buds'] = [];
  along(rng, x0, y0, x1, y1, 11, 0.06, 0).forEach((p, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const reach = 0.06 + rng() * 0.04;
    const tip = { x: p.x + px * side * reach, y: p.y + py * side * reach };
    branches.push({ x0: p.x, y0: p.y, x1: tip.x, y1: tip.y, bend: 0, depth: 1 });
    buds.push({ ax: tip.x, ay: tip.y, r: 0.018 + rng() * 0.01, seed: Math.floor(rng() * 1e9) });
  });
  for (const p of along(rng, x0, y0, x1, y1, 16, 0.04, 0)) {
    const off = (rng() - 0.5) * 0.14;
    leaves.push(leafAt(rng, p.x + px * off, p.y + py * off, 0.05 + rng() * 0.03));
  }
  leaves.sort((a, b) => a.depth - b.depth);
  return { branches, leaves, buds };
}

const cache = new Map<string, PlantForm>();

export function getForm(species: Species, seed: number): PlantForm {
  const key = `${species.id}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const rng = mulberry32(seed);
  const form: PlantForm = {
    seed,
    outline: [],
    planClumps: [],
    elevClumps: [],
    branches: [],
    stems: [],
    flowers: [],
    trunkFraction: 0.35,
    trunks: [{ ax: 0, lean: 0 }],
    rotation: rng() * Math.PI * 2,
  };

  switch (species.habit) {
    case 'round': {
      form.outline = wobbleProfile(rng, 13, 0.16);
      form.trunkFraction = 0.3 + rng() * 0.1;
      form.trunks = [{ ax: 0, lean: (rng() - 0.5) * 0.06 }];
      form.planClumps = makeClumps(rng, 14, 0.42, 0.42, 0, [0.16, 0.26]);
      form.elevClumps = makeClumps(
        rng,
        16,
        0.52,
        (1 - form.trunkFraction) / 2.4,
        form.trunkFraction + (1 - form.trunkFraction) / 2,
        [0.14, 0.24],
      );
      form.branches = makeBranches(rng, form.trunkFraction, 1.05);
      break;
    }
    case 'multistem': {
      form.outline = wobbleProfile(rng, 13, 0.2);
      form.trunkFraction = 0.16 + rng() * 0.08;
      const stems = 3 + Math.floor(rng() * 2);
      form.trunks = Array.from({ length: stems }, (_, i) => ({
        ax: ((i - (stems - 1) / 2) / stems) * 0.5,
        lean: ((i - (stems - 1) / 2) / stems) * 0.55 + (rng() - 0.5) * 0.12,
      }));
      form.planClumps = makeClumps(rng, 13, 0.44, 0.44, 0, [0.15, 0.25]);
      form.elevClumps = makeClumps(rng, 15, 0.42, 0.3, 0.62, [0.13, 0.22]);
      form.branches = makeBranches(rng, 0.45, 0.95);
      break;
    }
    case 'columnar': {
      form.outline = wobbleProfile(rng, 11, 0.07);
      form.trunkFraction = 0.06;
      form.planClumps = makeClumps(rng, 7, 0.3, 0.3, 0, [0.16, 0.24]);
      form.elevClumps = makeClumps(rng, 10, 0.3, 0.36, 0.5, [0.14, 0.2]);
      break;
    }
    case 'mound': {
      form.outline = wobbleProfile(rng, 12, 0.14);
      form.trunkFraction = 0.05;
      form.planClumps = makeClumps(rng, 11, 0.4, 0.4, 0, [0.16, 0.26]);
      form.elevClumps = makeClumps(rng, 12, 0.42, 0.3, 0.5, [0.15, 0.24]);
      break;
    }
    case 'tussock': {
      form.outline = wobbleProfile(rng, 11, 0.2);
      form.trunkFraction = 0;
      form.stems = makeStems(rng, 26);
      form.planClumps = makeClumps(rng, 8, 0.34, 0.34, 0, [0.12, 0.2]);
      break;
    }
    case 'clump': {
      form.outline = wobbleProfile(rng, 12, 0.18);
      form.trunkFraction = 0;
      form.planClumps = makeClumps(rng, 12, 0.38, 0.38, 0, [0.18, 0.3]);
      form.elevClumps = makeClumps(rng, 10, 0.44, 0.22, 0.4, [0.18, 0.28]);
      break;
    }
    case 'airy': {
      form.outline = wobbleProfile(rng, 11, 0.24);
      form.trunkFraction = 0;
      form.stems = makeStems(rng, 14);
      form.planClumps = makeClumps(rng, 7, 0.4, 0.4, 0, [0.07, 0.12]);
      break;
    }
    case 'spire': {
      // A low rosette of leaves with a few tall dense flower spikes standing
      // clear of it — the whole point of a delphinium or a foxglove is that the
      // flower is well above the foliage, so the two are built separately.
      form.outline = wobbleProfile(rng, 11, 0.16);
      form.trunkFraction = 0;
      form.stems = Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({
        ax: (rng() - 0.5) * 0.55,
        h: 0.82 + rng() * 0.18,
        lean: (rng() - 0.5) * 0.16,
        bend: (rng() - 0.5) * 0.12,
        seed: Math.floor(rng() * 1e9),
      }));
      form.planClumps = makeClumps(rng, 9, 0.36, 0.36, 0, [0.14, 0.24]);
      form.elevClumps = makeClumps(rng, 8, 0.42, 0.14, 0.16, [0.16, 0.26]);
      break;
    }
    case 'fern': {
      // A shuttlecock: fronds all rising from one crown and arching outward, so
      // the stems share a base rather than being scattered like a grass clump.
      form.outline = wobbleProfile(rng, 12, 0.2);
      form.trunkFraction = 0;
      const fronds = 9 + Math.floor(rng() * 4);
      form.stems = Array.from({ length: fronds }, (_, i) => {
        const t = (i + 0.5) / fronds;
        const side = i % 2 === 0 ? 1 : -1;
        return {
          ax: (rng() - 0.5) * 0.12,
          h: 0.66 + rng() * 0.34,
          // Fanned rather than random: fronds radiate from the crown.
          lean: side * (0.2 + t * 0.75) + (rng() - 0.5) * 0.12,
          bend: side * (0.3 + rng() * 0.3),
          seed: Math.floor(rng() * 1e9),
        };
      });
      form.planClumps = makeClumps(rng, 9, 0.4, 0.4, 0, [0.1, 0.18]);
      break;
    }
    case 'treefern': {
      // The same crown, lifted on a single fibrous trunk. Dicksonia puts on a
      // few centimetres a year, so the trunk is most of what you see.
      form.outline = wobbleProfile(rng, 11, 0.14);
      form.trunkFraction = 0.55 + rng() * 0.1;
      form.trunks = [{ ax: 0, lean: (rng() - 0.5) * 0.04 }];
      const crown = 8 + Math.floor(rng() * 3);
      form.stems = Array.from({ length: crown }, (_, i) => {
        const t = (i + 0.5) / crown;
        const side = i % 2 === 0 ? 1 : -1;
        return {
          ax: (rng() - 0.5) * 0.08,
          h: 0.7 + rng() * 0.3,
          lean: side * (0.25 + t * 0.85) + (rng() - 0.5) * 0.12,
          bend: side * (0.35 + rng() * 0.3),
          seed: Math.floor(rng() * 1e9),
        };
      });
      form.planClumps = makeClumps(rng, 8, 0.42, 0.42, 0, [0.12, 0.2]);
      break;
    }
    case 'pleached': {
      // Clipped to a line, so the outline barely moves. From above it is a
      // shallow band like a climber's, and is drawn as one.
      form.outline = wobbleProfile(rng, 12, 0.05);
      form.trunkFraction = 0.55;
      form.planClumps = makeClumps(rng, 12, 0.44, 0.18, 0, [0.12, 0.2]);
      form.trained = pleachedFramework(rng);
      break;
    }
    case 'umbrella': {
      // From above, a clipped disc.
      form.outline = wobbleProfile(rng, 13, 0.06);
      form.trunkFraction = 0.75;
      form.planClumps = makeClumps(rng, 14, 0.42, 0.42, 0, [0.16, 0.26]);
      form.trained = umbrellaFramework(rng);
      break;
    }
    case 'fan': {
      form.outline = wobbleProfile(rng, 12, 0.1);
      form.trunkFraction = FAN_LEG;
      form.planClumps = makeClumps(rng, 12, 0.44, 0.18, 0, [0.12, 0.2]);
      form.trained = fanFramework(rng);
      break;
    }
    case 'cordon': {
      form.outline = wobbleProfile(rng, 12, 0.1);
      form.trunkFraction = 0;
      form.trunks = [];
      form.planClumps = makeClumps(rng, 10, 0.44, 0.18, 0, [0.12, 0.2]);
      form.trained = cordonFramework(rng);
      break;
    }
    case 'climber': {
      // A climber is a sheet of growth held up by something else, so its form is
      // a vertical panel rather than a mass with a middle. `spread` means how
      // wide a face it covers, not how far it stands out from the wall — which
      // is why the plan footprint is a shallow band and the elevation is a
      // rectangle of leaf rather than a canopy on a trunk.
      form.outline = wobbleProfile(rng, 12, 0.12);
      form.trunkFraction = 0.08;
      form.trunks = [{ ax: (rng() - 0.5) * 0.4, lean: 0 }];
      form.planClumps = makeClumps(rng, 12, 0.44, 0.18, 0, [0.12, 0.2]);
      form.elevClumps = makeClumps(rng, 18, 0.44, 0.42, 0.5, [0.13, 0.22]);
      // Stems run up the support and fan out near the top.
      form.stems = Array.from({ length: 5 + Math.floor(rng() * 3) }, () => ({
        ax: (rng() - 0.5) * 0.8,
        h: 0.7 + rng() * 0.3,
        lean: (rng() - 0.5) * 0.5,
        bend: (rng() - 0.5) * 0.2,
        seed: Math.floor(rng() * 1e9),
      }));
      break;
    }
    case 'globe': {
      // Few stems, near-vertical, spaced apart: a clump of alliums is read as a
      // handful of distinct heads, not as a mass.
      form.outline = wobbleProfile(rng, 10, 0.1);
      form.trunkFraction = 0;
      form.stems = Array.from({ length: 3 + Math.floor(rng() * 3) }, () => ({
        ax: (rng() - 0.5) * 0.7,
        h: 0.78 + rng() * 0.22,
        lean: (rng() - 0.5) * 0.28,
        bend: (rng() - 0.5) * 0.1,
        seed: Math.floor(rng() * 1e9),
      }));
      form.planClumps = makeClumps(rng, 5, 0.3, 0.3, 0, [0.1, 0.16]);
      break;
    }
  }

  const FLOWER_COUNT: Partial<Record<Species['habit'], number>> = {
    globe: 8,
    spire: 10,
    airy: 14,
    tussock: 18,
    // A clematis or a jasmine in flower reads as a sheet of bloom, not as a
    // countable handful.
    climber: 26,
    fern: 0,
    treefern: 0,
  };
  const flowerCount =
    FLOWER_COUNT[species.habit] ?? (species.type === 'tree' ? 22 : 14);
  form.flowers = Array.from({ length: flowerCount }, () => {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng());
    return {
      ax: Math.cos(a) * d * 0.44,
      ay: Math.sin(a) * d * 0.44,
      r: 0.03 + rng() * 0.05,
      seed: Math.floor(rng() * 1e9),
      depth: rng(),
    };
  });

  cache.set(key, form);
  return form;
}
