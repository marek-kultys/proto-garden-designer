import { getSpecies } from '../model/plants';
import { phaseAt } from '../model/phenology';
import { plantAge, sizeAt } from '../model/growth';
import { bearingToCanvas, shadowLengthFactor } from '../model/sun';
import { canopyDensity, type ShadeGrid } from '../model/shade';
import { polygonBounds } from '../model/geometry';
import type { Observer } from '../model/panorama';
import { standingHeightAt } from '../model/structures';
import { groundAt, shadowCastOnSlope, terrainOf, terrainRange, type Terrain } from '../model/terrain';
import type { PlantInstance, Plot, Site, Structure, TimeState, Vec2 } from '../model/types';
import { inkColour, shade, type Lighting } from './palette';
import { blobPoints, curvePath, roughCurve, roughLine, roughPolygon, subSeed } from './sketch';
import { getForm } from './form';
import { canopyOutline, drawPlantPlan } from './plant';
import { drawShadeOverlay } from './overlay';
import { drawStructurePlan, drawStructureShadowPlan } from './structure';
import { drawObserverOnPlan } from './drawPanorama';
import { niceScaleStep, toScreen, type Viewport } from './viewport';
import { DRAWN_SHADOW_CAP, sliceHalfWidth } from './constants';

export interface Scene {
  plot: Plot;
  plants: PlantInstance[];
  structures: Structure[];
  selectedStructureId: string | null;
  site: Site;
  time: TimeState;
  calendarYear: number;
  light: Lighting;
  selectedId: string | null;
  sightLine: { a: Vec2; b: Vec2 };
  /** Depth of the elevation's slice, so the band drawn here tells the truth. */
  sliceDepth: number;
  observer: Observer;
}

export interface PlanOptions {
  showShadows: boolean;
  showGrid: boolean;
  showSightLine: boolean;
  /** Draw the eye and its view cone — only when the 360° view is on screen. */
  showObserver: boolean;
  /** The field the panorama is actually rendering, so the cone tells the truth. */
  renderedFov: number;
  shadeGrid: ShadeGrid | null;
  /** Polygon being drawn right now, in plot metres. */
  draftPolygon?: Vec2[] | null;
  draftCursor?: Vec2 | null;
}

const PAPER = '#f7f4ec';

/** Metres a climber stands off its support, for the band it shades. */
const CLIMBER_SHADOW_DEPTH = 0.45;

