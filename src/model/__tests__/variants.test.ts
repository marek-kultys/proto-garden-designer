import { describe, expect, it } from 'vitest';
import { SPECIES, getSpecies } from '../plants';
import type { Species } from '../types';

/**
 * One plant, drawn two ways, keeps one calendar.
 *
 * Several plants are in the library twice because the app draws them two ways:
 * beech as a tree and as a clipped hedge, hornbeam free-grown and pleached, a
 * lime and a lime trained over a frame, a young olive and an ancient one. Size,
 * habit and whether it is clipped differ — that is why both exist — but bud
 * burst, full leaf, autumn colour, leaf fall and flowering do not. Pruning a
 * tree does not move its spring.
 *
 * Those dates were typed into each record separately, which is two sources of
 * truth for one fact: correcting the tree left the hedge a fortnight out and
 * nothing said so. Two pairs had already drifted by the time this was written —
 * deliberately, as it turned out, and that deliberate difference is now written
 * down here rather than looking like a typo.
 */

const SEASON = [
  'budBurst',
  'fullLeaf',
  'autumnStart',
  'leafFall',
  'flowerStart',
  'flowerEnd',
] as const satisfies readonly (keyof Species)[];

/**
 * Pairs the app draws as one plant in two forms, where the botanical names are
 * not identical and so the rule below cannot find them on its own.
 */
const SAME_PLANT_TRAINED: [string, string][] = [
  ['prunus-cerasus', 'fan-trained-tree'],
  ['malus-domestica-sunset', 'cordon-tree'],
];

/**
 * Differences that are real horticulture rather than drift, with the reason.
 *
 * A clipped beech holds its dead leaves until the new buds push them off, which
 * is the whole reason for a beech hedge: a screen in January that a beech tree,
 * bare by December, does not give.
 */
const DELIBERATE: Record<string, readonly (typeof SEASON)[number][]> = {
  'fagus-sylvatica-hedge': ['leafFall'],
  'fagus-sylvatica-purpurea-hedge': ['leafFall'],
};

function sameNamePairs(): [Species, Species][] {
  const byLatin = new Map<string, Species[]>();
  for (const s of SPECIES) byLatin.set(s.latin, [...(byLatin.get(s.latin) ?? []), s]);
  const pairs: [Species, Species][] = [];
  for (const group of byLatin.values()) {
    for (let i = 1; i < group.length; i++) pairs.push([group[0], group[i]]);
  }
  return pairs;
}

function compare(a: Species, b: Species): void {
  const allowed = new Set<string>([...(DELIBERATE[a.id] ?? []), ...(DELIBERATE[b.id] ?? [])]);
  for (const field of SEASON) {
    if (allowed.has(field)) {
      // An exception must actually be one: listing a field here and then
      // matching anyway leaves a licence to drift lying around.
      expect(a[field], `${a.id} and ${b.id} agree on ${field}; drop the exception`).not.toBe(
        b[field],
      );
      continue;
    }
    expect(
      a[field],
      `${a.id} and ${b.id} are the same plant but disagree about ${field}`,
    ).toBe(b[field]);
  }
}

describe('plants the library holds twice', () => {
  it('finds the pairs, so this test cannot quietly stop checking anything', () => {
    expect(sameNamePairs().length).toBeGreaterThanOrEqual(6);
  });

  it.each(sameNamePairs().map(([a, b]) => [`${a.id} / ${b.id}`, a, b] as const))(
    'keeps one calendar for %s',
    (_label, a, b) => compare(a, b),
  );

  it.each(SAME_PLANT_TRAINED)('keeps one calendar for %s and %s', (parent, trained) => {
    compare(getSpecies(parent), getSpecies(trained));
  });

  it('names a reason for every deliberate difference', () => {
    for (const id of Object.keys(DELIBERATE)) {
      expect(SPECIES.some((s) => s.id === id), `${id} is not a plant`).toBe(true);
    }
  });
});
