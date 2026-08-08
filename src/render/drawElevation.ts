import { getSpecies } from '../model/plants';
import { phaseAt } from '../model/phenology';
import { sizeAt } from '../model/growth';
import { shadowLengthFactor } from '../model/sun';
import { canopyDensity } from '../model/shade';
import type { PlantInstance, Site, TimeState, Vec2 } from '../model/types';
import { inkColour, shade, type Lighting } from './palette';
import { getForm } from './form';
import { drawPlantElevation, flowerAge } from './plant';
import { roughLine } from './sketch';
import { MIN_ELEVATION_HEIGHT, SIGHT_BAND } from './constants';

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
  plants: PlantInstance[];
  site: Site;
  time: TimeState;
  light: Lighting;
  sightLine: { a: Vec2; b: Vec2 };
  selectedId: string | null;
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
    (p) => Math.abs(p.offset) <= SIGHT_BAND && p.along >= -1 && p.along <= lineLength + 1,
  );

  // Vertical reference is the mature height of everything planted, so the view
  // does not rescale while the age slider moves.
  let reference = MIN_ELEVATION_HEIGHT;
  for (const p of scene.plants) {
    const species = getSpecies(p.speciesId);
    reference = Math.max(reference, species.matureHeight * 1.06);
  }

  const marginX = 46;
  const groundY = height - 26;
  const usableW = width - marginX * 2;
  const usableH = groundY - 12;
  const pxPerM = Math.min(usableW / lineLength, usableH / reference);
  const originX = (width - lineLength * pxPerM) / 2;

  // Ground.
  ctx.fillStyle = shade('#cfc7ac', light, { value: 0.95 });
  ctx.fillRect(0, groundY, width, height - groundY);
  ctx.strokeStyle = inkColour(light, 0.7);
  ctx.lineWidth = 1.5;
  roughLine(ctx, 0, groundY, width, groundY, 4242, { roughness: 1.4, passes: 1 });

  drawHeightRuler(ctx, originX, width, groundY, pxPerM, reference, light);

  const dc = { ctx, light, pxPerM };
  const factor = shadowLengthFactor(light.altitude);

  // Back to front, so nearer plants overlap those behind them.
  const ordered = [...inBand].sort((a, b) => b.offset - a.offset);

  for (const item of ordered) {
    const species = getSpecies(item.plant.speciesId);
    const phase = phaseAt(species, time.doy, site);
    const size = sizeAt(species, time.year);
    const form = getForm(species, item.plant.seed);
    const x = originX + item.along * pxPerM;

    // Distance haze: things further back sit a little further into the light.
    const depth = Math.min(1, Math.abs(item.offset) / SIGHT_BAND);
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
          groundY + 2,
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
      groundY,
      flowerAge(species, time.doy),
      scene.selectedId === item.plant.id,
    );
    ctx.restore();
  }

  drawEndMarkers(ctx, originX, lineLength * pxPerM, groundY, height, light);

  if (inBand.length === 0) {
    ctx.fillStyle = inkColour(light, 0.55);
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      scene.plants.length
        ? 'No plants within 2.5 m of the sight line — drag the A/B handles on the plan'
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
  groundY: number,
  height: number,
  light: Lighting,
): void {
  ctx.save();
  ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [x, label] of [
    [originX, 'A'],
    [originX + lineWidth, 'B'],
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
