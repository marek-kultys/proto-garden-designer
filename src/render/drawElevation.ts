import { getSpecies } from '../model/plants';
import { phaseAt } from '../model/phenology';
import { matureSize, plantAge, sizeAt } from '../model/growth';
import { shadowLengthFactor } from '../model/sun';
import { canopyDensity } from '../model/shade';
import { baseHeightOf, standingHeightAt } from '../model/structures';
import { groundAt, terrainOf } from '../model/terrain';
import type { PlantInstance, Site, Structure, TimeState, Vec2 } from '../model/types';
import { inkColour, shade, type Lighting } from './palette';
import { getForm } from './form';
import { drawPlantElevation } from './plant';
import { drawStructureElevation, sliceStructure, type StructureSlice } from './structure';
import { MIN_ELEVATION_HEIGHT, sliceHalfWidth } from './constants';

/**
 * The side-on strip beneath the plan.
 *
 * Plan view is where a design gets arranged; it is a poor place to see what a
 * design will actually look like standing in the garden. A bare birch and a
 * leafy one are nearly the same circle from above, and twenty years of growth
 * mostly happens in a dimension the plan cannot show at all. This strip takes a
 * slice through the plot and draws it in elevation, so height, silhouette,
 * leaf-drop and autumn colour are all legible.
 *
 * One rule matters more than the rest: the vertical scale is fixed to the
 * *mature* size of the planting, never to the current size. If it refitted as
 * plants grew, everything would stay the same size on screen and the age slider
 * would appear to do nothing at all.
 */

export interface ElevationScene {
  /** Needed for the lie of the land, which is stated across the whole plot. */
  plot: Vec2[];
  plants: PlantInstance[];
  structures: Structure[];
  site: Site;
  time: TimeState;
  light: Lighting;
  sightLine: { a: Vec2; b: Vec2 };
  /** Depth of the slice across the sight line, in metres. */
  sliceDepth: number;
  selectedId: string | null;
  selectedStructureId: string | null;
}

interface Projected {
  plant: PlantInstance;
  /** Metres along the sight line from A. */
  along: number;
  /** Signed metres to the side of the line; positive is behind. */
  offset: number;
}

function project(plants: PlantInstance[], a: Vec2, b: Vec2): Projected[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return plants.map((plant) => {
    const px = plant.x - a.x;
    const py = plant.y - a.y;
    return {
      plant,
      along: px * ux + py * uy,
      offset: px * -uy + py * ux,
    };
  });
}

