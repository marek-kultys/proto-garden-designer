import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { rectanglePlot } from '../../model/geometry';
import type { Structure } from '../../model/types';

/**
 * Loading a design that contains walls and raised beds.
 *
 * The parser already drops a damaged structure and counts it; these cover the
 * step after that — the store actually telling the person. A count that is
 * computed and then not passed on is indistinguishable, from the outside, from
 * silently losing their wall.
 */

const state = () => useStore.getState();
const keyOf = (id: string) => `garden-designer:project:${id}`;

const WALL: Structure = {
  id: 'w1',
  kind: 'wall',
  points: [
    { x: 0.5, y: 9.2 },
    { x: 13.5, y: 9.2 },
  ],
  height: 1.8,
  thickness: 0.22,
  seed: 99,
};

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    raw: map,
  };
}

function storedDesign(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'garden-designer-project',
    version: 2,
    name: 'Walled garden',
    savedAt: new Date('2026-08-30T10:00:00Z').toISOString(),
    design: {
      plot: rectanglePlot(14, 10),
      plants: [{ id: 'p1', speciesId: 'taxus-baccata', x: 5, y: 5, seed: 1 }],
      site: {
        latitude: 51.51,
        longitude: -0.13,
        altitude: 11,
        northAngle: 0,
        dst: true,
        label: 'London',
      },
      structures: [WALL],
    },
    ...overrides,
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal('window', { localStorage: store });
  useStore.setState({
    plants: [],
    structures: [],
    plot: rectanglePlot(14, 10),
    selectedId: null,
    selectedStructureId: null,
    past: [],
    future: [],
    lastPushKey: null,
    lastPushAt: 0,
    projectId: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opening a design with walls and beds', () => {
  it('restores them', () => {
    store.raw.set(keyOf('a'), JSON.stringify(storedDesign()));
    const result = state().openProject('a');

    expect(result.ok).toBe(true);
    expect(state().structures).toEqual([WALL]);
  });

  it('says so when one could not be rebuilt, rather than losing it quietly', () => {
    const damaged = storedDesign();
    // Too few points to stand up — dropped by the parser.
    damaged.design.structures = [
      WALL,
      { ...WALL, id: 'w2', points: [{ x: 1, y: 1 }] },
    ] as Structure[];
    store.raw.set(keyOf('b'), JSON.stringify(damaged));

    const result = state().openProject('b');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state().structures).toHaveLength(1);
    // The count is computed by the parser; this is the step that reports it.
    expect(result.note).not.toBeNull();
    expect(result.note).toMatch(/could not be rebuilt/);
  });

  it('reports lost plants and lost structures together', () => {
    const damaged = storedDesign();
    damaged.design.plants = [
      ...damaged.design.plants,
      { id: 'ghost', speciesId: 'not-a-plant', x: 1, y: 1, seed: 2 },
    ];
    damaged.design.structures = [{ ...WALL, points: [{ x: 1, y: 1 }] }] as Structure[];
    store.raw.set(keyOf('c'), JSON.stringify(damaged));

    const result = state().openProject('c');
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.note).toMatch(/1 plant/);
    expect(result.note).toMatch(/could not be rebuilt/);
  });

  it('opens a design saved before walls existed, with none of them', () => {
    // Built without the key rather than by deleting it, because that is exactly
    // what a version 1 file is: a shape that never had the field at all.
    const full = storedDesign({ version: 1 });
    const { structures: _omitted, ...designWithoutStructures } = full.design;
    const v1 = { ...full, design: designWithoutStructures };
    store.raw.set(keyOf('old'), JSON.stringify(v1));

    const result = state().openProject('old');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state().structures).toEqual([]);
    expect(state().plants).toHaveLength(1);
    // Nothing was lost, so nothing is claimed to have been.
    expect(result.note).toBeNull();
  });
});

describe('undo covers built work as well as planting', () => {
  it('brings a removed wall back', () => {
    store.raw.set(keyOf('a'), JSON.stringify(storedDesign()));
    state().openProject('a');
    expect(state().structures).toHaveLength(1);

    state().removeStructure(WALL.id);
    expect(state().structures).toHaveLength(0);

    state().undo();
    expect(state().structures).toHaveLength(1);
  });

  it('folds a height drag into one step rather than one per pixel', () => {
    store.raw.set(keyOf('a'), JSON.stringify(storedDesign()));
    state().openProject('a');
    const before = state().past.length;

    for (const h of [1.9, 2.0, 2.1, 2.2]) state().setStructureHeight(WALL.id, h);
    expect(state().structures[0].height).toBeCloseTo(2.2);
    expect(state().past.length).toBe(before + 1);

    state().undo();
    expect(state().structures[0].height).toBeCloseTo(1.8);
  });

  it('does not treat clearing the planting as removing the walls', () => {
    store.raw.set(keyOf('a'), JSON.stringify(storedDesign()));
    state().openProject('a');

    state().clearPlants();

    expect(state().plants).toHaveLength(0);
    // A wall is not planting; clearing the border must not demolish it.
    expect(state().structures).toHaveLength(1);
  });
});
