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
  }

  const flowerCount =
    species.habit === 'airy' ? 14 : species.habit === 'tussock' ? 18 : species.type === 'tree' ? 22 : 14;
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
