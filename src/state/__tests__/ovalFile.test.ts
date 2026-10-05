import { describe, expect, it } from 'vitest';
import { makeProjectFile, parseProjectFile } from '../projectFile';
import { ovalOutline } from '../../model/oval';
import { rectanglePlot } from '../../model/geometry';
import type { Structure } from '../../model/types';
import type { Design } from '../projectFile';

/**
 * An oval bed has to survive being saved, and — more importantly — a design
 * saved before ovals existed has to keep opening exactly as it did.
 *
 * The promise made when the marker was added is that `points` remains the whole
 * truth: a reader that knows nothing of ovals draws one correctly as a bed with
 * forty corners. These hold both ends of that.
 */

const OVAL: Structure = {
  id: 's1',
  kind: 'bed',
  shape: 'oval',
  points: ovalOutline({ x: 2, y: 2 }, { x: 8, y: 6 }),
  height: 0.4,
  thickness: 0.22,
  seed: 7,
};

const design = (structures: Structure[]): Design => ({
  plot: rectanglePlot(14, 10),
  plants: [],
  site: {
    latitude: 51.5,
    longitude: -0.13,
    altitude: 11,
    northAngle: 0,
    dst: true,
    label: 'London',
    slopeFall: 0,
    slopeDirection: 180,
  },
  structures,
});

function roundTrip(structures: Structure[]) {
  const file = makeProjectFile('garden', design(structures), new Date('2026-06-04T12:00:00Z'));
  const parsed = parseProjectFile(JSON.parse(JSON.stringify(file)));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error('unreachable');
  return parsed;
}

describe('an oval bed in a saved file', () => {
  it('comes back an oval, with its outline intact', () => {
    const back = roundTrip([OVAL]).design.structures[0];
    expect(back.shape).toBe('oval');
    expect(back.points).toHaveLength(OVAL.points.length);
    expect(back.points[0].x).toBeCloseTo(OVAL.points[0].x, 6);
  });

  it('is still a bed in every other respect', () => {
    const back = roundTrip([OVAL]).design.structures[0];
    expect(back.kind).toBe('bed');
    expect(back.height).toBeCloseTo(0.4, 6);
  });
});

describe('what a reader that never heard of ovals sees', () => {
  it('opens one as an ordinary many-cornered bed', () => {
    // The marker stripped, exactly as an older build would ignore it.
    const file = makeProjectFile('garden', design([OVAL]), new Date());
    const raw = JSON.parse(JSON.stringify(file));
    delete raw.design.structures[0].shape;

    const parsed = parseProjectFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');

    const back = parsed.design.structures[0];
    expect(back.shape).toBeUndefined();
    expect(back.kind).toBe('bed');
    // The shape itself is unharmed, which is the whole promise.
    expect(back.points).toHaveLength(OVAL.points.length);
  });

  it('a design saved before ovals existed is untouched', () => {
    const plain: Structure = {
      id: 's2',
      kind: 'bed',
      points: [
        { x: 1, y: 1 },
        { x: 4, y: 1 },
        { x: 4, y: 3 },
      ],
      height: 0.4,
      thickness: 0.22,
      seed: 3,
    };
    const back = roundTrip([plain]).design.structures[0];
    expect(back.shape).toBeUndefined();
    expect(back.points).toHaveLength(3);
  });
});

describe('a marker that cannot be true is not believed', () => {
  it('ignores a wall claiming to be an oval', () => {
    const wall = {
      id: 's3',
      kind: 'wall' as const,
      shape: 'oval',
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
      height: 1.8,
      thickness: 0.22,
      seed: 1,
    };
    const file = makeProjectFile('garden', design([]), new Date());
    const raw = JSON.parse(JSON.stringify(file));
    raw.design.structures = [wall];

    const parsed = parseProjectFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.design.structures[0].kind).toBe('wall');
    expect(parsed.design.structures[0].shape).toBeUndefined();
  });

  it('ignores a shape it does not recognise rather than refusing the file', () => {
    const file = makeProjectFile('garden', design([OVAL]), new Date());
    const raw = JSON.parse(JSON.stringify(file));
    raw.design.structures[0].shape = 'hexagon';

    const parsed = parseProjectFile(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('unreachable');
    expect(parsed.design.structures[0].shape).toBeUndefined();
    expect(parsed.design.structures[0].points).toHaveLength(OVAL.points.length);
  });
});
