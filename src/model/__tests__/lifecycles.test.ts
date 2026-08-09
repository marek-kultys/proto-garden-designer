import { describe, expect, it } from 'vitest';
import { phaseAt } from '../phenology';
import { sizeAt } from '../growth';
import { SPECIES, getSpecies } from '../plants';
import type { Site } from '../types';

/**
 * The twenty plants added after the first round brought behaviours the original
 * ten never exercised. Each of these tests pins one of them, because every one
 * is a case where the obvious implementation silently does nothing rather than
 * failing loudly — a flower window that never opens, a berry that never appears,
 * a bulb that refuses to go dormant.
 */

const LONDON: Site = {
  latitude: 51.5,
  longitude: -0.13,
  altitude: 0,
  northAngle: 0,
  dst: true,
  label: 'London',
};

describe('flowering across the turn of the year', () => {
  const viburnum = getSpecies('viburnum-tinus');

  it('has a window that really does wrap', () => {
    expect(viburnum.flowerEnd).toBeLessThan(viburnum.flowerStart);
  });

  it('flowers in December and January, not in July', () => {
    // A plain bell with its end before its start returns zero everywhere, so
    // this plant would quietly never flower at all.
    expect(phaseAt(viburnum, 350, LONDON).flower).toBeGreaterThan(0.7);
    expect(phaseAt(viburnum, 20, LONDON).flower).toBeGreaterThan(0.7);
    expect(phaseAt(viburnum, 60, LONDON).flower).toBeGreaterThan(0.3);
    expect(phaseAt(viburnum, 200, LONDON).flower).toBeLessThan(0.05);
  });

  it('reports a sane position within the wrapped window', () => {
    const early = phaseAt(viburnum, 310, LONDON).flowerAge;
    const late = phaseAt(viburnum, 100, LONDON).flowerAge;
    expect(early).toBeLessThan(0.15);
    expect(late).toBeGreaterThan(0.85);
  });
});

describe('flowering on bare wood', () => {
  const magnolia = getSpecies('magnolia-soulangeana');

  it('opens before there is a leaf on the plant', () => {
    const inFlower = phaseAt(magnolia, 95, LONDON);
    expect(inFlower.flower).toBeGreaterThan(0.7);
    expect(inFlower.leafCover).toBeLessThan(0.05);
    expect(magnolia.flowersOnBareWood).toBe(true);
  });

  it('is in full leaf and out of flower by midsummer', () => {
    const summer = phaseAt(magnolia, 190, LONDON);
    expect(summer.leafCover).toBeGreaterThan(0.95);
    expect(summer.flower).toBeLessThan(0.05);
  });
});

describe('fruit', () => {
  it('carries crab apples after the leaves have gone', () => {
    const malus = getSpecies('malus-evereste');
    const november = phaseAt(malus, 325, LONDON);
    expect(november.fruit).toBeGreaterThan(0.5);
    expect(november.leafCover).toBeLessThan(0.2);
  });

  it('has no fruit in spring, and none at all on a plant that sets none', () => {
    expect(phaseAt(getSpecies('malus-evereste'), 100, LONDON).fruit).toBe(0);
    expect(phaseAt(getSpecies('lavandula-hidcote'), 300, LONDON).fruit).toBe(0);
  });

  it('gives every fruiting species a colour to draw it in', () => {
    for (const s of SPECIES) {
      if (s.fruitStart !== undefined) expect(s.colors.fruit).toBeTruthy();
    }
  });
});

