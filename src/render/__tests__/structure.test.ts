import { describe, expect, it } from 'vitest';
import { panoramaBeds, panoramaFaces, panoramaTops, sliceStructure } from '../structure';
import { segmentsOf } from '../../model/structures';
import type { Structure } from '../../model/types';

/**
 * Raised beds and walls as seen from inside the garden.
 *
 * These were rewritten once, and the reason is worth keeping. The first version
 * drew each side of a bed and hid the ones facing away, which works for a
 * rectangle and fails for the shapes people actually draw: a bed clicked out
 * freehand has a dozen corners and is usually concave, and on a concave shape
 * "facing away" is not the same as "hidden". Sides that were needed got
 * dropped, and the garden showed through the holes — the bed read as empty and
 * a plant over a gap had neither wall nor soil beneath it.
 *
 * A bed is now one solid mass, which has no inside to leak through.
 */

const OBSERVER = { x: 7, y: 10 };

function bed(height: number, points?: { x: number; y: number }[]): Structure {
  return {
    id: 'b',
    kind: 'bed',
    points: points ?? [
      { x: 3, y: 4 },
      { x: 11, y: 4 },
      { x: 11, y: 7 },
      { x: 3, y: 7 },
    ],
    height,
    thickness: 0.1,
    seed: 1,
  };
}

function wall(height: number): Structure {
  return {
    id: 'w',
    kind: 'wall',
    points: [
      { x: 1, y: 6 },
      { x: 13, y: 6 },
    ],
    height,
    thickness: 0.3,
    seed: 2,
  };
}

/** The kind of outline that comes of clicking a bed out by hand: concave. */
const FREEHAND = [
  { x: 3, y: 4 },
  { x: 11, y: 4 },
  { x: 11, y: 7 },
  { x: 8, y: 7 },
  { x: 8, y: 5.5 },
  { x: 6, y: 5.5 },
  { x: 6, y: 7 },
  { x: 3, y: 7 },
];

describe('a raised bed is drawn whole', () => {
  it('is one mass, not a set of separate sides', () => {
    const beds = panoramaBeds([bed(0.4)], OBSERVER);
    expect(beds).toHaveLength(1);
    expect(beds[0].polygon).toHaveLength(4);
  });

  it('keeps every corner of a concave, freehand outline', () => {
    const beds = panoramaBeds([bed(0.4, FREEHAND)], OBSERVER);
    expect(beds).toHaveLength(1);
    expect(beds[0].polygon).toEqual(FREEHAND);
  });

  it('is drawn whatever its height, even above eye level', () => {
    // A bed you cannot see into is still a solid thing hiding what is behind
    // it; only its soil surface stops being visible.
    expect(panoramaBeds([bed(1.2)], OBSERVER)).toHaveLength(1);
  });

  it('is nothing at all with no height or too few corners', () => {
    expect(panoramaBeds([bed(0)], OBSERVER)).toHaveLength(0);
    expect(
      panoramaBeds([bed(0.4, [{ x: 1, y: 1 }, { x: 2, y: 2 }])], OBSERVER),
    ).toHaveLength(0);
  });

  it('takes its depth from the far edge, so plants in it are drawn after', () => {
    const beds = panoramaBeds([bed(0.4)], OBSERVER);
    const corners = bed(0.4).points.map((p) => Math.hypot(p.x - OBSERVER.x, p.y - OBSERVER.y));
    expect(beds[0].distance).toBeCloseTo(Math.max(...corners));
  });

  /**
   * A bed goes through the per-side path not at all — for either shape.
   *
   * There was a pass that redrew a bed's front walls over it. On a concave
   * outline the test for "facing the viewer" also passes for segments round
   * the back, each then drawn as a full-height wall at its own distance and
   * outlined: the bed came out panelled with seams and stacked into phantom
   * tiers. It was never needed either, since a plant is drawn upward from its
   * base on the soil and cannot reach down over the wall in front of it.
   */
  it('never goes through the per-side face path, whatever its shape', () => {
    expect(panoramaFaces([bed(0.4)], OBSERVER, segmentsOf)).toHaveLength(0);
    expect(panoramaFaces([bed(0.4, FREEHAND)], OBSERVER, segmentsOf)).toHaveLength(0);
  });

  it('is a single mass for a concave outline, not one shape per side', () => {
    const beds = panoramaBeds([bed(0.4, FREEHAND)], OBSERVER);
    expect(beds).toHaveLength(1);
    expect(beds[0].polygon).toHaveLength(FREEHAND.length);
  });

  it('no longer takes a separate top surface', () => {
    expect(panoramaTops([bed(0.4)], OBSERVER, 1.6)).toHaveLength(0);
  });
});

