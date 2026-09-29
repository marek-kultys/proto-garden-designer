import type { Species } from '../types';
import { SPECIES, TYPE_LABELS } from './index';
import { plantGap } from './gaps';
import { STYLE_LABELS, styleGroups, type PlantingStyle } from './styles';

/**
 * `PLANTS.md`, written from the library rather than by hand.
 *
 * The checklist is how a plant gets named in one word — "change 268" — so its
 * numbers, names and counts have to agree with the app. They used to be typed,
 * and they drifted after almost every batch: the file that told Mela what was
 * in the app was the one thing nothing checked.
 *
 * Only the parts that can be derived are generated, and they are fenced with
 * `<!-- generated: … -->` … `<!-- /generated -->`. Everything outside the
 * fences — what the marks mean, what is still to build, what is worth fixing —
 * is written by hand and is never touched here. That is the whole point of the
 * fences: a document half-written by a person and half by a program needs a
 * visible line between the halves, or the person's half gets overwritten.
 *
 * The result is idempotent: running it over an up-to-date document returns that
 * document unchanged, which is exactly what the test asserts. So "is the
 * checklist current?" and "does the generator still work?" are the same
 * question, asked once.
 */

const BEGIN = (name: string) => `<!-- generated: ${name} -->`;
const END = '<!-- /generated -->';

/** Plant numbers are positions in the library, three digits, and never move. */
const pad = (n: number) => String(n).padStart(3, '0');

const numbers = new Map(SPECIES.map((s, i) => [s.id, i + 1]));

function numberOf(id: string): number {
  const n = numbers.get(id);
  if (n === undefined) throw new Error(`PLANTS.md: '${id}' is not a plant in the library`);
  return n;
}

/**
 * Alphabetical by botanical name, and by number where two entries share one.
 *
 * Beech and beech hedge are the same species in two forms, so the tie has to
 * break on something stable; the number is the only thing that cannot change.
 */
function byLatinThenNumber(a: Species, b: Species): number {
  const latin = a.latin.localeCompare(b.latin, 'en');
  return latin !== 0 ? latin : numberOf(a.id) - numberOf(b.id);
}

function entryLine(s: Species): string {
  const gap = plantGap(s.id);
  const mark = gap === null ? '**FULL**' : '**PARTIAL**';
  const line = `- [x] \`${pad(numberOf(s.id))}\` *${s.latin}* — ${s.common} · ${mark}`;
  return gap === null ? line : `${line}\n      - ${gap}`;
}

/** One plain line per plant, for the lists that carry no FULL/PARTIAL mark. */
function plainLine(s: Species): string {
  return `- \`${pad(numberOf(s.id))}\` *${s.latin}* — ${s.common}`;
}

/** The whole "In the app now" section: its count, the split, and a list per type. */
function inAppNow(): string {
  const partial = SPECIES.filter((s) => plantGap(s.id) !== null).length;
  const out: string[] = [
    `## In the app now — ${SPECIES.length} plants`,
    '',
    `${SPECIES.length - partial} full, ${partial} partial.`,
  ];
  for (const type of Object.keys(TYPE_LABELS) as Species['type'][]) {
    const of = SPECIES.filter((s) => s.type === type).sort(byLatinThenNumber);
    if (of.length === 0) continue;
    out.push('', `### ${TYPE_LABELS[type]} (${of.length})`, '');
    for (const s of of) out.push(entryLine(s));
  }
  return out.join('\n');
}

function styleList(ids: readonly string[]): string {
  return ids.map((id) => plainLine(SPECIES[numberOf(id) - 1])).join('\n');
}

function replaceBlock(doc: string, name: string, body: string): string {
  const open = BEGIN(name);
  const from = doc.indexOf(open);
  if (from === -1) throw new Error(`PLANTS.md has lost its '${open}' marker`);
  const start = from + open.length;
  const to = doc.indexOf(END, start);
  if (to === -1) throw new Error(`PLANTS.md has no '${END}' after '${open}'`);
  return `${doc.slice(0, start)}\n${body}\n${doc.slice(to)}`;
}

function replaceOnce(doc: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(doc)) throw new Error(`PLANTS.md no longer says ${what}`);
  return doc.replace(pattern, replacement);
}

/**
 * The document as it should be, given the library and the hand-written parts of
 * the document it is handed.
 */
export function renderPlantsDoc(existing: string): string {
  const style: PlantingStyle = 'mediterranean';
  const groups = styleGroups(style);
  const held = groups.asked.length + groups.staples.length;

  let doc = replaceBlock(existing, 'plants', inAppNow());
  doc = replaceBlock(doc, 'style-heading', `## The ${STYLE_LABELS[style]} button — ${held} plants`);
  doc = replaceBlock(doc, 'style-asked', styleList(groups.asked));
  doc = replaceBlock(doc, 'style-staples', styleList(groups.staples));
  // The numbering rule in the preamble names the last number in the library.
  return replaceOnce(
    doc,
    /`001`–`\d{3}`/,
    `\`001\`–\`${pad(SPECIES.length)}\``,
    'which numbers are plants in the app',
  );
}
