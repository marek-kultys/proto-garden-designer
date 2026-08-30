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

/**
 * How old a plant is, as opposed to how old the garden is.
 *
 * They are the same number only for something planted as nursery stock. Kept as
 * a named function rather than an addition at each call site, because a single
 * place that forgets it draws a semi-mature tree as a whip and is very hard to
 * spot afterwards.
 */
export function plantAge(plantedAge: number, gardenYear: number): number {
  return Math.max(0, gardenYear + plantedAge);
}

/**
 * How high a climber can get before it starts running sideways instead.
 *
 * There is no house, pergola or boundary wall in this model — a climber is
 * drawn against an implied trellis wherever it is put. Letting one head for its
 * catalogue height was the wrong reading of that: a clematis given a ten-metre
 * figure went up like a column, when what it does on a garden fence is reach
 * the top and then run along it. Roughly head height plus a little, which is
 * what a fence, a trellis panel or a low wall with wires actually gives you.
 */
export const CLIMBER_TRELLIS_HEIGHT = 2.2;

/**
 * How far along the support a climber runs is its own recorded spread — a
 * researched figure per plant, and the thing that separates a Japanese
 * honeysuckle at a metre and a half from a crimson glory vine at five.
 *
 * A single width for every climber was tried and is wrong: it made a rampant
 * montana and a well-behaved winter jasmine the same size from year four,
 * exactly when a designer most wants to know which is which. Height is the
 * dimension the trellis bounds; width is the dimension vigour shows in.
 *
 * The ceiling below is a guard against absurd data rather than part of the
 * model — nothing in the palette comes near it.
 */
export const CLIMBER_MAX_RUN = 8;

/**
 * A climber's growth, bounded by the panel it is growing on.
 *
 * Both ways: a climber fills roughly a fence panel and stops, rather than
 * heading for a catalogue figure measured up a mature tree or a house wall.
 * Only the height is bounded. Conserving the area instead — putting all the
 * surplus height into width — was tried and is worse: arguably truer of the
 * plant, but it produced a mountain clematis sixteen metres along and a vine
 * twenty-seven, wider than most gardens and unusable on the drawing. Capping
 * the width as well was tried after that, and flattened every climber to the
 * same size from about year four.
 *
 * So the trellis bounds how high it gets, and its own recorded spread decides
 * how far along it runs. Vigour then shows twice over: a rampant climber
 * reaches the top sooner, and covers more of the fence when it gets there.
 */
function onItsPanel(size: PlantSize): PlantSize {
  return {
    height: Math.min(CLIMBER_TRELLIS_HEIGHT, size.height),
    spread: Math.min(CLIMBER_MAX_RUN, size.spread),
  };
}

/**
 * The size a plant is heading for — the catalogue figures, except for a climber,
 * which is heading along a trellis rather than up one.
 *
 * Anything that scales itself to a plant's eventual size uses this rather than
 * the raw data, or a climber's card promises a height it never reaches and the
 * elevation strip is scaled for a twelve-metre plant that draws two.
 */
export function matureSize(species: Species): PlantSize {
  const full = { height: species.matureHeight, spread: species.matureSpread };
  return species.type === 'climber' ? onItsPanel(full) : full;
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
  const size = {
    height: species.plantedHeight + (species.matureHeight - species.plantedHeight) * h,
    spread: species.plantedSpread + (species.matureSpread - species.plantedSpread) * s,
  };
  // A climber goes up until it reaches the top of its support, and then along.
  // Nursery stock is well under that, so a young one still climbs first.
  return species.type === 'climber' ? onItsPanel(size) : size;
}

/** Metres of height put on over the coming year — used for the plant readout. */
export function currentGrowthRate(species: Species, years: number): number {
  return sizeAt(species, years + 1).height - sizeAt(species, years).height;
}

/** How far along its life the plant is, 0–1, for wording like "half grown". */
export function maturity(species: Species, years: number): number {
  const size = sizeAt(species, years);
  const span = matureSize(species).height - species.plantedHeight;
  if (span <= 0) return 1;
  return Math.min(1, (size.height - species.plantedHeight) / span);
}