export function drawPlan(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
  scene: Scene,
  opts: PlanOptions,
): void {
  const { light, plot, site, time } = scene;
  const planTerrain = terrainOf(plot, site);

  ctx.clearRect(0, 0, width, height);
  // The paper keeps its own colour through the day, dimming only enough at night
  // to stay consistent with the drawing on it.
  ctx.fillStyle = shade(PAPER, light, { tintStrength: 0, value: 1.02 });
  ctx.fillRect(0, 0, width, height);

  const screenPoly = plot.map((p) => toScreen(viewport, p));
  const hasPlot = screenPoly.length >= 3;
  const plotPath = hasPlot ? curvePathStraight(screenPoly) : null;

  if (plotPath) {
    ctx.save();
    ctx.fillStyle = shade('#d9dcc2', light, { tintStrength: 0.5 });
    ctx.fill(plotPath);
    ctx.restore();

    if (opts.showGrid) drawGrid(ctx, viewport, plot, plotPath, light);
  }

  if (opts.shadeGrid && plotPath) {
    ctx.save();
    ctx.clip(plotPath);
    drawShadeOverlay(ctx, opts.shadeGrid, viewport);
    ctx.restore();
  }

  // Plants, with the widest drawn first so small things stay visible on top.
  const drawables = scene.plants
    .map((plant) => {
      const species = getSpecies(plant.speciesId);
      const phase = phaseAt(species, time.doy, site);
      const size = sizeAt(species, plantAge(plant.plantedAge, time.year));
      const form = getForm(species, plant.seed);
      const screen = toScreen(viewport, plant);
      const base = standingHeightAt(plant, scene.structures, (q) => groundAt(planTerrain, q));
      // A climber follows the fence it was planted against, when that has been
      // said; otherwise its own sketchy rotation stands in.
      const facing =
        plant.facing === undefined ? undefined : (plant.facing * Math.PI) / 180;
      return { plant, species, phase, size, form, screen, base, facing };
    })
    .sort((a, b) => b.size.spread - a.size.spread);

  // Drawn before the planting: a raised bed is ground that plants stand in, and
  // a wall seen from above sits behind whatever is growing in front of it.
  // Shortest first, so where two beds overlap the taller one's surface is the
  // one you see — the same rule the planting stands on.
  for (const structure of [...scene.structures].sort((a, b) => a.height - b.height)) {
    drawStructurePlan(ctx, structure, viewport, light, false);
  }

  if (opts.showShadows && light.altitude > 0.5 && plotPath) {
    // Clipped to the plot: a shadow sprawling across the paper outside the
    // boundary reads as part of the drawing rather than as a consequence of it.
    ctx.save();
    ctx.clip(plotPath);
    drawStructureShadowPlan(ctx, scene.structures, viewport, light, site, planTerrain);
    drawShadows(ctx, drawables, viewport, light, site, planTerrain);
    ctx.restore();
  }

  const dc = { ctx, light, pxPerM: viewport.scale };
  for (const d of drawables) {
    drawPlantPlan(
      dc,
      d.species,
      d.form,
      d.phase,
      d.size,
      d.screen.x,
      d.screen.y,
      d.phase.flowerAge,
      scene.selectedId === d.plant.id,
      d.facing,
    );
  }

  drawContours(ctx, scene, viewport, light, plotPath);

  const selectedStructure = scene.structures.find((x) => x.id === scene.selectedStructureId);
  if (selectedStructure !== undefined) {
    drawStructurePlan(ctx, selectedStructure, viewport, light, true);
  }

  if (plotPath) {
    ctx.strokeStyle = inkColour(light, 0.85);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    roughPolygon(ctx, screenPoly, 1234, { roughness: 0.8, passes: 2 });
  }

  if (opts.draftPolygon && opts.draftPolygon.length > 0) {
    drawDraftPolygon(ctx, viewport, opts.draftPolygon, opts.draftCursor ?? null, light);
  }

  if (opts.showSightLine && hasPlot) {
    drawSightLine(ctx, viewport, scene.sightLine, light, sliceHalfWidth(scene.sliceDepth));
  }
  if (opts.showObserver) {
    drawObserverOnPlan(
      ctx,
      toScreen(viewport, scene.observer),
      scene.observer,
      site,
      viewport.scale,
      opts.renderedFov,
    );
  }

  drawSunMarker(ctx, width, height, viewport, scene);
  drawNorthArrow(ctx, width, site.northAngle, light);
  drawScaleBar(ctx, width, height, viewport, light);
}

