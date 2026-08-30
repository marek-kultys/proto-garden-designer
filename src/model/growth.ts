import type { PlantSize, Species } from './types';

/**
 * Growth from nursery stock to mature size.
 *
 * Plants do not grow linearly: they are slow to establish, run hard through the
 * middle years, then level off. A logistic curve captures that, and running
 * height and spread on separate curves reproduces the familiar habit of a young
 * tree shooting upward for its first decade and only then broadening out.
 *
 * Clipped subjects (a yew hedge, say) are a different animal — they gain a fixed
 * amount each year until they reach the size they are being held at, and then
 * stop, because someone is cutting them.
 */

function logistic(t: number, k: number, t0: number): number {
  return 1 / (1 + Math.exp(-k * (t - t0)));
}

/**
 * Normalised progress 0→1 over `years`, starting at 0 and reaching ~0.97 at
 * maturity. `midpoint` is where the growth spurt peaks, as a fraction of the
 * time to maturity — earlier for height, later for spread.
 */
function progress(years: number, yearsToMature: number, midpoint: number): number {
  const k = 5.5 / yearsToMature;
  const t0 = midpoint * yearsToMature;
  const at0 = logistic(0, k, t0);
  const raw = logistic(Math.max(0, years), k, t0);
  return Math.max(0, (raw - at0) / (1 - at0));
}

export function sizeAt(species: Species, years: number): PlantSize {
  if (species.clipped) {
    const rate = species.annualGrowth ?? 0.3;
    const t = Math.max(0, years);
    return {
      height: Math.min(species.matureHeight, species.plantedHeight + rate * t),
      spread: Math.min(species.matureSpread, species.plantedSpread + rate * 0.6 * t),
    };
  }

  const h = progress(years, species.yearsToMature, 0.3);
  const s = progress(years, species.yearsToMature, 0.42);
  return {
    height: species.plantedHeight + (species.matureHeight - species.plantedHeight) * h,
    spread: species.plantedSpread + (species.matureSpread - species.plantedSpread) * s,
  };
}

/** Metres of height put on over the coming year — used for the plant readout. */
export function currentGrowthRate(species: Species, years: number): number {
  return sizeAt(species, years + 1).height - sizeAt(species, years).height;
}

/** How far along its life the plant is, 0–1, for wording like "half grown". */
export function maturity(species: Species, years: number): number {
  const size = sizeAt(species, years);
  const span = species.matureHeight - species.plantedHeight;
  if (span <= 0) return 1;
  return Math.min(1, (size.height - species.plantedHeight) / span);
}
