import { describe, expect, it } from 'vitest';
import { SPECIES } from '../plants';
import readme from '../../../README.md?raw';
import product from '../../../PRODUCT.md?raw';

/**
 * What the written documents may and may not say about the library.
 *
 * They used to state its size in seven places, in words, and every one of them
 * went stale after almost every batch of plants: "a hundred and fifty-five" sat
 * there reading as true long after it was not. A test then checked each
 * sentence against the library and printed the wording to retype, which stopped
 * the drift but left the retyping.
 *
 * So `README.md` and `PRODUCT.md` no longer give a number at all: how many
 * plants there are, and how many of each type, is `PLANTS.md`, which is written
 * from the library by `npm run plants:md` and checked by `plantsMd.test.ts`.
 * One statement of a fact, in the one document that cannot drift.
 *
 * What is left here are the claims that are not counts of plants — the number
 * of shapes the app can draw, which changes only when someone teaches it a new
 * one — and a guard against the numbers creeping back into the prose.
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A number the way the documents write it: "two hundred and ninety-five", "a hundred and five". */
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const head = hundreds === 1 ? 'a hundred' : `${ONES[hundreds]} hundred`;
    return n % 100 ? `${head} and ${words(n % 100)}` : head;
  }
  throw new Error(`no wording for ${n}; the documents have outgrown this helper`);
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

const total = SPECIES.length;
const shapes = new Set(SPECIES.map((s) => s.habit)).size;

/** [document, its text, the wording it must contain] */
const CLAIMS: [string, string, string][] = [
  ['README.md', readme, `**${capital(words(shapes))} plant shapes, not one.**`],
  ['PRODUCT.md', product, `${capital(words(shapes))} plant forms, because`],
  ['PRODUCT.md', product, `does not have — ${words(shapes)} plant forms`],
];

/** The written documents, as against the generated checklist. */
const PROSE: [string, string][] = [
  ['README.md', readme],
  ['PRODUCT.md', product],
];

describe('what the documents claim', () => {
  it.each(CLAIMS)('%s says: %s', (file, text, wording) => {
    // The whole wording goes in the message, so a failure says what to write.
    expect(text.includes(wording), `${file} should contain: ${wording}`).toBe(true);
  });

  it.each(PROSE)('%s does not state how many plants there are', (file, text) => {
    /*
     * Any sizeable number a few words before "plants": "295 plants", "two
     * hundred and ninety-five plants", "a hundred and fifty-five plants".
     *
     * Small numbers are left alone deliberately — "ten plants became thirty" is
     * history, and history stays true however large the library grows. What
     * cannot be written here again is the size of the library today.
     */
    const stated = text.match(/(\d{2,}|hundred)[^.\n]{0,30}\bplants\b/i);
    expect(
      stated?.[0] ?? null,
      `${file} states a plant count in prose; the count lives in PLANTS.md, which is generated`,
    ).toBeNull();
  });

  it.each(PROSE)("%s does not give today's total in any form", (file, text) => {
    expect(text.includes(words(total)), `${file} spells out ${total}`).toBe(false);
    expect(text.includes(String(total)), `${file} writes ${total} in digits`).toBe(false);
  });

  it('sends the reader to the checklist instead', () => {
    expect(readme).toContain('[PLANTS.md](PLANTS.md)');
    expect(product).toContain('`PLANTS.md`');
  });

  it('writes numbers the way the documents do', () => {
    expect(words(295)).toBe('two hundred and ninety-five');
    expect(words(155)).toBe('a hundred and fifty-five');
    expect(words(42)).toBe('forty-two');
    expect(words(16)).toBe('sixteen');
    expect(words(300)).toBe('three hundred');
  });
});
