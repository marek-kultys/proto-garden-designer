import { describe, expect, it } from 'vitest';
import { PLANTING_STYLES, SPECIES, SPECIES_BY_ID, inStyle, styleMembers } from '../plants';

/**
 * Planting styles are lists of plant ids, kept by hand. The one way they fail
 * quietly is a renamed or removed plant: the id stays in the list, matches
 * nothing, and the plant simply stops appearing under its button with no error
 * anywhere. So every id is checked against the library.
 */

describe('planting styles', () => {
  it('name only plants that are in the library', () => {
    for (const style of PLANTING_STYLES) {
      for (const id of styleMembers(style)) {
        expect(SPECIES_BY_ID[id], `${style} lists '${id}', which is not a plant`).toBeDefined();
      }
    }
  });

  it('list no plant twice', () => {
    for (const style of PLANTING_STYLES) {
      const ids = styleMembers(style);
      expect(new Set(ids).size, style).toBe(ids.length);
    }
  });

  it('agree with the lookup the library filters by', () => {
    for (const style of PLANTING_STYLES) {
      const members = new Set(styleMembers(style));
      for (const s of SPECIES) expect(inStyle(s, style), `${s.id} in ${style}`).toBe(members.has(s.id));
    }
  });

  /** The plants that were asked for by name, so none is dropped by accident. */
  it('keeps every Mediterranean plant that was asked for', () => {
    const asked = [
      'ballota-pseudodictamnus',
      'brachyglottis-sunshine',
      'salvia-yangii',
      'salvia-caradonna',
      'salvia-jamensis-la-luna',
      'salvia-officinalis',
      'salvia-rosmarinus',
      'echium-pininana',
      'eremurus-cleopatra',
      'centranthus-ruber',
      'verbascum-gainsborough',
      'phlomis-amazone',
      'baptisia-australis',
      'achillea-terracotta',
      'ajuga-atropurpurea',
      'leontopodium-alpinum',
      'cistus-purpureus',
      'cistus-argenteus',
      'cistus-albidus',
    ];
    for (const id of asked) expect(styleMembers('mediterranean'), id).toContain(id);
  });

  /**
   * A Mediterranean garden is a hot, dry, sunny one, and every plant in the style
   * says so in its own growing conditions — with one exception, made on purpose.
   * Bugle wants damp shade and was put in the style anyway, as ground cover for
   * the shadier corner of a dry garden. Naming it here keeps that a decision: a
   * second plant that did not suit would fail this rather than slip in unnoticed.
   */
  it('holds only sun-loving, free-draining plants, apart from bugle', () => {
    const chosenAnyway = new Set(['ajuga-atropurpurea']);
    for (const id of styleMembers('mediterranean')) {
      const s = SPECIES_BY_ID[id];
      if (s === undefined || chosenAnyway.has(id)) continue;
      expect(s.sun, `${id} does not take full sun`).toContain('full');
      expect(s.drainage, `${id} does not take free drainage`).toContain('free');
    }
  });
});
