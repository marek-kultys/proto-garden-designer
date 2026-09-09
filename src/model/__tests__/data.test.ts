import { describe, expect, it } from 'vitest';
import { SPECIES, hardinessRating } from '../plants';

/**
 * A sweep over every entry in the palette, checking the things that are easy to
 * get wrong by hand and impossible to see afterwards.
 *
 * The plant data is two hundred and seventy hand-authored records of around
 * thirty fields each, and TypeScript only guarantees that a number is a number.
 * A day-of-year of 400, a mature size smaller than the planted size, or a leaf
 * fall before bud burst all typecheck perfectly and then produce a plant that
 * quietly never appears, or appears wrong in a way nobody traces back to the
 * data. These are the assertions that catch that.
 */

describe('every entry in the palette', () => {
  it('has sane dimensions', () => {
    for (const s of SPECIES) {
      expect(s.plantedHeight, `${s.common} planted height`).toBeGreaterThan(0);
      expect(s.matureHeight, `${s.common} shrinks`).toBeGreaterThanOrEqual(s.plantedHeight);
      expect(s.matureSpread, `${s.common} narrows`).toBeGreaterThanOrEqual(s.plantedSpread);
      expect(s.yearsToMature, `${s.common} years`).toBeGreaterThan(0);
    }
  });
  it('has day-of-year anchors inside the year', () => {
    for (const s of SPECIES) {
      for (const [k, v] of Object.entries({
        budBurst: s.budBurst, fullLeaf: s.fullLeaf, autumnStart: s.autumnStart,
        leafFall: s.leafFall, flowerStart: s.flowerStart, flowerEnd: s.flowerEnd,
      })) {
        expect(v, `${s.common} ${k} = ${v}`).toBeGreaterThanOrEqual(0);
        expect(v, `${s.common} ${k} = ${v}`).toBeLessThanOrEqual(366);
      }
      if (s.fruitStart !== undefined) {
        expect(s.fruitStart, `${s.common} fruitStart`).toBeGreaterThanOrEqual(0);
        expect(s.fruitEnd!, `${s.common} fruitEnd`).toBeLessThanOrEqual(366);
      }
      if (s.standing) {
        expect(s.standing.from, `${s.common} standing.from`).toBeLessThanOrEqual(366);
        expect(s.standing.to, `${s.common} standing.to`).toBeLessThanOrEqual(366);
      }
    }
  });
  it('leafs out before it drops, within the year', () => {
    for (const s of SPECIES) {
      expect(s.fullLeaf, `${s.common} full leaf before bud burst`).toBeGreaterThan(s.budBurst);
      expect(s.leafFall, `${s.common} leaf fall before autumn`).toBeGreaterThan(s.autumnStart);
    }
  });
  it('links every plant to a source', () => {
    for (const s of SPECIES) {
      expect(s.source, s.common).toMatch(/^https:\/\/www\.rhs\.org\.uk\//);
      expect(s.notes.length, `${s.common} has no notes`).toBeGreaterThan(40);
      expect(s.latin.length, s.common).toBeGreaterThan(3);
      expect(s.genus.length, s.common).toBeGreaterThan(2);
      expect(s.family, s.common).toMatch(/aceae$/);
    }
  });
});

/**
 * "Will it survive my winter" is a threshold question. The filter that asks it
 * compares ratings as numbers, so the parse has to be right for every record —
 * and has to fail closed, since a plant wrongly promised as hardy is the one
 * mistake here that kills something.
 */
describe('hardiness as a number', () => {
  it('reads every rating in the library', () => {
    for (const s of SPECIES) {
      const n = hardinessRating(s);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(7);
      expect(`H${n}`).toBe(s.hardiness);
    }
  });

  it('orders the ratings, so a threshold can include everything hardier', () => {
    const atLeast = (n: number) => SPECIES.filter((s) => hardinessRating(s) >= n).length;
    // Each step down the scale can only ever widen the list.
    expect(atLeast(7)).toBeLessThanOrEqual(atLeast(6));
    expect(atLeast(6)).toBeLessThanOrEqual(atLeast(5));
    expect(atLeast(5)).toBeLessThanOrEqual(atLeast(4));
    expect(atLeast(1)).toBe(SPECIES.length);
    // And asking for H5 must not hide the plants that are hardier still.
    const h5 = SPECIES.filter((s) => hardinessRating(s) >= 5);
    expect(h5.some((s) => s.hardiness === 'H7')).toBe(true);
  });

  it('fails closed on a rating it cannot read', () => {
    const damaged = { ...SPECIES[0], hardiness: 'quite tough' };
    expect(hardinessRating(damaged)).toBe(0);
    // Zero is below every threshold, so it drops out rather than being promised.
    expect(hardinessRating(damaged) >= 4).toBe(false);
  });
});