describe('two beds that overlap', () => {
  const tall = { ...bed(0.9), id: 'tall' };
  const low: Structure = {
    ...bed(0.3),
    id: 'low',
    points: [
      { x: 9, y: 4 },
      { x: 16, y: 4 },
      { x: 16, y: 7 },
      { x: 9, y: 7 },
    ],
  };
  const apart: Structure = {
    ...low,
    id: 'apart',
    points: [
      { x: 14, y: 4 },
      { x: 16, y: 4 },
      { x: 16, y: 7 },
      { x: 14, y: 7 },
    ],
  };

  /**
   * A plant standing on the overlap is given the taller bed's height, because
   * that is the wall holding the soil in. The drawing has to agree, or the
   * plant hangs above the shorter bed's surface. Hand-drawn beds overlap by a
   * few centimetres almost every time.
   */
  it('paints the taller one last, so its soil is the surface you see', () => {
    const beds = panoramaBeds([tall, low], OBSERVER);
    const t = beds.find((b) => b.structure.id === 'tall');
    const l = beds.find((b) => b.structure.id === 'low');
    if (!t || !l) throw new Error('expected both beds');
    expect(l.distance).toBeGreaterThan(t.distance);
  });

  it('does the same whichever order they were drawn in', () => {
    const beds = panoramaBeds([low, tall], OBSERVER);
    const t = beds.find((b) => b.structure.id === 'tall');
    const l = beds.find((b) => b.structure.id === 'low');
    if (!t || !l) throw new Error('expected both beds');
    expect(l.distance).toBeGreaterThan(t.distance);
  });

  it('leaves beds that share no ground ordered by distance alone', () => {
    const beds = panoramaBeds([tall, apart], OBSERVER);
    const a = beds.find((b) => b.structure.id === 'apart');
    if (!a) throw new Error('expected the far bed');
    const corners = apart.points.map((p) => Math.hypot(p.x - OBSERVER.x, p.y - OBSERVER.y));
    expect(a.distance).toBeCloseTo(Math.max(...corners));
  });
});

describe('walls, which are open on both sides', () => {
  it('keeps every run as its own face', () => {
    expect(panoramaFaces([wall(1.8)], OBSERVER, segmentsOf)).toHaveLength(1);
    const zigzag: Structure = {
      ...wall(1.8),
      points: [
        { x: 1, y: 6 },
        { x: 7, y: 6 },
        { x: 13, y: 3 },
      ],
    };
    expect(panoramaFaces([zigzag], OBSERVER, segmentsOf)).toHaveLength(2);
  });

  it('gives a low wall its coping, since you look down on that', () => {
    expect(panoramaTops([wall(0.5)], OBSERVER, 1.6)).toHaveLength(1);
  });

  it('gives no coping to one taller than the eye', () => {
    expect(panoramaTops([wall(1.8)], OBSERVER, 1.6)).toHaveLength(0);
  });

  it('draws nothing for a wall with no height', () => {
    expect(panoramaFaces([wall(0)], OBSERVER, segmentsOf)).toHaveLength(0);
  });
});

/**
 * Walls in the elevation strip.
 *
 * The elevation looks across a sight line from A to B and draws what stands
 * within a band either side of it, back to front. Everything turns on the depth
 * each thing is given, because that is the only thing the drawing order uses.
 *
 * A wall used to be given one depth — the average of its corners. For a single
 * straight run that is the right answer. For a fence traced round the edge of a
 * plot it was badly wrong: the run along the back and the runs down each side
 * averaged out to a full-width panel standing in the middle of the view, and
 * every plant between the sight line and the back fence was drawn behind it. A
 * designer previewing a boundary fence saw their planting vanish.
 *
 * Here the sight line runs west to east across the middle of a 14 × 10 plot, so
 * a point's depth is simply how far south of the line it is. Positive is behind.
 */
