import { describe, expect, it } from 'vitest';
import { plantState } from '../plantState';
import { plantAge, sizeAt } from '../growth';
import { phaseAt } from '../phenology';
import { SPECIES, getSpecies } from '../plants';
import type { PlantInstance, Site } from '../types';

/**
 * The three views used to work this out themselves, in four identical lines
 * each. This asserts that the one shared answer is exactly the answer all three
 * were already getting — for every species in the library, across the year and
 * across the age slider.
 *
 * Written as an equivalence rather than as expected values on purpose. The point
 * is not that a birch is 4.2 m in year eight; it is that moving the derivation
 * did not change it. Pinning numbers here would only duplicate the growth and
 * phenology tests, and would go stale the moment a curve is legitimately tuned.
 *
 * The refactor could not be checked by comparing screenshots, incidentally:
 * `addPlant` gives every plant a random seed, so two runs of identical code
 * produce different pictures. That is fine for a sketchy drawing and fatal for
 * pixel comparison, which is worth knowing before anyone tries it.
 */

const SITE: Site = {
  latitude: 51.51,
  longitude: -0.13,
  altitude: 11,
  northAngle: 0,
  dst: true,
  label: 'London',
  slopeFall: 0,
  slopeDirection: 180,
};

const plantOf = (speciesId: string, plantedAge = 0): PlantInstance => ({
  id: `t-${speciesId}`,
  speciesId,
  x: 5,
  y: 5,
  seed: 1234,
  plantedAge,
});

/** The four lines every view used to carry. */
function derivedTheOldWay(plant: PlantInstance, doy: number, year: number) {
  const species = getSpecies(plant.speciesId);
  return {
    species,
    age: plantAge(plant.plantedAge, year),
    size: sizeAt(species, plantAge(plant.plantedAge, year)),
    phase: phaseAt(species, doy, SITE),
  };
}

describe('one answer for what a plant is right now', () => {
  it('matches the derivation it replaced, for every plant in the library', () => {
    for (const species of SPECIES) {
      const plant = plantOf(species.id);
      for (const doy of [15, 105, 196, 288, 350]) {
        for (const year of [0, 7, 20]) {
          const time = { hour: 13, doy, year };
          const now = plantState(plant, time, SITE);
          const then = derivedTheOldWay(plant, doy, year);

          expect(now.species).toBe(then.species);
          expect(now.age).toBe(then.age);
          expect(now.size).toEqual(then.size);
          expect(now.phase).toEqual(then.phase);
        }
      }
    }
  });

  it('carries a plant bought part-grown, rather than starting it from nursery size', () => {
    const time = { hour: 13, doy: 196, year: 0 };
    const young = plantState(plantOf('betula-jacquemontii', 0), time, SITE);
    const older = plantState(plantOf('betula-jacquemontii', 10), time, SITE);

    expect(older.age).toBe(young.age + 10);
    expect(older.size.height).toBeGreaterThan(young.size.height);
  });

  it('moves with the age slider and with the day of the year, independently', () => {
    const plant = plantOf('betula-jacquemontii');
    const summer = plantState(plant, { hour: 13, doy: 196, year: 5 }, SITE);
    const winter = plantState(plant, { hour: 13, doy: 15, year: 5 }, SITE);
    const summerLater = plantState(plant, { hour: 13, doy: 196, year: 20 }, SITE);

    // Same year, different season: same size, different leaf.
    expect(winter.size).toEqual(summer.size);
    expect(winter.phase.leafCover).toBeLessThan(summer.phase.leafCover);

    // Same season, different year: same leaf, bigger plant.
    expect(summerLater.phase).toEqual(summer.phase);
    expect(summerLater.size.height).toBeGreaterThan(summer.size.height);
  });

  it('refuses an id the library does not have, rather than drawing nothing', () => {
    // The load guard in projectFile.ts exists because this throws. If it ever
    // starts returning a placeholder instead, that guard becomes dead code and
    // a damaged file would silently lose plants.
    expect(() => plantState(plantOf('not-a-real-plant'), { hour: 13, doy: 100, year: 0 }, SITE))
      .toThrow(/Unknown species/);
  });
});