describe('bulbs', () => {
  const allium = getSpecies('allium-purple-sensation');

  it('flowers in May with its foliage already going over', () => {
    const may = phaseAt(allium, 145, LONDON);
    expect(may.flower).toBeGreaterThan(0.6);
    expect(may.dormant).toBe(false);
  });

  it('holds seedheads through midsummer', () => {
    expect(phaseAt(allium, 200, LONDON).seedhead).toBeGreaterThan(0.8);
  });

  it('goes dormant in high summer rather than in winter', () => {
    // The opposite way round from every other herbaceous plant here.
    expect(phaseAt(allium, 300, LONDON).dormant).toBe(true);
    expect(phaseAt(allium, 20, LONDON).dormant).toBe(true);
  });

  it('does not leave seedheads standing into the new year', () => {
    // Its standing window sits inside one year, unlike a grass.
    expect(allium.standing!.to).toBeGreaterThan(allium.standing!.from);
    expect(phaseAt(allium, 10, LONDON).seedhead).toBe(0);
  });
});

describe('annuals', () => {
  const cosmos = getSpecies('cosmos-bipinnatus');

  it('is the same size in twenty years as it is today', () => {
    // It is a different plant each year, so the age slider must not grow it.
    const now = sizeAt(cosmos, 0).height;
    const later = sizeAt(cosmos, 20).height;
    expect(later - now).toBeLessThan(0.25);
  });

  it('is absent for most of the year and flowering by late summer', () => {
    expect(phaseAt(cosmos, 60, LONDON).dormant).toBe(true);
    expect(phaseAt(cosmos, 340, LONDON).dormant).toBe(true);
    expect(phaseAt(cosmos, 240, LONDON).flower).toBeGreaterThan(0.6);
  });
});

describe('evergreens with standing structure', () => {
  const stipa = getSpecies('stipa-gigantea');

  it('keeps its foliage all year and its oats through winter', () => {
    // Evergreen and seed-bearing at once — the two are not exclusive.
    const january = phaseAt(stipa, 15, LONDON);
    expect(january.leafCover).toBe(1);
    expect(january.seedhead).toBeGreaterThan(0.5);
    expect(january.dormant).toBe(false);
  });

  it('has been cut back by March', () => {
    expect(phaseAt(stipa, 90, LONDON).seedhead).toBeLessThan(0.05);
  });
});

describe('the palette as a whole', () => {
  it('has thirty plants with unique ids', () => {
    expect(SPECIES).toHaveLength(30);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(30);
  });

  it('names every plant in English and in Latin, with a source', () => {
    for (const s of SPECIES) {
      expect(s.common.length).toBeGreaterThan(2);
      expect(s.latin.length).toBeGreaterThan(2);
      expect(s.source).toMatch(/^https:\/\/www\.rhs\.org\.uk\//);
    }
  });

  it('keeps every phenology anchor inside the year', () => {
    for (const s of SPECIES) {
      for (const day of [s.budBurst, s.fullLeaf, s.autumnStart, s.leafFall, s.flowerStart, s.flowerEnd]) {
        expect(day).toBeGreaterThanOrEqual(0);
        expect(day).toBeLessThanOrEqual(365);
      }
    }
  });

  it('never leaves a woody plant looking dormant', () => {
    // Only herbaceous things disappear; a bare shrub is still a shrub.
    for (const s of SPECIES) {
      if (s.foliage === 'herbaceous') continue;
      for (let doy = 1; doy <= 365; doy += 7) {
        expect(phaseAt(s, doy, LONDON).dormant).toBe(false);
      }
    }
  });

  it('gives every plant something to look at for a decent share of the year', () => {
    // A guard against typo'd anchors, not a design rule. The bar sits below a
    // half-year because an honest herbaceous perennial is genuinely absent for
    // that long — the hosta is above ground only from May to October — while a
    // bulb or an annual is legitimately absent for longer still.
    for (const s of SPECIES) {
      let visible = 0;
      for (let doy = 1; doy <= 365; doy += 5) {
        if (!phaseAt(s, doy, LONDON).dormant) visible++;
      }
      const fraction = visible / 73;
      expect(fraction, `${s.common} is visible only ${Math.round(fraction * 100)}% of the year`)
        .toBeGreaterThan(s.lifecycle ? 0.25 : 0.45);
    }
  });
});
