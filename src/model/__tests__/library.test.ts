import { describe, expect, it } from 'vitest';
import { SPECIES } from '../plants';
import { PLANT_ORDER } from '../plants/order';
import orderSource from '../plants/order.ts?raw';
import { TREES } from '../plants/trees';
import { SHRUBS } from '../plants/shrubs';
import { CONIFERS } from '../plants/conifers';
import { CLIMBERS } from '../plants/climbers';
import { GRASSES } from '../plants/grasses';
import { FERNS } from '../plants/ferns';
import { PERENNIALS } from '../plants/perennials';
import { BULBS } from '../plants/bulbs';
import { ANNUALS } from '../plants/annuals';

/**
 * The library is nine files by type, stitched back into one array in the order
 * plants were added. Two ways that can go wrong quietly, and neither would fail
 * any other test: a plant can go missing on the way through, and the order can
 * drift — which would silently renumber PLANTS.md, where the numbers are
 * promised never to move.
 */

/** Which file each plant type belongs in. */
const FILES = [
  ['trees.ts', 'tree', TREES],
  ['shrubs.ts', 'shrub', SHRUBS],
  ['conifers.ts', 'conifer', CONIFERS],
  ['climbers.ts', 'climber', CLIMBERS],
  ['grasses.ts', 'grass', GRASSES],
  ['ferns.ts', 'fern', FERNS],
  ['perennials.ts', 'perennial', PERENNIALS],
  ['bulbs.ts', 'bulb', BULBS],
  ['annuals.ts', 'annual', ANNUALS],
] as const;

describe('the library, reassembled from its files', () => {
  it('loses nothing on the way through', () => {
    const fromFiles = FILES.flatMap(([, , list]) => list);
    expect(SPECIES).toHaveLength(fromFiles.length);
    expect(new Set(SPECIES.map((s) => s.id))).toEqual(new Set(fromFiles.map((s) => s.id)));
  });

  it('holds each plant in the file for its own type', () => {
    for (const [file, type, list] of FILES) {
      for (const s of list) {
        expect(`${s.id} → ${file}`).toBe(`${s.id} → ${s.type === type ? file : '?'}`);
      }
    }
  });

  /**
   * The numbering in PLANTS.md is this array's index. Reordering it renames
   * every plant after the change, which is the one thing that file promises
   * cannot happen.
   */
  it('keeps the order plants were added in', () => {
    const listed = SPECIES.filter((s) => PLANT_ORDER.includes(s.id));
    expect(listed.map((s) => s.id)).toEqual([...PLANT_ORDER]);
  });

  it('appends a plant that predates no entry in the order, rather than dropping it', () => {
    // Every plant is either named in the order or sorted after everything that
    // is — so adding one means editing a single type file and nothing else.
    const firstUnlisted = SPECIES.findIndex((s) => !PLANT_ORDER.includes(s.id));
    if (firstUnlisted !== -1) {
      expect(firstUnlisted).toBeGreaterThanOrEqual(PLANT_ORDER.length);
    }
    expect(SPECIES.length).toBeGreaterThanOrEqual(PLANT_ORDER.length);
  });

  /**
   * The numbers written into order.ts are its own line positions, spelled out so
   * a plant's number can be read rather than counted. That makes them a copy of
   * something derived, which is only safe while something checks them — so this
   * does, against the file's own text.
   */
  it('has every number in order.ts matching its position', () => {
    const numbered = [...orderSource.matchAll(/\/\* (\d{3}) \*\/ '([^']+)',/g)];
    expect(numbered).toHaveLength(PLANT_ORDER.length);
    numbered.forEach(([, number, id], i) => {
      expect(`${number} ${id}`).toBe(`${String(i + 1).padStart(3, '0')} ${PLANT_ORDER[i]}`);
    });
  });

  it('names no plant twice, in one file or across two', () => {
    const ids = SPECIES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
