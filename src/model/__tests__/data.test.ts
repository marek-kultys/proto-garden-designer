import { describe, expect, it } from 'vitest';
import { SPECIES } from '../plants';

/**
 * A sweep over every entry in the palette, checking the things that are easy to
 * get wrong by hand and impossible to see afterwards.
 *
 * The plant data is a hundred and thirty-eight hand-authored records of around
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
