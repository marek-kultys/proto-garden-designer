import { describe, expect, it } from 'vitest';
import plantsMd from '../../../PLANTS.md?raw';
import { renderPlantsDoc } from '../plants/doc';
import { PLANT_GAPS } from '../plants/gaps';
import { SPECIES_BY_ID } from '../plants';

/**
 * The checklist has to agree with the library it describes.
 *
 * `PLANTS.md` is how a plant gets named in one word — "change 268" — so a
 * number, a name or a count that has drifted is not a cosmetic fault: it points
 * at the wrong plant. The generated half of the file is written by
 * `npm run plants:md`, and this asserts the file on disk is what that would
 * write, which is the same as asking whether it is up to date.
 *
 * When this fails, run the generator. The diff below names the lines.
 */

describe('PLANTS.md', () => {
  it('is what the generator would write, line for line', () => {
    const rendered = renderPlantsDoc(plantsMd);
    // Compared line by line: a 500-line string diff is unreadable, and what is
    // wanted is "these three lines changed", not "the file changed".
    expect(plantsMd.split('\n'), 'stale — run `npm run plants:md`').toEqual(rendered.split('\n'));
  });

  it('generates the same document a second time', () => {
    // Idempotence is the property the test above relies on: if rendering were
    // to move something each pass, a green run would only mean "ran twice".
    const once = renderPlantsDoc(plantsMd);
    expect(renderPlantsDoc(once)).toEqual(once);
  });
});

describe('the gaps behind PARTIAL', () => {
  it('name only plants that are in the library', () => {
    for (const id of Object.keys(PLANT_GAPS)) {
      expect(SPECIES_BY_ID[id], `PLANT_GAPS lists '${id}', which is not a plant`).toBeDefined();
    }
  });

  it('say what is missing, in a sentence', () => {
    for (const [id, gap] of Object.entries(PLANT_GAPS)) {
      expect(gap.length, `${id}'s gap is too short to say anything`).toBeGreaterThan(40);
      expect(gap.trim(), id).toBe(gap);
    }
  });
});
