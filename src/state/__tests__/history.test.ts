import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../store';
import { rectanglePlot } from '../../model/geometry';

/**
 * Undo is the one feature where a subtle bug is silently destructive: a history
 * that drops an entry, or coalesces two things it should not, loses work that
 * the user believed was recoverable. So these test the behaviour a person would
 * notice rather than the shape of the stack.
 */

const state = () => useStore.getState();

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
  vi.useRealTimers();
});

describe('undoing planting', () => {
  it('takes back a plant that was just added', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    expect(state().plants).toHaveLength(1);

    state().undo();
    expect(state().plants).toHaveLength(0);

    state().redo();
    expect(state().plants).toHaveLength(1);
    expect(state().plants[0].speciesId).toBe('hosta-halcyon');
  });

  it('brings back everything after Clear planting', () => {
    // The destructive one, and the reason any of this exists.
    for (const id of ['hosta-halcyon', 'lavandula-hidcote', 'betula-jacquemontii']) {
      state().addPlant(id, { x: 3, y: 3 });
    }
    const before = state().plants;
    state().clearPlants();
    expect(state().plants).toHaveLength(0);

    state().undo();
    expect(state().plants).toEqual(before);
  });

  it('restores a removed plant with its identity intact', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const original = state().plants[0];
    state().removePlant(original.id);
    expect(state().plants).toHaveLength(0);

    state().undo();
    // Not merely a plant of the same species: the same individual, with the
    // seed its drawn form is cached against.
    expect(state().plants[0]).toEqual(original);
  });

  it('undoes a duplicate without touching the original', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const original = state().plants[0];
    state().duplicatePlant(original.id);
    expect(state().plants).toHaveLength(2);

    state().undo();
    expect(state().plants).toEqual([original]);
  });
});

describe('undoing a drag', () => {
  it('folds a whole drag into one step', () => {
    state().addPlant('hosta-halcyon', { x: 3, y: 3 });
    const start = { ...state().plants[0] };

    // What a pointer drag actually produces: many updates in quick succession.
    for (let i = 1; i <= 25; i++) {
      state().movePlant(start.id, { x: 3 + i * 0.1, y: 3 });
    }
    expect(state().plants[0].x).toBeCloseTo(5.5, 5);

    state().undo();
    expect(state().plants[0].x).toBeCloseTo(start.x, 5);
  });

  it('keeps two separate drags separate', () => {
    state().addPlant('hosta-halcyon', { x: 1, y: 1 });
    state().addPlant('lavandula-hidcote', { x: 2, y: 2 });
    const [a, b] = state().plants;

    state().movePlant(a.id, { x: 5, y: 5 });
    state().movePlant(b.id, { x: 6, y: 6 });

    state().undo();
    expect(state().plants[1].x).toBeCloseTo(2, 5);
    expect(state().plants[0].x).toBeCloseTo(5, 5);

    state().undo();
    expect(state().plants[0].x).toBeCloseTo(1, 5);
  });

  it('does not merge two drags of the same plant separated by a pause', () => {
    vi.useFakeTimers();
    state().addPlant('hosta-halcyon', { x: 1, y: 1 });
    state().movePlant(state().plants[0].id, { x: 4, y: 1 });

    vi.advanceTimersByTime(5000);
    state().movePlant(state().plants[0].id, { x: 9, y: 1 });

    state().undo();
    expect(state().plants[0].x).toBeCloseTo(4, 5);
  });
});