/** Straight-edged path — a plot boundary is surveyed, not sketched freehand. */
function curvePathStraight(pts: Vec2[]): Path2D {
  const path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
  return path;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  plot: Plot,
  plotPath: Path2D,
  light: Lighting,
): void {
  const bounds = polygonBounds(plot);
  ctx.save();
  ctx.clip(plotPath);

  const step = viewport.scale < 12 ? 5 : 1;
  const start = Math.floor(bounds.minX / step) * step;
  const startY = Math.floor(bounds.minY / step) * step;

  for (let x = start; x <= bounds.maxX; x += step) {
    const major = Math.abs(x % 5) < 1e-6;
    ctx.strokeStyle = inkColour(light, major ? 0.16 : 0.07);
    ctx.lineWidth = 1;
    const a = toScreen(viewport, { x, y: bounds.minY });
    const b = toScreen(viewport, { x, y: bounds.maxY });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = startY; y <= bounds.maxY; y += step) {
    const major = Math.abs(y % 5) < 1e-6;
    ctx.strokeStyle = inkColour(light, major ? 0.16 : 0.07);
    ctx.lineWidth = 1;
    const a = toScreen(viewport, { x: bounds.minX, y });
    const b = toScreen(viewport, { x: bounds.maxX, y });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

type Drawable = {
  plant: PlantInstance;
  species: ReturnType<typeof getSpecies>;
  phase: ReturnType<typeof phaseAt>;
  size: ReturnType<typeof sizeAt>;
  form: ReturnType<typeof getForm>;
  screen: Vec2;
  /** Height of the ground under it — non-zero when it stands in a raised bed. */
  base: number;
  /** Which way a climber's plane runs, in radians, when it has been chosen. */
  facing: number | undefined;
};

/**
 * Shadows are the canopy footprint stretched away from the sun, by an amount
 * that comes straight from the sun's altitude. That single relationship is what
 * makes the time-of-day slider feel real: a shadow at 08:00 in October is many
 * times the length of the same tree's shadow at 13:00 in June.
 */
function drawShadows(
  ctx: CanvasRenderingContext2D,
  drawables: Drawable[],
  viewport: Viewport,
  light: Lighting,
  site: Site,
  terrain: Terrain,
): void {
  // Down at the horizon there is no shadow worth drawing; above that, the same
  // reach the sun map measures with, capped so one shadow cannot fill the page.
  if (shadowLengthFactor(light.altitude) <= 0) return;
  const cast = shadowCastOnSlope(terrain, light.altitude, light.azimuth, site.northAngle);
  const factor = Math.min(DRAWN_SHADOW_CAP, cast.reach);
  const ux = cast.ux;
  const uy = cast.uy;
  // The same direction, as an angle, for the shadows drawn by rotating a shape.
  const angle = Math.atan2(uy, ux);

  ctx.save();
  ctx.filter = `blur(${light.shadowBlur.toFixed(1)}px)`;

  for (const d of drawables) {
    const density = canopyDensity(d.species, d.phase);
    if (density < 0.02) continue;

    const radius = Math.max(2, (d.size.spread / 2) * viewport.scale);
    const len = Math.min(40, d.size.height * factor) * viewport.scale;
    if (len < 1) continue;
    // Standing in a raised bed pushes the whole shadow further from the plant,
    // by the height of the bed — the same reason a wall's shadow starts at its
    // foot and not at the viewer.
    const lift = Math.min(40, d.base * factor) * viewport.scale;

    /*
     * A climber's shadow is a band, not a disc.
     *
     * Its spread is how far it has run along its support, not how far it stands
     * out from it — so once climbers were capped at trellis height and grew
     * sideways instead, using the canopy outline threw a sixteen-metre circle
     * of shade across the whole garden from a plant a foot deep.
     */
    if (d.species.type === 'climber') {
      const halfRun = Math.max(2, (d.size.spread / 2) * viewport.scale);
      const halfDepth = Math.max(1.5, (CLIMBER_SHADOW_DEPTH / 2) * viewport.scale);
      ctx.save();
      ctx.translate(d.screen.x + ux * (lift + len / 2), d.screen.y + uy * (lift + len / 2));
      ctx.rotate(d.facing ?? d.form.rotation);
      ctx.fillStyle = `rgba(46, 54, 78, ${(light.shadowAlpha * density).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, halfRun, halfDepth + len / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }

    const stretch = (radius + len / 2) / radius;
    ctx.save();
    ctx.translate(d.screen.x, d.screen.y);
    ctx.rotate(angle);
    ctx.translate(lift + len / 2, 0);
    ctx.scale(stretch, 1);
    ctx.fillStyle = `rgba(46, 54, 78, ${(light.shadowAlpha * density).toFixed(3)})`;
    ctx.fill(curvePath(canopyOutline(d.form, 0, 0, radius), true));
    ctx.restore();
  }

  ctx.restore();
}

function drawDraftPolygon(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  draft: Vec2[],
  cursor: Vec2 | null,
  light: Lighting,
): void {
  const pts = draft.map((p) => toScreen(viewport, p));
  ctx.save();
  ctx.strokeStyle = 'rgba(63, 128, 176, 0.95)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (cursor) {
    const c = toScreen(viewport, cursor);
    ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(63, 128, 176, 1)';
  ctx.lineWidth = 2;
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Live edge lengths, because plots are drawn to measurements.
  ctx.fillStyle = inkColour(light, 0.8);
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  const all = cursor ? [...draft, cursor] : draft;
  for (let i = 1; i < all.length; i++) {
    const len = Math.hypot(all[i].x - all[i - 1].x, all[i].y - all[i - 1].y);
    const a = toScreen(viewport, all[i - 1]);
    const b = toScreen(viewport, all[i]);
    ctx.fillText(`${len.toFixed(1)} m`, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 4);
  }
  ctx.restore();
}

/**
 * Contours, which are how a slope is shown on a plan.
 *
 * Straight parallel lines here, because the ground is one plane — but drawn and
 * labelled the way a survey would, so the drawing says what it means rather
 * than relying on the elevation beside it. Clipped to the plot: contours
 * sprawling across the paper would read as part of the drawing rather than as
 * information about it.
 */
function drawContours(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  viewport: Viewport,
  light: Lighting,
  plotPath: Path2D | null,
): void {
  const terrain = terrainOf(scene.plot, scene.site);
  if (terrain.gradient === 0 || plotPath === null) return;

  const { low, high } = terrainRange(scene.plot, terrain);
  const fall = high - low;
  if (fall < 0.05) return;

  // A round interval that gives a handful of lines rather than a hatch.
  const step = [0.1, 0.25, 0.5, 1, 2].find((s) => fall / s <= 8) ?? 5;

  ctx.save();
  ctx.clip(plotPath);
  ctx.lineWidth = 1;
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';

  const b = polygonBounds(scene.plot);
  const diagonal = Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  // Along the contour is across the fall.
  const ax = -terrain.uy;
  const ay = terrain.ux;

  const first = Math.ceil(low / step) * step;
  for (let z = first; z <= high + 1e-9; z += step) {
    // Distance downhill from the datum at which the ground is at this height.
    const along = -z / terrain.gradient;
    const px = terrain.cx + terrain.ux * along;
    const py = terrain.cy + terrain.uy * along;
    const from = toScreen(viewport, { x: px - ax * diagonal, y: py - ay * diagonal });
    const to = toScreen(viewport, { x: px + ax * diagonal, y: py + ay * diagonal });

    const onDatum = Math.abs(z) < 1e-6;
    ctx.strokeStyle = inkColour(light, onDatum ? 0.32 : 0.18);
    ctx.setLineDash(onDatum ? [] : [7, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = inkColour(light, 0.45);
    const label = `${z > 0 ? '+' : ''}${z.toFixed(z % 1 === 0 ? 0 : 2)} m`;
    ctx.save();
    ctx.translate(to.x, to.y);
    ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x) + Math.PI);
    ctx.fillText(label, 8, -3);
    ctx.restore();
  }
  ctx.restore();
}

function drawSightLine(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  line: { a: Vec2; b: Vec2 },
  light: Lighting,
  band: number,
): void {
  const a = toScreen(viewport, line.a);
  const b = toScreen(viewport, line.b);
  ctx.save();

  // The band is what the elevation strip actually shows, so make it visible —
  // otherwise "why is my plant missing from the elevation?" has no answer.
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * band * viewport.scale;
  const ny = (dx / len) * band * viewport.scale;
  ctx.fillStyle = 'rgba(176, 92, 48, 0.05)';
  ctx.beginPath();
  ctx.moveTo(a.x + nx, a.y + ny);
  ctx.lineTo(b.x + nx, b.y + ny);
  ctx.lineTo(b.x - nx, b.y - ny);
  ctx.lineTo(a.x - nx, a.y - ny);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(176, 92, 48, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([9, 6]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const [pt, label] of [
    [a, 'A'],
    [b, 'B'],
  ] as const) {
    ctx.fillStyle = 'rgba(176, 92, 48, 1)';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pt.x, pt.y);
  }
  ctx.restore();
  void light;
}

function drawNorthArrow(
  ctx: CanvasRenderingContext2D,
  width: number,
  northAngle: number,
  light: Lighting,
): void {
  const cx = width - 46;
  const cy = 46;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((northAngle * Math.PI) / 180);

  ctx.strokeStyle = inkColour(light, 0.75);
  ctx.fillStyle = inkColour(light, 0.75);
  ctx.lineWidth = 1.4;
  roughLine(ctx, 0, 18, 0, -16, 77, { roughness: 0.5, passes: 1 });
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(-5, -11);
  ctx.lineTo(5, -11);
  ctx.closePath();
  ctx.fill();

  ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', 0, -31);
  ctx.restore();
}

function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
  light: Lighting,
): void {
  const compact = width < 560;
  const metres = niceScaleStep(viewport.scale, compact ? 56 : 110);
  const px = metres * viewport.scale;
  const x = compact ? 12 : 24;
  const y = height - (compact ? 16 : 28);

  ctx.save();
  // A plate behind it, because on a small canvas the plot runs right up to the
  // edge and an unbacked hairline rule disappears into the grid.
  ctx.fillStyle = 'rgba(247, 244, 236, 0.72)';
  ctx.fillRect(x - 6, y - 11, px + 12, 28);
  ctx.strokeStyle = inkColour(light, 0.8);
  ctx.fillStyle = inkColour(light, 0.8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.lineTo(x + px, y - 5);
  ctx.stroke();
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`${metres} m`, x, y + 4);
  ctx.restore();
}

/** A sun glyph at the edge of the canvas, in the direction the light comes from. */
function drawSunMarker(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
  scene: Scene,
): void {
  const { light, site } = scene;
  if (light.altitude <= -6) return;
  // On a phone the plot fills the canvas edge to edge, so there is no "outside"
  // to put this in — it would land on the planting. The north dial in the site
  // panel shows the same thing, so drop it rather than obscure the design.
  if (height < 260 || width < 380) return;

  const angle = bearingToCanvas(light.azimuth, site.northAngle);
  const cx = width / 2;
  const cy = height / 2;

  // Ride the edge of the canvas rather than a circle inside it: a circle small
  // enough to fit the short axis lands the marker in the middle of the planting.
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const limitX = width / 2 - 30;
  const limitY = height / 2 - 34;
  const reach = Math.min(
    Math.abs(dx) < 1e-6 ? Infinity : limitX / Math.abs(dx),
    Math.abs(dy) < 1e-6 ? Infinity : limitY / Math.abs(dy),
  );
  const x = cx + dx * reach;
  const y = cy + dy * reach;
  const r = 9 + 5 * Math.max(0, Math.min(1, light.altitude / 60));

  ctx.save();
  ctx.globalAlpha = light.altitude > 0 ? 0.95 : 0.5;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  glow.addColorStop(0, `rgba(255, 224, 150, ${0.55 * light.daylight + 0.1})`);
  glow.addColorStop(1, 'rgba(255, 224, 150, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = light.altitude > 0 ? 'rgba(246, 200, 92, 1)' : 'rgba(150, 150, 178, 0.9)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = inkColour(light, 0.5);
  ctx.lineWidth = 1;
  roughCurve(ctx, blobPoints(x, y, r, r, [1, 1, 1, 1, 1, 1, 1, 1, 1]), true, subSeed(7, 3), {
    roughness: 0.5,
    passes: 1,
  });

  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = inkColour(light, 0.7);
  ctx.fillText(
    light.altitude > 0 ? `${Math.round(light.altitude)}°` : 'below horizon',
    x,
    y + r + 13,
  );
  ctx.restore();
  void viewport;
}