export function drawElevation(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: ElevationScene,
): void {
  const { light, sightLine, site, time } = scene;
  // Half either side of the line, which is what the projection compares against.
  const band = sliceHalfWidth(scene.sliceDepth);
  const terrain = terrainOf(scene.plot, site);
  /** Height of the ground under any point. Zero everywhere on a level garden. */
  const ground = (p: Vec2) => groundAt(terrain, p);
  /** Where on the sight line a distance along it lands, in plot metres. */
  const pointAlong = (metres: number) => {
    const dx = sightLine.b.x - sightLine.a.x;
    const dy = sightLine.b.y - sightLine.a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: sightLine.a.x + (dx / len) * metres, y: sightLine.a.y + (dy / len) * metres };
  };
  const lineLength = Math.max(
    1,
    Math.hypot(sightLine.b.x - sightLine.a.x, sightLine.b.y - sightLine.a.y),
  );

  // Sky, which is where the time-of-day slider pays off most obviously.
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, light.skyTop);
  sky.addColorStop(1, light.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const projected = project(scene.plants, sightLine.a, sightLine.b);
  const inBand = projected.filter(
    (p) => Math.abs(p.offset) <= band && p.along >= -1 && p.along <= lineLength + 1,
  );

  /*
   * The vertical range the strip has to hold, in metres either side of the
   * datum — the middle of the plot, which is where the ground is zero.
   *
   * Both ends are needed. Sizing to the tallest thing alone was a real fault:
   * the datum was pinned 26 px off the bottom whatever the garden was doing, so
   * on any slope the downhill ground — and everything standing on it — was
   * drawn below the canvas and simply not there.
   *
   * Still measured from *mature* sizes, so the view does not rescale as the age
   * slider moves.
   */
  let highest = MIN_ELEVATION_HEIGHT;
  let lowest = 0;
  for (const p of scene.plants) {
    const species = getSpecies(p.speciesId);
    // A plant reaches its own height above whatever it stands on — a bed's soil,
    // or ground that may itself be well above the datum.
    const base = standingHeightAt(p, scene.structures, ground);
    highest = Math.max(highest, (matureSize(species).height + base) * 1.06);
  }
  // Built things are at their full height from the day they go in, so they
  // count against the same range — otherwise a 3 m wall is drawn off the top of
  // the strip on a garden of low planting.
  for (const structure of scene.structures) {
    highest = Math.max(highest, (baseHeightOf(structure, ground) + structure.height) * 1.12);
  }
  // Ground at either end of the fall, which is what used to be missed.
  for (const p of scene.plot) {
    const z = groundAt(terrain, p);
    highest = Math.max(highest, z * 1.2 + 1);
    lowest = Math.min(lowest, z * 1.2 - 0.2);
  }

  const marginX = 46;
  /** Where the lowest ground sits — the bottom of the drawing, less a margin. */
  const bottomY = height - 26;
  const usableW = width - marginX * 2;
  const usableH = bottomY - 12;
  const pxPerM = Math.min(usableW / lineLength, usableH / (highest - lowest));
  /**
   * Screen height of the datum. On level ground `lowest` is zero and this is
   * the bottom line exactly, as it always was; a fall lifts it by however far
   * the ground drops below the middle of the plot.
   */
  const groundY = bottomY + lowest * pxPerM;
  const originX = (width - lineLength * pxPerM) / 2;

  /**
   * Ground, which is only a straight line when the garden is level.
   *
   * The profile is sampled along the sight line so a slope reads as the slope
   * it is: cut across the fall it is a ramp, cut along the contour it is flat,
   * and both are true of the same garden at once.
   */
  const groundYAt = (metres: number) => groundY - ground(pointAlong(metres)) * pxPerM;
  const profile: Vec2[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const metres = (lineLength * i) / steps;
    profile.push({ x: originX + metres * pxPerM, y: groundYAt(metres) });
  }

  ctx.fillStyle = shade('#cfc7ac', light, { value: 0.95 });
  ctx.beginPath();
  // Carried out past both ends, so the ground does not stop where the slice does.
  ctx.moveTo(0, profile[0].y);
  for (const p of profile) ctx.lineTo(p.x, p.y);
  ctx.lineTo(width, profile[profile.length - 1].y);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = inkColour(light, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, profile[0].y);
  for (const p of profile) ctx.lineTo(p.x, p.y);
  ctx.lineTo(width, profile[profile.length - 1].y);
  ctx.stroke();

  drawHeightRuler(ctx, originX, width, groundY, pxPerM, highest, light);

  const dc = { ctx, light, pxPerM };
  const factor = shadowLengthFactor(light.altitude);

  const slices: StructureSlice[] = [];
  for (const structure of scene.structures) {
    const slice = sliceStructure(structure, sightLine.a, sightLine.b, band);
    if (slice !== null) slices.push(slice);
  }

  // Back to front, so nearer things overlap those behind them — planting and
  // built work in one order, since a wall can be in front of one shrub and
  // behind another.
  type Item =
    | { sort: number; kind: 'plant'; value: (typeof inBand)[number] }
    | { sort: number; kind: 'structure'; value: StructureSlice };
  const ordered: Item[] = [
    ...inBand.map((value) => ({ sort: value.offset, kind: 'plant' as const, value })),
    ...slices.map((value) => ({ sort: value.offset, kind: 'structure' as const, value })),
  ].sort((a, b) => b.sort - a.sort);

  for (const entry of ordered) {
    if (entry.kind === 'structure') {
      const depth = Math.min(1, Math.abs(entry.value.offset) / band);
      ctx.save();
      ctx.globalAlpha = 1 - depth * 0.25;
      drawStructureElevation(
        ctx,
        entry.value,
        originX,
        // A wall stands on the ground under the middle of its own run — not the
        // middle of the piece of it this slice happens to cut, which moves as
        // the A/B line is dragged.
        groundY - baseHeightOf(entry.value.structure, ground) * pxPerM,
        pxPerM,
        light,
        scene.selectedStructureId === entry.value.structure.id,
      );
      ctx.restore();
      continue;
    }

    const item = entry.value;
    const species = getSpecies(item.plant.speciesId);
    const phase = phaseAt(species, time.doy, site);
    const size = sizeAt(species, plantAge(item.plant.plantedAge, time.year));
    const form = getForm(species, item.plant.seed);
    const x = originX + item.along * pxPerM;
    // What the plant stands on: its bed's level soil surface if it is in one,
    // otherwise the ground under its feet. The same one question the 360° view
    // asks, so the two views cannot disagree about where a plant's feet are.
    const baseY = groundY - standingHeightAt(item.plant, scene.structures, ground) * pxPerM;

    // Distance haze: things further back sit a little further into the light.
    const depth = Math.min(1, Math.abs(item.offset) / band);
    ctx.save();
    ctx.globalAlpha = 1 - depth * 0.25;

    if (light.altitude > 0.5 && !phase.dormant) {
      const density = canopyDensity(species, phase);
      const shadowLen = Math.min(18, size.height * factor) * pxPerM;
      if (shadowLen > 2 && density > 0.02) {
        ctx.save();
        ctx.filter = `blur(${Math.min(8, light.shadowBlur * 0.5).toFixed(1)}px)`;
        ctx.fillStyle = `rgba(46, 54, 78, ${(light.shadowAlpha * density * 0.8).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(
          x + shadowLen * 0.18,
          baseY + 2,
          Math.max(4, (size.spread / 2) * pxPerM + shadowLen * 0.2),
          Math.max(2, size.spread * pxPerM * 0.09 + 2),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
      }
    }

    drawPlantElevation(
      dc,
      species,
      form,
      phase,
      size,
      x,
      baseY,
      phase.flowerAge,
      scene.selectedId === item.plant.id,
    );
    ctx.restore();
  }

  drawEndMarkers(
    ctx,
    originX,
    lineLength * pxPerM,
    // Down to the ground actually under each end, which on a slope is not the
    // datum — a dashed line stopping in mid-air reads as a fault of its own.
    groundYAt(0),
    groundYAt(lineLength),
    height,
    light,
  );

  if (inBand.length === 0 && slices.length === 0) {
    ctx.fillStyle = inkColour(light, 0.55);
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      scene.plants.length
        ? `No plants within ${band.toFixed(1)} m of the sight line — widen the slice, or drag the A/B handles`
        : 'Drag plants onto the plan to see them here',
      width / 2,
      groundY - usableH / 2,
    );
  }
}

function drawHeightRuler(
  ctx: CanvasRenderingContext2D,
  originX: number,
  width: number,
  groundY: number,
  pxPerM: number,
  reference: number,
  light: Lighting,
): void {
  const step = reference > 10 ? 2 : 1;
  ctx.save();
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let m = step; m <= reference; m += step) {
    const y = groundY - m * pxPerM;
    if (y < 12) break;
    ctx.strokeStyle = inkColour(light, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(originX - 12, y);
    ctx.lineTo(width - 12, y);
    ctx.stroke();
    ctx.fillStyle = inkColour(light, 0.55);
    ctx.fillText(`${m} m`, originX - 18, y);
  }
  ctx.restore();
}

function drawEndMarkers(
  ctx: CanvasRenderingContext2D,
  originX: number,
  lineWidth: number,
  groundYAtA: number,
  groundYAtB: number,
  height: number,
  light: Lighting,
): void {
  ctx.save();
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [x, label, groundY] of [
    [originX, 'A', groundYAtA],
    [originX + lineWidth, 'B', groundYAtB],
  ] as const) {
    ctx.strokeStyle = 'rgba(176, 92, 48, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(176, 92, 48, 1)';
    ctx.beginPath();
    ctx.arc(x, height - 14, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, height - 14);
  }
  ctx.restore();
  void light;
}