describe('the history stack', () => {
  it('does nothing when there is nothing to undo', () => {
    expect(() => state().undo()).not.toThrow();
    expect(() => state().redo()).not.toThrow();
    expect(state().plants).toEqual([]);
  });

  it('walks back through several edits in order', () => {
    state().addPlant('hosta-halcyon', { x: 1, y: 1 });
    state().addPlant('lavandula-hidcote', { x: 2, y: 2 });
    state().addPlant('betula-jacquemontii', { x: 3, y: 3 });

    state().undo();
    state().undo();
    expect(state().plants.map((p) => p.speciesId)).toEqual(['hosta-halcyon']);

    state().redo();
    expect(state().plants.map((p) => p.speciesId)).toEqual([
      'hosta-halcyon',
      'lavandula-hidcote',
    ]);
  });

  it('abandons the redo branch once you edit again', () => {
    state().addPlant('hosta-halcyon', { x: 1, y: 1 });
    state().addPlant('lavandula-hidcote', { x: 2, y: 2 });
    state().undo();
    expect(state().future).toHaveLength(1);

    state().addPlant('betula-jacquemontii', { x: 3, y: 3 });
    expect(state().future).toHaveLength(0);
    expect(state().plants.map((p) => p.speciesId)).toEqual([
      'hosta-halcyon',
      'betula-jacquemontii',
    ]);
  });

  it('never leaves a selection pointing at a plant that is gone', () => {
    state().addPlant('hosta-halcyon', { x: 1, y: 1 });
    expect(state().selectedId).toBe(state().plants[0].id);

    state().undo();
    expect(state().selectedId).toBeNull();
  });

  it('labels each entry so the button can say what it will undo', () => {
    const lastLabel = () => state().past[state().past.length - 1]?.label;
    state().addPlant('hosta-halcyon', { x: 1, y: 1 });
    expect(lastLabel()).toBe('Add plant');
    state().clearPlants();
    expect(lastLabel()).toBe('Clear planting');
  });

  it('does not grow without limit', () => {
    for (let i = 0; i < 200; i++) state().addPlant('hosta-halcyon', { x: i, y: 0 });
    expect(state().past.length).toBeLessThanOrEqual(80);
    // The oldest edits fall off the bottom; the recent ones still work.
    state().undo();
    expect(state().plants).toHaveLength(199);
  });
});

describe('what undo covers', () => {
  it('covers the plot outline as well as the planting', () => {
    const original = state().plot;
    state().resetPlot(20, 8);
    expect(state().plot).not.toEqual(original);

    state().undo();
    expect(state().plot).toEqual(original);
  });

  it('leaves the time sliders and the camera alone', () => {
    // Not edits, trivially reversible by hand, and including them would bury
    // real changes under a scrub of the season slider.
    state().addPlant('hosta-halcyon', { x: 1, y: 1 });
    const historyDepth = state().past.length;

    state().setTime({ doy: 300, hour: 8, year: 12 });
    state().setStageView('panorama');
    state().turnObserver(90);
    state().moveObserver({ x: 2, y: 2 });
    state().setHeading(45);

    expect(state().past).toHaveLength(historyDepth);

    state().undo();
    // Undo reached past all of it to the planting, and left the view as it was.
    expect(state().plants).toHaveLength(0);
    expect(state().time.doy).toBe(300);
    expect(state().stageView).toBe('panorama');
    expect(state().observer.heading).toBe(45);
  });
});

describe('keeping the viewpoint reachable', () => {
  /**
   * The trap this closes: drag the eye off the plan and it disappears under the
   * view below, where there is nothing left to take hold of. The 360° view then
   * stays wherever it was abandoned, with no way back.
   */
  it('will not let the eye be dragged off the plan', () => {
    useStore.setState({ plot: rectanglePlot(14, 10) });

    state().moveObserver({ x: 500, y: 500 });
    const far = state().observer;
    expect(far.x).toBeLessThan(20);
    expect(far.y).toBeLessThan(20);

    state().moveObserver({ x: -500, y: -500 });
    const near = state().observer;
    expect(near.x).toBeGreaterThan(-10);
    expect(near.y).toBeGreaterThan(-10);
  });

  it('still lets you stand a little outside the garden, looking in', () => {
    useStore.setState({ plot: rectanglePlot(14, 10) });
    state().moveObserver({ x: 7, y: 11 });
    // Just beyond the near edge is a real place to stand — from the house.
    expect(state().observer.y).toBeGreaterThan(10);
  });

  it('centres the eye on demand, wherever it had got to', () => {
    useStore.setState({ plot: rectanglePlot(14, 10) });
    state().moveObserver({ x: 500, y: 500 });

    state().centreObserver();

    expect(state().observer.x).toBeCloseTo(7);
    expect(state().observer.y).toBeCloseTo(5);
  });

  it('centres on the plot actually drawn, not a remembered one', () => {
    useStore.setState({ plot: rectanglePlot(30, 8) });
    state().centreObserver();
    expect(state().observer.x).toBeCloseTo(15);
    expect(state().observer.y).toBeCloseTo(4);
  });

  it('leaves the direction you are facing alone', () => {
    useStore.setState({ plot: rectanglePlot(14, 10) });
    state().setHeading(215);
    state().centreObserver();
    expect(state().observer.heading).toBeCloseTo(215);
  });
});
