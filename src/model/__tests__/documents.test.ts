import { describe, expect, it } from 'vitest';
import { SPECIES, TYPE_LABELS, styleMembers } from '../plants';
import type { Species } from '../types';
import readme from '../../../README.md?raw';
import product from '../../../PRODUCT.md?raw';
import plantsList from '../../../PLANTS.md?raw';

/**
 * Every count the documents state about the library, checked against the library.
 *
 * The counts went stale after almost every batch of plants — about twenty-five of
 * them across three files, all edited by hand, and a missed one ("six axes",
 * "a hundred and fifteen of those") read as true until someone noticed. Now a
 * stale count fails `npm run verify`, and the failure names the file and the
 * exact wording it should have.
 *
 * Only statements about the library as it stands are checked. History is left
 * alone on purpose: "the palette began at ten plants", "grew to a hundred and
 * fifty-five as testing demanded" and the like stay true however large the
 * library grows.
 *
 * Rewording one of these sentences will fail this test too. That is the point:
 * change the wording here in the same edit, so a count never goes back to being
 * something nobody checks.
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
const ofType = (type: Species['type']) => SPECIES.filter((s) => s.type === type).length;
const shapes = new Set(SPECIES.map((s) => s.habit)).size;
const mediterranean = styleMembers('mediterranean').length;
const clipped = SPECIES.filter((s) => s.clipped).length;
const TYPES = Object.keys(TYPE_LABELS) as Species['type'][];

/** [document, its text, the wording it must contain] */
const CLAIMS: [string, string, string][] = [
  // The size of the library.
  ['README.md', readme, `${capital(words(total))} plants, each researched`],
  ['README.md', readme, `narrows ${words(total)} plants to the few dozen`],
  ['PRODUCT.md', product, `then ${words(total)}, plus a phone layout`],
  ['PRODUCT.md', product, `${capital(words(total))} plants, searchable`],
  ['PRODUCT.md', product, `${capital(words(total))} plants, chosen to span`],
  ['PRODUCT.md', product, `**Is ${words(total)} plants the right size?**`],
  ['PLANTS.md', plantsList, `## In the app now — ${total} plants`],
  ['PLANTS.md', plantsList, `\`001\`–\`${String(total).padStart(3, '0')}\` are plants in the app`],

  // How many of each type, in the table and in the checklist's headings.
  ...TYPES.flatMap((type): [string, string, string][] => [
    ['PRODUCT.md', product, `| ${TYPE_LABELS[type]} | ${ofType(type)} |`],
    ['PLANTS.md', plantsList, `### ${TYPE_LABELS[type]} (${ofType(type)})`],
  ]),

  // The shapes the app can draw.
  ['README.md', readme, `**${capital(words(shapes))} plant shapes, not one.**`],
  ['PRODUCT.md', product, `${capital(words(shapes))} plant forms, because`],
  ['PRODUCT.md', product, `does not have — ${words(shapes)} plant forms`],
  ['PLANTS.md', plantsList, `The app can draw ${words(shapes)} plant forms`],

  // The Mediterranean button.
  ['PRODUCT.md', product, `It holds ${words(mediterranean)} plants`],
  ['PLANTS.md', plantsList, `## The Mediterranean button — ${mediterranean} plants`],

  // What the expansion has added up to so far.
  ['PRODUCT.md', product, `went from four to ${words(clipped)},`],
  ['PRODUCT.md', product, `conifers from two to ${words(ofType('conifer'))},`],
  ['PRODUCT.md', product, `ferns from two to\n${words(ofType('fern'))},`],
  ['PRODUCT.md', product, `climbers from ten to ${words(ofType('climber'))},`],
];

describe('counts in the documents', () => {
  it.each(CLAIMS)('%s says: %s', (file, text, wording) => {
    // The whole wording goes in the message, so a failure says what to write.
    expect(text.includes(wording), `${file} should contain: ${wording}`).toBe(true);
  });

  it('splits the checklist into full and partial plants that add up to the library', () => {
    const m = plantsList.match(/^(\d+) full, (\d+) partial\.$/m);
    expect(m, 'PLANTS.md should state "<n> full, <n> partial."').not.toBeNull();
    if (m === null) return;
    expect(Number(m[1]) + Number(m[2])).toBe(total);
  });

  it('writes numbers the way the documents do', () => {
    expect(words(295)).toBe('two hundred and ninety-five');
    expect(words(155)).toBe('a hundred and fifty-five');
    expect(words(42)).toBe('forty-two');
    expect(words(16)).toBe('sixteen');
    expect(words(300)).toBe('three hundred');
  });
});
