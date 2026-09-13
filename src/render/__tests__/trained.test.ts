import { describe, expect, it } from 'vitest';
import { CORDON_STEM, FAN_LEG, getForm } from '../form';
import { getSpecies, isTrainedFlat, SPECIES } from '../../model/plants';
import { sizeAt } from '../../model/growth';

/**
 * Trained trees: pleached, umbrella, fan and cordon.
 *
 * They are drawn from a framework of their own rather than the one a free-grown
 * crown gets, because the tree drawing places blossom and fruit in a band across
 * the upper half of the plant. That suits a round crown. On a fan it would put
 * the cherries in mid-air between the ribs, and on a cordon it would scatter
 * apples across a box that is mostly empty sky. These check that everything on
 * a trained tree sits on the tree.
 */

const SEEDS = [1, 42, 9999, 123456];
const TRAINED = ['pleached-tree', 'umbrella-tree', 'fan-trained-tree', 'cordon-tree'];

const distanceToSegment = (px: number, py: number, x0: number, y0: number, x1: number, y1: number) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
};

describe('trained trees', () => {
  it('give every trained habit a framework to draw from', () => {
    for (const id of TRAINED) {
      for (const seed of SEEDS) {
        expect(getForm(getSpecies(id), seed).trained, id).toBeDefined();
      }
    }
  });

  it('keep every part of the framework inside the plant', () => {
    for (const id of TRAINED) {
      for (const seed of SEEDS) {
        const trained = getForm(getSpecies(id), seed).trained;
        if (trained === undefined) throw new Error(`${id} has no framework`);
        const points = [
          ...trained.branches.flatMap((b) => [
            [b.x0, b.y0],
            [b.x1, b.y1],
          ]),
          ...trained.buds.map((b) => [b.ax, b.ay]),
          ...trained.leaves.map((l) => [l.ax, l.ay]),
        ];
        for (const [x, y] of points) {
          expect(Math.abs(x), `${id} reaches past its own width`).toBeLessThanOrEqual(0.56);
          expect(y, `${id} reaches below its base`).toBeGreaterThanOrEqual(0);
          expect(y, `${id} reaches above its top`).toBeLessThanOrEqual(1.05);
        }
      }
    }
  });

  /** The reason these have a framework of their own at all. */
  it('hangs a fan’s blossom and fruit on its ribs, not in the air between them', () => {
    for (const seed of SEEDS) {
      const trained = getForm(getSpecies('fan-trained-tree'), seed).trained;
      if (trained === undefined) throw new Error('no framework');
      const ribs = trained.branches.filter((b) => b.depth === 0);
      expect(ribs.length).toBeGreaterThan(4);
      // Every rib starts at the top of the leg.
      for (const rib of ribs) expect(rib.y0).toBeCloseTo(FAN_LEG, 9);
      for (const bud of trained.buds) {
        const nearest = Math.min(
          ...ribs.map((r) => distanceToSegment(bud.ax, bud.ay, r.x0, r.y0, r.x1, r.y1)),
        );
        expect(nearest).toBeLessThan(0.05);
      }
    }
  });

  it('carries a cordon’s fruit on spurs close to its one stem', () => {
    const { x0, y0, x1, y1 } = CORDON_STEM;
    for (const seed of SEEDS) {
      const trained = getForm(getSpecies('cordon-tree'), seed).trained;
      if (trained === undefined) throw new Error('no framework');
      for (const bud of trained.buds) {
        expect(distanceToSegment(bud.ax, bud.ay, x0, y0, x1, y1)).toBeLessThan(0.12);
      }
      // And the stem really does slant, rather than standing up like a tree.
      expect(Math.abs(x1 - x0)).toBeGreaterThan(0.5);
    }
  });

  it('turns the three flat ones like a climber, and not the umbrella', () => {
    expect(isTrainedFlat(getSpecies('pleached-tree'))).toBe(true);
    expect(isTrainedFlat(getSpecies('fan-trained-tree'))).toBe(true);
    expect(isTrainedFlat(getSpecies('cordon-tree'))).toBe(true);
    expect(isTrainedFlat(getSpecies('umbrella-tree'))).toBe(false);
    // Every climber still is, and no free-grown tree has become one.
    for (const s of SPECIES) {
      if (s.type === 'climber') expect(isTrainedFlat(s), s.id).toBe(true);
      if (s.habit === 'round') expect(isTrainedFlat(s), s.id).toBe(false);
    }
  });

  /**
   * Trained trees are held at their size by pruning. The nursery sells them part
   * trained, so they start near their final shape and stop there — none of them
   * should turn into the full-grown tree it was modelled on.
   */
  it('reach their trained size and stay there', () => {
    for (const id of TRAINED) {
      const species = getSpecies(id);
      expect(species.clipped, id).toBe(true);
      const at20 = sizeAt(species, 20);
      expect(at20.height, id).toBeCloseTo(species.matureHeight, 9);
      expect(at20.spread, id).toBeCloseTo(species.matureSpread, 9);
      expect(sizeAt(species, 40)).toEqual(at20);
    }
  });

  it('are trees, filed under trees in the library', () => {
    for (const id of TRAINED) expect(getSpecies(id).type).toBe('tree');
  });
});
