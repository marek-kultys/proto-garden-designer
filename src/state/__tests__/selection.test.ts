import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';
import { rectanglePlot } from '../../model/geometry';
import type { Structure } from '../../model/types';

/**
 * What is highlighted, and the one rule that spans plants and structures.
 *
 * The header and the side panel both describe "the selected thing", in the
 * singular. Two highlights at once makes that a lie — the panel would describe
 * one while the plan showed two, and an edit would land on whichever the panel
 * happened to mean. The rule was enforced only by the two lines that clear each
 * other, which nothing tested: removing either left all four hundred and ninety
 * tests green.
 */

const state = () => useStore.getState();

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

beforeEach(() => {
  useStore.setState({
    plants: [],
    structures: [WALL],
    plot: rectanglePlot(14, 10),
    selectedId: null,
    selectedStructureId: null,
    past: [],
    future: [],
    lastPushKey: null,
    lastPushAt: 0,
  });
});

describe('one selection at a time', () => {
  it('drops the selected structure when a plant is selected', () => {
    state().selectStructure(WALL.id);
    expect(state().selectedStructureId).toBe(WALL.id);

    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const plant = state().plants[0];
    state().select(plant.id);

    expect(state().selectedId).toBe(plant.id);
    expect(state().selectedStructureId).toBeNull();
  });

  it('drops the selected plant when a structure is selected', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    expect(state().selectedId).not.toBeNull();

    state().selectStructure(WALL.id);

    expect(state().selectedStructureId).toBe(WALL.id);
    expect(state().selectedId).toBeNull();
  });

  it('never holds both, whatever order they are chosen in', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const plant = state().plants[0];

    for (const step of [
      () => state().select(plant.id),
      () => state().selectStructure(WALL.id),
      () => state().select(plant.id),
      () => state().select(null),
      () => state().selectStructure(WALL.id),
      () => state().selectStructure(null),
    ]) {
      step();
      const held = [state().selectedId, state().selectedStructureId].filter((x) => x !== null);
      expect(held.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('stepping through the plants of one species', () => {
  /** Three hostas and a lavender, so the walk has something to skip. */
  function plantFour(): string[] {
    for (const id of ['hosta-halcyon', 'lavandula-hidcote', 'hosta-halcyon', 'hosta-halcyon']) {
      state().addPlant(id, { x: 3, y: 3 });
    }
    return state()
      .plants.filter((p) => p.speciesId === 'hosta-halcyon')
      .map((p) => p.id);
  }

  it('walks round the group and back to the first', () => {
    const hostas = plantFour();
    state().select(null);

    // Tapping the badge repeatedly is how you find the third of five hostas,
    // so it must move on each time rather than stick on the first.
    state().selectNextOfSpecies('hosta-halcyon');
    expect(state().selectedId).toBe(hostas[0]);

    state().selectNextOfSpecies('hosta-halcyon');
    expect(state().selectedId).toBe(hostas[1]);

    state().selectNextOfSpecies('hosta-halcyon');
    expect(state().selectedId).toBe(hostas[2]);

    state().selectNextOfSpecies('hosta-halcyon');
    expect(state().selectedId).toBe(hostas[0]);
  });

  it('skips the plants of other species', () => {
    const hostas = plantFour();
    for (let i = 0; i < 5; i += 1) {
      state().selectNextOfSpecies('hosta-halcyon');
      expect(hostas).toContain(state().selectedId);
    }
  });

  it('leaves the selection alone when nothing matches', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const plant = state().plants[0];
    state().select(plant.id);

    state().selectNextOfSpecies('betula-jacquemontii');

    expect(state().selectedId).toBe(plant.id);
  });
});

describe('a selection that no longer exists', () => {
  it('is dropped when its plant is removed', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const plant = state().plants[0];
    expect(state().selectedId).toBe(plant.id);

    state().removePlant(plant.id);

    expect(state().selectedId).toBeNull();
  });

  /**
   * Undo restores the selection along with everything else, and `restore`
   * drops one that names something no longer there. No action produces that
   * pair today — every remove clears its own highlight — so the guard never
   * changes the answer, and a test that merely undid a removal would pass with
   * the guard deleted. These set the inconsistent pair directly, which is the
   * only way to hold a defence to its promise.
   */
  it('never puts back a highlight round a plant that is not there', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const plant = state().plants[0];
    useStore.setState({ selectedId: 'a-plant-that-was-dug-up' });

    // The next edit snapshots that pair, and undo restores the snapshot.
    state().addPlant('lavandula-hidcote', { x: 5, y: 5 });
    state().undo();

    expect(state().plants.map((p) => p.id)).toEqual([plant.id]);
    expect(state().selectedId).toBeNull();
  });

  it('never puts back a highlight round a structure that is not there', () => {
    useStore.setState({ selectedStructureId: 'a-wall-that-came-down' });

    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    state().undo();

    expect(state().selectedStructureId).toBeNull();
  });
});
