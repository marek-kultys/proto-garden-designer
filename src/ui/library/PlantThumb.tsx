import { useEffect, useRef } from 'react';
import { phaseAt } from '../../model/phenology';
import { matureSize } from '../../model/growth';
import { lightingFor } from '../../render/palette';
import { getForm } from '../../render/form';
import { drawPlantElevation } from '../../render/plant';
import type { Species } from '../../model/types';

/**
 * The little portrait on every card in the library.
 *
 * It is the elevation drawing at thumbnail size, so a plant looks in the list
 * exactly as it will look in the garden — no second set of icons to draw, and
 * none to keep in step as the drawing changes.
 */

const REFERENCE_SITE = {
  latitude: 51.5,
  longitude: -0.13,
  altitude: 0,
  northAngle: 0,
  dst: true,
  label: 'ref',
};

const THUMB_LIGHT = lightingFor(46, 180);

/**
 * Thumbnails are drawn on the day each plant looks most like itself, rather than
 * on one shared date. A midsummer thumbnail would show the magnolia, the
 * hellebore and the allium as anonymous green lumps — the three plants whose
 * whole point is that they perform when nothing else does — and a January one
 * would show half the library as bare sticks.
 *
 * So the day is chosen by scoring every fortnight of the year for how much
 * there is to look at. Flowers and fruit outweigh foliage, which is why the
 * magnolia is drawn in flower on bare wood; but a birch, whose catkins are
 * nothing to look at, still scores highest in full leaf.
 */
function portraitDay(species: Species): number {
  let best = 195;
  let bestScore = -1;
  for (let doy = 5; doy <= 365; doy += 5) {
    const p = phaseAt(species, doy, REFERENCE_SITE);
    if (p.dormant) continue;
    const score =
      p.leafCover * 0.9 +
      p.flower * 1.35 +
      p.fruit * 1.15 +
      p.autumn * 0.7 * p.leafCover +
      p.seedhead * 0.7;
    if (score > bestScore) {
      bestScore = score;
      best = doy;
    }
  }
  return best;
}

/** Each plant is normalised to the same box height, so the shape reads as an icon. */
export function PlantThumb({ species }: { species: Species }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 56;
    const h = 56;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const doy = portraitDay(species);
    const phase = phaseAt(species, doy, REFERENCE_SITE);
    drawPlantElevation(
      { ctx, light: THUMB_LIGHT, pxPerM: (h - 12) / matureSize(species).height },
      species,
      getForm(species, 4242),
      phase,
      matureSize(species),
      w / 2,
      h - 6,
      phase.flowerAge,
      false,
    );
  }, [species]);

  return <canvas ref={ref} className="thumb" style={{ width: 56, height: 56 }} aria-hidden />;
}
