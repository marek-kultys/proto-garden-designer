import { describe, expect, it } from 'vitest';
import {
  CLIMBER_MAX_RUN,
  CLIMBER_TRELLIS_HEIGHT,
  currentGrowthRate,
  matureSize,
  plantAge,
  sizeAt,
} from '../growth';
import { SPECIES, getSpecies } from '../plants';

describe('growth curve', () => {
  it('starts every plant at its nursery size', () => {
    for (const species of SPECIES) {
      const size = sizeAt(species, 0);
      expect(size.height).toBeCloseTo(species.plantedHeight, 5);
      expect(size.spread).toBeCloseTo(species.plantedSpread, 5);
    }
  });

  // Measured against the size each plant is actually heading for. For a climber
  // that is not its catalogue height: it runs out of trellis at 2.2 m and puts
  // the rest into width, so comparing against the raw figure would be asking
  // whether it had done something the model never intends it to do.
  it('reaches at least 95% of mature size by its stated time to maturity', () => {
    for (const species of SPECIES) {
      if (species.clipped) continue;
      const size = sizeAt(species, species.yearsToMature);
      expect(size.height / matureSize(species).height).toBeGreaterThan(0.95);
    }
  });

  it('never shrinks and never overshoots mature size', () => {
    for (const species of SPECIES) {
      let previous = 0;
      for (let year = 0; year <= 60; year += 0.5) {
        const size = sizeAt(species, year);
        expect(size.height).toBeGreaterThanOrEqual(previous - 1e-9);
        expect(size.height).toBeLessThanOrEqual(matureSize(species).height + 1e-9);
        expect(size.spread).toBeLessThanOrEqual(matureSize(species).spread + 1e-9);
        previous = size.height;
      }
    }
  });

  it('grows height ahead of spread while a tree is young', () => {
    const birch = getSpecies('betula-jacquemontii');
    const at8 = sizeAt(birch, 8);
    const heightProgress =
      (at8.height - birch.plantedHeight) / (birch.matureHeight - birch.plantedHeight);
    const spreadProgress =
      (at8.spread - birch.plantedSpread) / (birch.matureSpread - birch.plantedSpread);
    expect(heightProgress).toBeGreaterThan(spreadProgress);
  });

  it('puts the birch somewhere near 10–12 m after twenty years', () => {
    // The figure the age slider is calibrated against; RHS "ultimate" is higher.
    const height = sizeAt(getSpecies('betula-jacquemontii'), 20).height;
    expect(height).toBeGreaterThan(9.5);
    expect(height).toBeLessThan(12.5);
  });

  it('keeps the amelanchier to a small-garden size at twenty years', () => {
    const height = sizeAt(getSpecies('amelanchier-lamarckii'), 20).height;
    expect(height).toBeGreaterThan(3.5);
    expect(height).toBeLessThan(6);
  });

  it('holds a clipped yew at its maintained height once it gets there', () => {
    const yew = getSpecies('taxus-baccata');
    expect(yew.clipped).toBe(true);
    // 0.8 m planted, 0.3 m a year, held at 2 m: about four years to target.
    expect(sizeAt(yew, 2).height).toBeCloseTo(1.4, 5);
    expect(sizeAt(yew, 4).height).toBeCloseTo(2.0, 5);
    expect(sizeAt(yew, 20).height).toBeCloseTo(2.0, 5);
  });

  it('reports fast growth in the middle years and none once mature', () => {
    const birch = getSpecies('betula-jacquemontii');
    expect(currentGrowthRate(birch, 10)).toBeGreaterThan(currentGrowthRate(birch, 45));
    expect(currentGrowthRate(birch, 60)).toBeLessThan(0.05);
  });

  it('brings perennials to full size within a few seasons', () => {
    for (const id of ['verbena-bonariensis', 'geranium-rozanne', 'calamagrostis-karl-foerster']) {
      const species = getSpecies(id);
      expect(sizeAt(species, 4).height / matureSize(species).height).toBeGreaterThan(0.9);
    }
  });
});

describe('a plant that went in part-grown', () => {
  const birch = getSpecies('betula-jacquemontii');

  it('counts the head start as the plant\'s own age, not the garden\'s', () => {
    expect(plantAge(10, 0)).toBe(10);
    expect(plantAge(10, 5)).toBe(15);
    expect(plantAge(0, 5)).toBe(5);
  });

  it('is already the size it would have reached in that many years', () => {
    const specimen = sizeAt(birch, plantAge(10, 0));
    const grownOnSite = sizeAt(birch, 10);
    expect(specimen.height).toBeCloseTo(grownOnSite.height);
  });

  /**
   * The point of buying one in: on the day the garden goes in it is a tree and
   * the nursery stock beside it is a whip.
   */
  it('is taller than nursery stock on the day of planting', () => {
    expect(sizeAt(birch, plantAge(10, 0)).height).toBeGreaterThan(
      sizeAt(birch, plantAge(0, 0)).height * 1.5,
    );
  });

  it('stays ahead for the whole span of the age slider', () => {
    for (const year of [0, 1, 5, 10, 20]) {
      expect(
        sizeAt(birch, plantAge(10, year)).height,
        `year ${year}`,
      ).toBeGreaterThan(sizeAt(birch, plantAge(0, year)).height);
    }
  });

  it('closes the gap as both approach mature size, rather than staying parallel', () => {
    const gapEarly =
      sizeAt(birch, plantAge(10, 0)).height - sizeAt(birch, plantAge(0, 0)).height;
    const gapLate =
      sizeAt(birch, plantAge(10, 20)).height - sizeAt(birch, plantAge(0, 20)).height;
    // A logistic curve levels off, so the head start is worth less and less.
    expect(gapLate).toBeLessThan(gapEarly);
  });

  it('never runs backwards past year zero', () => {
    expect(plantAge(0, -5)).toBe(0);
  });
});

