import { describe, expect, it } from 'vitest';
import { SPECIES, getSpecies } from '../plants';
import type { Habit, PlantType, SoilPh, SoilType, SunPref } from '../types';

/**
 * Growing conditions are the part of the plant data a gardener can check at a
 * glance and disbelieve instantly, so these assert the horticulture rather than
 * the plumbing: that the lime-haters really are excluded from chalk, that the
 * plants which rot in wet ground are not offered for a waterlogged corner, and
 * that no filter in the library is a dead end.
 */

const ALL_SUN: SunPref[] = ['full', 'dappled', 'partial', 'shade'];
const ALL_PH: SoilPh[] = ['acidic', 'neutral', 'alkaline'];
const ALL_TYPE: SoilType[] = ['clay', 'loam', 'sand', 'chalk'];
const ALL_TYPES: PlantType[] = [
  'tree',
  'shrub',
  'conifer',
  'climber',
  'grass',
  'fern',
  'perennial',
  'bulb',
  'annual',
];
const ALL_HABITS: Habit[] = [
  'round',
  'multistem',
  'columnar',
  'mound',
  'tussock',
  'clump',
  'airy',
  'globe',
  'spire',
  'fern',
  'treefern',
  'climber',
];

describe('every plant has an answer for every condition', () => {
  it('never leaves a plant with nowhere it will grow', () => {
    for (const s of SPECIES) {
      expect(s.sun.length, `${s.common} has no aspect`).toBeGreaterThan(0);
      expect(s.soilPh.length, `${s.common} has no soil pH`).toBeGreaterThan(0);
      expect(s.soilType.length, `${s.common} has no soil type`).toBeGreaterThan(0);
      expect(s.drainage.length, `${s.common} has no drainage`).toBeGreaterThan(0);
    }
  });

  it('lists conditions once each, with no duplicates', () => {
    for (const s of SPECIES) {
      expect(new Set(s.sun).size).toBe(s.sun.length);
      expect(new Set(s.soilPh).size).toBe(s.soilPh.length);
      expect(new Set(s.soilType).size).toBe(s.soilType.length);
      expect(new Set(s.drainage).size).toBe(s.drainage.length);
    }
  });
});

describe('the library filters all lead somewhere', () => {
  it('offers at least one plant for every aspect', () => {
    for (const v of ALL_SUN) {
      expect(SPECIES.filter((s) => s.sun.includes(v)).length, v).toBeGreaterThan(0);
    }
  });

  it('offers at least one plant for every soil pH and texture', () => {
    for (const v of ALL_PH) {
      expect(SPECIES.filter((s) => s.soilPh.includes(v)).length, v).toBeGreaterThan(0);
    }
    for (const v of ALL_TYPE) {
      expect(SPECIES.filter((s) => s.soilType.includes(v)).length, v).toBeGreaterThan(0);
    }
  });

  it('now answers bog, but still has nothing for a pond', () => {
    // This test used to assert that bog and pond were both empty, and said the
    // day marginals arrived would be the right moment to revisit it. Houttuynia
    // will grow in standing water at a pond margin, so the bog end of the axis
    // is no longer a dead chip. Pond still is: nothing here is a true aquatic.
    expect(SPECIES.filter((s) => s.drainage.includes('bog')).length).toBeGreaterThan(0);
    expect(SPECIES.filter((s) => s.drainage.includes('pond'))).toHaveLength(0);
    expect(SPECIES.filter((s) => s.drainage.includes('waterlogged')).length).toBeGreaterThan(3);
  });
});

describe('dappled shade is a real distinction, not a synonym', () => {
  it('is what the woodlanders actually want', () => {
    for (const id of ['helleborus-hybridus', 'hosta-halcyon', 'acer-osakazuki']) {
      expect(getSpecies(id).sun, id).toContain('dappled');
    }
  });

  it('is not offered for plants that demand open sun', () => {
    for (const id of ['lavandula-hidcote', 'echinacea-purpurea', 'stipa-gigantea']) {
      expect(getSpecies(id).sun, id).toEqual(['full']);
    }
  });

  it('describes only part of the palette, or it would say nothing', () => {
    const dappled = SPECIES.filter((s) => s.sun.includes('dappled')).length;
    expect(dappled).toBeGreaterThan(4);
    expect(dappled).toBeLessThan(SPECIES.length - 4);
  });
});