describe('walls in the elevation, run by run', () => {
  const A = { x: 0.5, y: 5 };
  const B = { x: 13.5, y: 5 };
  const WIDE = 10;

  const wall = (points: { x: number; y: number }[]): Structure => ({
    id: 'w',
    kind: 'wall',
    points,
    height: 1.8,
    thickness: 0.2,
    seed: 3,
  });

  /** A fence down the west side, along the back, and up the east side. */
  const U_FENCE = wall([
    { x: 0.2, y: 0.2 },
    { x: 0.2, y: 9.8 },
    { x: 13.8, y: 9.8 },
    { x: 13.8, y: 0.2 },
  ]);

  it('gives each run of a fence its own depth, instead of one for the whole fence', () => {
    const slices = sliceStructure(U_FENCE, A, B, WIDE);
    expect(slices).toHaveLength(3);

    const back = slices.find((sl) => sl.toAlong - sl.fromAlong > 10);
    expect(back).toBeDefined();
    // The back run is where the back fence actually is — not the middle of the view.
    expect(back?.offset).toBeCloseTo(4.8, 9);
  });

  /**
   * The fault itself, put the way the designer met it: a shrub planted between
   * the sight line and the back fence must be drawn in front of that fence.
   * Drawing is back to front, so it is enough that the fence is deeper.
   */
  it('puts a plant in front of the back fence, where it is planted', () => {
    const plantDepth = 3; // three metres behind the line, still well short of the fence
    const back = sliceStructure(U_FENCE, A, B, WIDE).find((sl) => sl.toAlong - sl.fromAlong > 10);
    expect(back?.offset ?? -Infinity).toBeGreaterThan(plantDepth);
  });

  it('still puts a wall in front of a plant that is behind it', () => {
    const inFront = sliceStructure(wall([{ x: 1, y: 6.5 }, { x: 13, y: 6.5 }]), A, B, WIDE);
    expect(inFront).toHaveLength(1);
    expect(inFront[0].offset).toBeCloseTo(1.5, 9);
    expect(inFront[0].offset).toBeLessThan(3);
  });

  it('draws a single straight run as one slice at its own depth, as it always did', () => {
    const [back] = sliceStructure(wall([{ x: 0.2, y: 9.8 }, { x: 13.8, y: 9.8 }]), A, B, WIDE);
    expect(back.offset).toBeCloseTo(4.8, 9);
    // Its full length, plus half its thickness at each end.
    expect(back.fromAlong).toBeCloseTo(0.2 - 0.5 - 0.1, 9);
    expect(back.toAlong).toBeCloseTo(13.8 - 0.5 + 0.1, 9);
  });

  it('shows a run crossing the view as a post, seen end on', () => {
    const [side] = sliceStructure(wall([{ x: 0.2, y: 0.2 }, { x: 0.2, y: 9.8 }]), A, B, WIDE);
    // No length along the line — only the wall's own thickness.
    expect(side.toAlong - side.fromAlong).toBeCloseTo(0.2, 9);
  });

  it('draws nothing of a run that lies wholly outside the band', () => {
    expect(sliceStructure(wall([{ x: 0.2, y: 9.8 }, { x: 13.8, y: 9.8 }]), A, B, 2.5)).toEqual([]);
  });

  /**
   * A run with one end inside the band and the other far outside used to be
   * judged by its corners alone, and came back as a sliver at the one corner
   * that was inside. The part of the wall actually crossing the band vanished.
   */
  it('keeps the part of a run inside the band, rather than a sliver at one corner', () => {
    // Slanting from 1 m behind the line to 9 m behind it, across the whole plot.
    const slant = wall([{ x: 1, y: 6 }, { x: 13, y: 14 }]);
    const [piece] = sliceStructure(slant, A, B, 3);
    // The band ends 3 m behind the line, which this run reaches a quarter of the
    // way along: y = 8 at x = 4. That part is kept, from x = 1 to x = 4.
    expect(piece.fromAlong).toBeCloseTo(1 - 0.5 - 0.1, 9);
    expect(piece.toAlong).toBeCloseTo(4 - 0.5 + 0.1, 9);
    expect(piece.offset).toBeCloseTo(2, 9); // midway between 1 m and 3 m
  });

  it('keeps a raised bed as one solid slice, which is what stops it drawing hollow', () => {
    const slices = sliceStructure(bed(0.4), A, B, WIDE);
    expect(slices).toHaveLength(1);
    expect(slices[0].structure.kind).toBe('bed');
  });
});
