import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';
import { pointInPolygon, rectanglePlot } from '../../model/geometry';
import { ovalOutline } from '../../model/oval';
import type { Structure } from '../../model/types';

/**
 * Building another wall or bed the same, beside the one selected.
 *
 * The lesson from duplicating a plant applies here with more force: a copy
 * placed by arithmetic that never asked where the plot was lands outside it,
 * and a bed outside the outline is drawn on ground that is not the garden. A
 * bed is also metres across rather than centimetres, so there is far less room
 * to be careless with.
 */

const state = () => useStore.getState();

const BED: Structure = {
  id: 'b1',
  kind: 'bed',
  points: [
    { x: 2, y: 2 },
    { x: 5, y: 2 },
    { x: 5, y: 4 },
    { x: 2, y: 4 },
  ],
  height: 0.4,
  thickness: 0.22,
  seed: 11,
};

const allOnThePlot = (s: Structure) => s.points.every((p) => pointInPolygon(p, state().plot));

beforeEach(() => {
  useStore.setState({
    structures: [],
    plants: [],
    plot: rectanglePlot(14, 10),
    selectedStructureId: null,
    selectedId: null,
    past: [],
    future: [],
    lastPushKey: null,
    lastPushAt: 0,
  });
});

describe('another one the same', () => {
  it('copies the height, the kind and the thickness', () => {
    useStore.setState({ structures: [{ ...BED, height: 0.9 }] });
    state().duplicateStructure('b1');

    const [, copy] = state().structures;
    expect(copy.kind).toBe('bed');
    expect(copy.height).toBeCloseTo(0.9, 6);
    expect(copy.thickness).toBeCloseTo(BED.thickness, 6);
    expect(copy.points).toHaveLength(BED.points.length);
  });

  it('is a second built thing, not the same one drawn twice', () => {
    useStore.setState({ structures: [BED] });
    state().duplicateStructure('b1');

    const [source, copy] = state().structures;
    expect(copy.id).not.toBe(source.id);
    expect(copy.seed).not.toBe(source.seed);
  });

  it('keeps an oval an oval', () => {
    const oval: Structure = {
      ...BED,
      shape: 'oval',
      points: ovalOutline({ x: 2, y: 2 }, { x: 6, y: 5 }),
    };
    useStore.setState({ structures: [oval] });
    state().duplicateStructure('b1');

    expect(state().structures[1].shape).toBe('oval');
  });

  it('arrives selected, ready to drag', () => {
    useStore.setState({ structures: [BED] });
    state().duplicateStructure('b1');

    expect(state().selectedStructureId).toBe(state().structures[1].id);
  });

  it('is one step of undo', () => {
    useStore.setState({ structures: [BED] });
    state().duplicateStructure('b1');
    expect(state().structures).toHaveLength(2);

    state().undo();
    expect(state().structures).toHaveLength(1);
  });
});

describe('where the copy lands', () => {
  it('sits clear of the original rather than on top of it', () => {
    // Two beds a few centimetres apart read as one lumpy bed.
    useStore.setState({ structures: [BED] });
    state().duplicateStructure('b1');

    const [source, copy] = state().structures;
    const left = (s: Structure) => Math.min(...s.points.map((p) => p.x));
    const right = (s: Structure) => Math.max(...s.points.map((p) => p.x));
    const apart = left(copy) >= right(source) || left(source) >= right(copy);
    expect(apart).toBe(true);
  });

  const corners: Array<[string, number, number]> = [
    ['in the middle of the plot', 2, 2],
    ['against the right edge', 8.9, 2],
    ['against the bottom edge', 2, 5.9],
    ['in the bottom right corner', 8.9, 5.9],
  ];

  it.each(corners)('stays on the plot when the original is %s', (_where, x, y) => {
    const moved: Structure = {
      ...BED,
      points: BED.points.map((p) => ({ x: p.x + x - 2, y: p.y + y - 2 })),
    };
    useStore.setState({ structures: [moved] });
    expect(allOnThePlot(moved)).toBe(true);

    state().duplicateStructure('b1');

    expect(allOnThePlot(state().structures[1])).toBe(true);
  });

  it('still makes a copy when the bed nearly fills the plot', () => {
    // Nowhere fits. The person asked for another one and can drag it.
    useStore.setState({
      structures: [
        {
          ...BED,
          points: [
            { x: 0.2, y: 0.2 },
            { x: 13.8, y: 0.2 },
            { x: 13.8, y: 9.8 },
            { x: 0.2, y: 9.8 },
          ],
        },
      ],
    });

    state().duplicateStructure('b1');

    expect(state().structures).toHaveLength(2);
    const [source, copy] = state().structures;
    expect(copy.points[0]).not.toEqual(source.points[0]);
  });
});
