import { describe, expect, it } from 'vitest';
import {
  NO_FILTERS,
  activeConditions,
  countMatching,
  filterPlants,
  isNarrowed,
  matchesFilters,
  type PlantFilters,
} from '../plants/filter';
import { SPECIES, getSpecies, hardinessRating, inStyle } from '../plants';

/**
 * The rules that decide which plants a designer is shown.
 *
 * They used to live inside the library panel, where the only way to exercise
 * them was to click. That mattered: the chip counts were wrong once in a way
 * nobody could have caught except by noticing — picking Small greyed out Medium
 * and Large, so the library appeared to hold no medium plants at all.
 */

const with_ = (patch: Partial<PlantFilters>): PlantFilters => ({ ...NO_FILTERS, ...patch });

describe('narrowing the library', () => {
  it('returns everything when nothing is asked', () => {
    expect(filterPlants(NO_FILTERS)).toHaveLength(SPECIES.length);
    expect(isNarrowed(NO_FILTERS)).toBe(false);
    expect(activeConditions(NO_FILTERS)).toBe(0);
  });

  it('keeps every plant that matches and no plant that does not', () => {
    const filters = with_({ type: 'shrub', sun: 'shade', soilType: 'chalk' });
    const results = filterPlants(filters);
    for (const s of results) {
      expect(s.type, s.id).toBe('shrub');
      expect(s.sun, s.id).toContain('shade');
      expect(s.soilType, s.id).toContain('chalk');
    }
    const missed = SPECIES.filter(
      (s) => !results.includes(s) && s.type === 'shrub' && s.sun.includes('shade') && s.soilType.includes('chalk'),
    );
    expect(missed.map((s) => s.id)).toEqual([]);
    expect(results.length).toBeGreaterThan(0);
  });

  /**
   * Hardiness is a threshold, not a match: asking for H5 must include the H6
   * and H7 plants, which are hardier still. Matching exactly would hide
   * precisely the plants that are safest.
   */
  it('treats hardiness as "at least this hardy"', () => {
    const hardy = filterPlants(with_({ hardiness: 'H5' }));
    for (const s of hardy) expect(hardinessRating(s), s.id).toBeGreaterThanOrEqual(5);
    expect(hardy.some((s) => hardinessRating(s) > 5)).toBe(true);
    expect(filterPlants(with_({ hardiness: 'H7' })).length).toBeLessThan(hardy.length);
  });

  it('searches the names and the colours, not just the common name', () => {
    const byLatin = filterPlants(with_({ query: 'rosmarinus' }));
    expect(byLatin.map((s) => s.id)).toContain('salvia-rosmarinus');
    expect(filterPlants(with_({ query: 'Rosaceae' })).length).toBeGreaterThan(5);
    expect(filterPlants(with_({ query: 'no such plant' }))).toEqual([]);
    // Case and stray spaces are the user's, not the library's.
    expect(filterPlants(with_({ query: '  LAVENDER ' })).length).toBeGreaterThan(0);
  });

  it('shows only what is planted when asked', () => {
    const planted = new Set(['betula-jacquemontii', 'lavandula-hidcote']);
    const results = filterPlants(with_({ plantedOnly: true }), planted);
    expect(results.map((s) => s.id).sort()).toEqual([...planted].sort());
    // With nothing planted it is empty rather than everything.
    expect(filterPlants(with_({ plantedOnly: true }))).toEqual([]);
  });

  it('lets a style cut across the types', () => {
    const med = filterPlants(with_({ style: 'mediterranean' }));
    for (const s of med) expect(inStyle(s, 'mediterranean'), s.id).toBe(true);
    expect(new Set(med.map((s) => s.type)).size).toBeGreaterThan(1);

    const medTrees = filterPlants(with_({ style: 'mediterranean', type: 'tree' }));
    expect(medTrees.length).toBeGreaterThan(0);
    expect(medTrees.length).toBeLessThan(med.length);
  });

  it('counts a condition as active only when it is set', () => {
    expect(activeConditions(with_({ sun: 'full', size: 'small' }))).toBe(2);
    // Type, planted and style narrow the list but are not growing conditions.
    expect(activeConditions(with_({ type: 'tree', plantedOnly: true }))).toBe(0);
    expect(isNarrowed(with_({ type: 'tree' }))).toBe(true);
    expect(isNarrowed(with_({ query: '   ' }))).toBe(false);
  });

  it('agrees with itself: one plant at a time, or the whole library at once', () => {
    const filters = with_({ sun: 'full', drainage: 'free', size: 'medium' });
    const listed = new Set(filterPlants(filters).map((s) => s.id));
    for (const s of SPECIES) expect(matchesFilters(s, filters), s.id).toBe(listed.has(s.id));
  });
});

describe('the number on a chip', () => {
  it('says how many plants that chip would leave', () => {
    const shrubs = countMatching(NO_FILTERS, (s) => s.type === 'shrub');
    expect(shrubs).toBe(SPECIES.filter((s) => s.type === 'shrub').length);
  });

  /**
   * The rule that was wrong once. A chip answers "how many if I picked this
   * instead", so its own row must be left out of the count — otherwise Medium
   * is asked how many plants are medium *and* small, answers none, and dims.
   */
  it('does not count a row against itself', () => {
    const small = with_({ size: 'small' });
    expect(countMatching(small, (s) => s.sizeClass === 'medium', 'size')).toBeGreaterThan(50);
    expect(countMatching(small, (s) => s.sizeClass === 'medium')).toBe(0);
  });

  it('still counts every other row that is set', () => {
    const chalkShrubsInSun = countMatching(
      with_({ type: 'shrub', sun: 'full' }),
      (s) => s.soilType.includes('chalk'),
      'soilType',
    );
    const chalkShrubs = countMatching(
      with_({ type: 'shrub' }),
      (s) => s.soilType.includes('chalk'),
      'soilType',
    );
    // Leaving out its own row does not make a chip forget the others: adding
    // "full sun" to "shrub" can only take the number down.
    expect(chalkShrubsInSun).toBeGreaterThan(0);
    expect(chalkShrubsInSun).toBeLessThan(chalkShrubs);
    expect(chalkShrubsInSun).toBe(
      SPECIES.filter(
        (s) => s.type === 'shrub' && s.sun.includes('full') && s.soilType.includes('chalk'),
      ).length,
    );
  });

  it('ignores the search box and the planted switch', () => {
    // A chip's number describes the library, not what three typed letters left.
    const typed = with_({ query: 'salvia', plantedOnly: true });
    expect(countMatching(typed, (s) => s.type === 'tree')).toBe(
      countMatching(NO_FILTERS, (s) => s.type === 'tree'),
    );
  });

  it('respects a style, because the style is not a row of chips', () => {
    const med = with_({ style: 'mediterranean' });
    const medShrubs = countMatching(med, (s) => s.type === 'shrub');
    expect(medShrubs).toBeLessThan(countMatching(NO_FILTERS, (s) => s.type === 'shrub'));
    expect(medShrubs).toBeGreaterThan(0);
    expect(getSpecies('lavandula-hidcote').type).toBe('shrub');
  });
});