describe('a climber runs out of things to climb', () => {
  const ivy = getSpecies('hedera-helix');
  const montana = getSpecies('clematis-montana');

  /**
   * There is no house, pergola or boundary wall in this model, so a climber is
   * drawn against an implied trellis. Letting it head for its catalogue height
   * made a clematis go up like a column; what one does on a garden fence is
   * reach the top and then run along it.
   */
  it('climbs first, while it is still shorter than its support', () => {
    expect(sizeAt(ivy, 0).height).toBeCloseTo(ivy.plantedHeight, 5);
    expect(sizeAt(ivy, 0).height).toBeLessThan(CLIMBER_TRELLIS_HEIGHT);
    expect(sizeAt(ivy, 3).height).toBeGreaterThan(sizeAt(ivy, 0).height);
  });

  it('never goes above the trellis, however old it gets', () => {
    for (const years of [5, 10, 20, 50]) {
      expect(sizeAt(ivy, years).height).toBeLessThanOrEqual(CLIMBER_TRELLIS_HEIGHT + 1e-9);
      expect(sizeAt(montana, years).height).toBeLessThanOrEqual(CLIMBER_TRELLIS_HEIGHT + 1e-9);
    }
  });

  it('stops rising at the trellis, whatever its catalogue height', () => {
    expect(matureSize(montana).height).toBeCloseTo(CLIMBER_TRELLIS_HEIGHT, 5);
    for (const years of [5, 10, 20, 50]) {
      expect(sizeAt(montana, years).height).toBeLessThanOrEqual(CLIMBER_TRELLIS_HEIGHT + 1e-9);
    }
  });

  /**
   * Width is where vigour lives, and it is the plant's own researched figure.
   *
   * Capping the width as well was tried and flattened every climber to the same
   * size from about year four — exactly when a designer most wants to know
   * which of them is the thug.
   */
  it('runs as far along as its own spread says, not a shared figure', () => {
    const winter = getSpecies('jasminum-nudiflorum');
    const vine = getSpecies('vitis-coignetiae');

    expect(matureSize(montana).spread).toBeCloseTo(montana.matureSpread, 5);
    expect(matureSize(winter).spread).toBeCloseTo(winter.matureSpread, 5);
    expect(matureSize(vine).spread).toBeGreaterThan(matureSize(winter).spread * 1.8);
  });

  it('keeps the rampant and the restrained apart at twenty years', () => {
    const winter = getSpecies('jasminum-nudiflorum');
    // The point of the change: at year 20 they are the same height, and plainly
    // not the same plant.
    expect(sizeAt(montana, 20).height).toBeCloseTo(sizeAt(winter, 20).height, 5);
    expect(sizeAt(montana, 20).spread).toBeGreaterThan(sizeAt(winter, 20).spread * 1.5);
  });

  it('shows vigour in the early years too, while it is still rising', () => {
    const winter = getSpecies('jasminum-nudiflorum');
    expect(sizeAt(montana, 1).height).toBeGreaterThan(sizeAt(winter, 1).height * 1.5);
  });

  it('never runs past the guard against absurd data', () => {
    for (const s of SPECIES.filter((x) => x.type === 'climber')) {
      expect(matureSize(s).spread).toBeLessThanOrEqual(CLIMBER_MAX_RUN);
    }
  });

  it('leaves a climber shorter than the trellis alone', () => {
    // Nothing here is under 2.2 m today, but the rule must not invent width for
    // one that is: a short climber simply reaches its own height.
    const short = { ...montana, matureHeight: 1.8, matureSpread: 1.2 };
    expect(matureSize(short)).toEqual({ height: 1.8, spread: 1.2 });
  });

  it('does not touch anything that is not a climber', () => {
    const birch = getSpecies('betula-jacquemontii');
    expect(matureSize(birch)).toEqual({
      height: birch.matureHeight,
      spread: birch.matureSpread,
    });
    expect(sizeAt(birch, 20).height).toBeGreaterThan(CLIMBER_TRELLIS_HEIGHT);
  });
});
