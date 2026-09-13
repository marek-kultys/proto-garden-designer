import { plantAge, sizeAt } from './growth';
import { phaseAt } from './phenology';
import { getSpecies } from './plants';
import type { Phase, PlantInstance, PlantSize, Site, Species, TimeState } from './types';

/**
 * What one plant is, at one moment, on one site.
 *
 * The three views each answer the same question before they can draw anything:
 * which species is this, how old is it now, how big does that make it, and what
 * is it doing this week. All three used to derive that themselves, in the same
 * four lines, copied. Nothing was wrong with any copy — but PRODUCT.md already
 * records what happens when a derivation lives in three places: the sun map was
 * given sloping ground while the plan, the walls and the elevation each kept a
 * flat copy of the same sum, and on a hillside the overlay and the picture
 * underneath it disagreed about one shadow. This exists so the next change to
 * how a plant's size or season is worked out cannot land in two views and miss
 * the third.
 *
 * `phase` is computed here rather than left to the caller, even though the 360°
 * view only needs it for the plants that survive its culling. Working out a
 * phase is a handful of arithmetic with no allocation, and the alternative —
 * two entry points, one with the season and one without — reintroduces exactly
 * the drift this is here to prevent.
 */
export interface PlantState {
  species: Species;
  /** Years since planting, at this point on the age slider. */
  age: number;
  /** Height and spread now, not at maturity. */
  size: PlantSize;
  /** Leaf, flower, fruit and dormancy for this day of the year. */
  phase: Phase;
}

export function plantState(plant: PlantInstance, time: TimeState, site: Site): PlantState {
  const species = getSpecies(plant.speciesId);
  const age = plantAge(plant.plantedAge, time.year);
  return {
    species,
    age,
    size: sizeAt(species, age),
    phase: phaseAt(species, time.doy, site),
  };
}
