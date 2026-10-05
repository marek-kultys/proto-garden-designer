import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';
import { pointInPolygon, rectanglePlot } from '../../model/geometry';

/**
 * Where a plant goes when you ask for another one.
 *
 * Duplicating offsets the copy down and to the right, which reads as "the next
 * one along" and is what you want nine times in ten. The tenth is a plant
 * already near the bottom or right edge: the copy went off the plot, drawn
 * outside the outline on ground that is not the garden. It was reported from
 * real use — a tree at the foot of the plot whose copy appeared below the
 * boundary — and nothing here saw it, because the offset is arithmetic that
 * never asked where the plot was.
 */

const state = () => useStore.getState();

/** A plant's own spread sets the step, so a wide tree is the demanding case. */
const WIDE = 'betula-jacquemontii';

beforeEach(() => {
  useStore.setState({
    plants: [],
    plot: rectanglePlot(14, 10),
    selectedId: null,
    past: [],
    future: [],
    lastPushKey: null,
    lastPushAt: 0,
  });
});

describe('a duplicate lands on the plot', () => {
  const from: Array<[string, number, number]> = [
    ['the middle, where there was never a problem', 7, 5],
    ['hard against the bottom edge', 7, 9.6],
    ['hard against the right edge', 13.6, 5],
    ['the bottom right corner, with two edges to avoid', 13.6, 9.6],
    ['the top left corner', 0.4, 0.4],
  ];

  it.each(from)('from %s', (_where, x, y) => {
    state().addPlant(WIDE, { x, y });
    const source = state().plants[0];

    state().duplicatePlant(source.id);

    const copy = state().plants[1];
    expect(copy).toBeDefined();
    expect(pointInPolygon({ x: copy.x, y: copy.y }, state().plot)).toBe(true);
  });

  it('still puts the copy somewhere you can see it, not on top of the original', () => {
    state().addPlant(WIDE, { x: 7, y: 9.6 });
    const source = state().plants[0];

    state().duplicatePlant(source.id);

    const copy = state().plants[1];
    expect(Math.hypot(copy.x - source.x, copy.y - source.y)).toBeGreaterThan(0.4);
  });

  it('gives up rather than refusing when no corner fits', () => {
    // A plot smaller than the step in every direction. A copy somewhere beats
    // no copy at all: the person asked for one and can drag it.
    useStore.setState({ plants: [], plot: rectanglePlot(1, 1) });
    state().addPlant(WIDE, { x: 0.5, y: 0.5 });

    state().duplicatePlant(state().plants[0].id);

    expect(state().plants).toHaveLength(2);
  });
});