describe('lime and chalk', () => {
  it('keeps the lime-haters off chalk, on both pH and texture', () => {
    // A magnolia on shallow chalk yellows and sulks however well it is planted.
    for (const id of [
      'acer-osakazuki',
      'magnolia-soulangeana',
      'amelanchier-lamarckii',
      'sorbus-aucuparia',
      'leptospermum-scoparium',
      'eucalyptus-gunnii',
      // The witch hazel family is as lime-intolerant as the magnolias, and
      // oak-leaved hydrangea colours badly on chalk.
      'hamamelis-intermedia',
      'corylopsis-sinensis',
      'magnolia-black-tulip',
      'hydrangea-quercifolia',
      // The strictest of the lot: a rhododendron on chalk is not a plant that
      // sulks, it is a plant that dies.
      'rhododendron-yakushimanum',
    ]) {
      const s = getSpecies(id);
      expect(s.soilPh, id).not.toContain('alkaline');
      expect(s.soilType, id).not.toContain('chalk');
    }
  });

  it('keeps the two soil axes from contradicting each other', () => {
    // Chalk is alkaline. A plant offered for chalk that refuses alkaline soil
    // would be advice no gardener could act on.
    for (const s of SPECIES) {
      if (s.soilType.includes('chalk')) {
        expect(s.soilPh, `${s.common} takes chalk but not alkaline`).toContain('alkaline');
      }
    }
  });

  it('lets the chalk-lovers have their alkaline soil', () => {
    for (const id of ['lavandula-hidcote', 'helleborus-hybridus', 'taxus-baccata']) {
      expect(getSpecies(id).soilPh, id).toContain('alkaline');
    }
  });
});

describe('wet ground', () => {
  it('does not offer plants that rot in the wet for a waterlogged corner', () => {
    for (const id of [
      'lavandula-hidcote',
      'salvia-caradonna',
      'echinacea-purpurea',
      'taxus-baccata',
      'allium-purple-sensation',
    ]) {
      expect(getSpecies(id).drainage, id).toEqual(['free']);
    }
  });

  it('does offer the ones that thrive there', () => {
    for (const id of ['cornus-midwinter-fire', 'miscanthus-gracillimus', 'alchemilla-mollis']) {
      expect(getSpecies(id).drainage, id).toContain('waterlogged');
    }
  });

  it('keeps drainage consistent with soil texture', () => {
    // Anything that will take standing water must also take a heavy soil; the
    // reverse pairing describes ground that does not exist.
    for (const s of SPECIES) {
      if (s.drainage.includes('waterlogged')) {
        expect(s.soilType, `${s.common} takes waterlogging but not clay`).toContain('clay');
      }
    }
  });

  it('gives a plant that wants moisture no reason to be planted in dry sand', () => {
    const hosta = getSpecies('hosta-halcyon');
    expect(hosta.drainage).not.toContain('free');
    expect(hosta.soilType).not.toContain('sand');
  });
});

/**
 * The palette gained climbers, ferns and bulbs as first-class types, and four
 * new habits to draw them with. Each of those carries an assumption the
 * renderer makes and the data must keep, and none of them is visible in the
 * type system.
 */
describe('the new plant types keep the promises the renderer relies on', () => {
  it('draws every habit that a plant actually uses', () => {
    // A habit with no plant is dead code; a plant with a habit the drawing code
    // does not handle falls through to the generic tree and looks absurd.
    // TypeScript catches the second; nothing catches the first.
    const used = new Set(SPECIES.map((s) => s.habit));
    for (const habit of ALL_HABITS) {
      expect(used.has(habit), `no plant uses the '${habit}' habit`).toBe(true);
    }
  });

  it('gives climbers a height greater than their spread', () => {
    // `matureSpread` on a climber means the width of face it covers, not how
    // far it stands off its support — which is what lets the plan view draw a
    // shallow band instead of a five-metre disc in the middle of a border.
    for (const s of SPECIES.filter((x) => x.type === 'climber')) {
      expect(s.habit, s.common).toBe('climber');
      expect(s.matureHeight, `${s.common} is wider than it is tall`).toBeGreaterThan(s.matureSpread);
    }
  });

  it('gives ferns no flowering window at all', () => {
    // Ferns do not flower. An accidental non-zero window would put blossom on
    // a dryopteris, and `wrappedBell` returns 0 only when start equals end.
    for (const s of SPECIES.filter((x) => x.type === 'fern')) {
      expect(s.flowerStart, `${s.common} has a flowering window`).toBe(s.flowerEnd);
      expect(['fern', 'treefern']).toContain(s.habit);
    }
  });

  it('marks every bulb as one, so the age slider is described honestly', () => {
    // `lifecycle` drives the readout that explains why an allium has vanished
    // in August. A bulb in the library without it reads as simply dead.
    for (const s of SPECIES.filter((x) => x.type === 'bulb')) {
      expect(s.lifecycle, `${s.common} is filed as a bulb but not marked as one`).toBe('bulb');
      expect(s.foliage, s.common).toBe('herbaceous');
    }
  });

  it('offers at least a few plants in every type, so no tab is empty', () => {
    for (const t of ALL_TYPES) {
      expect(SPECIES.filter((s) => s.type === t).length, t).toBeGreaterThan(0);
    }
  });
});
