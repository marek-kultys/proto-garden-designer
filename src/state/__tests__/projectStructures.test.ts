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

describe('reshaping and redrawing after the fact', () => {
  const BED: Structure = {
    id: 'b1',
    kind: 'bed',
    points: [
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      { x: 6, y: 5 },
      { x: 2, y: 5 },
    ],
    height: 0.4,
    thickness: 0.1,
    seed: 7,
  };

  beforeEach(() => {
    useStore.setState({ structures: [BED], selectedStructureId: BED.id, past: [], future: [] });
  });

  it('moves one corner and leaves the others alone', () => {
    state().moveStructurePoint(BED.id, 1, { x: 9, y: 1 });

    const points = state().structures[0].points;
    expect(points[1]).toEqual({ x: 9, y: 1 });
    expect(points[0]).toEqual(BED.points[0]);
    expect(points[2]).toEqual(BED.points[2]);
    expect(points[3]).toEqual(BED.points[3]);
  });

  it('folds a corner drag into one undo step', () => {
    const before = state().past.length;
    for (const x of [6.5, 7, 7.5, 8]) state().moveStructurePoint(BED.id, 1, { x, y: 2 });
    expect(state().past.length).toBe(before + 1);

    state().undo();
    expect(state().structures[0].points[1]).toEqual(BED.points[1]);
  });

  it('keeps two different corners as two separate undo steps', () => {
    const before = state().past.length;
    state().moveStructurePoint(BED.id, 0, { x: 1, y: 1 });
    state().moveStructurePoint(BED.id, 2, { x: 7, y: 6 });
    expect(state().past.length).toBe(before + 2);
  });

  it('puts the drawing tool back in your hand when you ask to redraw', () => {
    state().redrawStructure(BED.id);
    expect(state().tool).toBe('draw-bed');
    expect(state().redrawingId).toBe(BED.id);
    // The old shape stays on the plan to line the new one up against.
    expect(state().structures[0].points).toEqual(BED.points);
  });

  it('replaces the shape rather than adding a second bed beside it', () => {
    state().redrawStructure(BED.id);
    for (const p of [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 9 },
      { x: 1, y: 9 },
    ]) {
      state().pushDraftPoint(p);
    }
    state().commitDraft();

    expect(state().structures).toHaveLength(1);
    expect(state().structures[0].points).toHaveLength(4);
    expect(state().structures[0].points[2]).toEqual({ x: 5, y: 9 });
    // Height and thickness are properties of the bed, not of its outline.
    expect(state().structures[0].height).toBe(0.4);
    expect(state().structures[0].id).toBe(BED.id);
  });

  /**
   * The property that matters most: changing your mind halfway through must
   * leave the bed exactly as it was, not delete it.
   */
  it('leaves the original alone when a redraw is abandoned', () => {
    state().redrawStructure(BED.id);
    state().pushDraftPoint({ x: 1, y: 1 });
    state().cancelDraft();

    expect(state().structures[0].points).toEqual(BED.points);
    expect(state().redrawingId).toBeNull();
    expect(state().tool).toBe('select');
  });

  it('leaves the original alone when a redraw is finished with too few corners', () => {
    state().redrawStructure(BED.id);
    state().pushDraftPoint({ x: 1, y: 1 });
    state().pushDraftPoint({ x: 4, y: 1 });
    state().commitDraft();

    expect(state().structures[0].points).toEqual(BED.points);
    expect(state().structures).toHaveLength(1);
  });

  it('undoes a redraw back to the shape it replaced', () => {
    state().redrawStructure(BED.id);
    for (const p of [
      { x: 1, y: 1 },
      { x: 5, y: 1 },
      { x: 5, y: 9 },
    ]) {
      state().pushDraftPoint(p);
    }
    state().commitDraft();
    expect(state().structures[0].points).toHaveLength(3);

    state().undo();
    expect(state().structures[0].points).toEqual(BED.points);
  });
});
