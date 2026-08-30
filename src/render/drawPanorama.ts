import { getSpecies } from '../model/plants';
import { phaseAt } from '../model/phenology';
import { plantAge, sizeAt } from '../model/growth';
import { bearingToCanvas } from '../model/sun';
import { pointInPolygon } from '../model/geometry';
import {
  angleDelta,
  compassMarks,
  effectiveFov,
  eyeElevation,
  isInView,
  pixelsPerDegree,
  sight,
  type Observer,
} from '../model/panorama';
import { groundOffsetAt, segmentsOf } from '../model/structures';
import type { PlantInstance, Plot, Site, TimeState, Structure } from '../model/types';
import { inkColour, shade, type Lighting } from './palette';
import { getForm } from './form';
import { drawPlantElevation } from './plant';
import { roughLine } from './sketch';

/**
 * The 360° view.
 *
 * Everything here follows from one number: how many pixels one degree of arc is
 * worth. Horizontal position, apparent size and the height of the horizon all
 * come off it, which is what keeps the picture coherent as the viewer turns —
 * and what makes the projection a panorama rather than a scaled elevation.
 */

export interface PanoramaScene {
  plot: Plot;
  plants: PlantInstance[];
  structures: Structure[];
  site: Site;
  time: TimeState;
  light: Lighting;
  observer: Observer;
  selectedId: string | null;
  selectedStructureId: string | null;
}

import {
  drawStructurePanorama,
  panoramaFaces,
  type PanoramaFace,
} from './structure';

const DEG = Math.PI / 180;

export function drawPanorama(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: PanoramaScene,
): void {
  const { light, observer, site, time } = scene;

  const pxPerDeg = pixelsPerDegree(width, height, observer.fov);
  // What is really on screen, which is wider than asked for whenever the panel
  // is too short to hold the requested field at this scale.
  const fov = effectiveFov(width, height, observer.fov);
  // Tilting the head moves the horizon rather than the plants: the whole scene
  // is projected from the same eye point either way, so one offset does it.
  const horizonY = height * 0.6 + observer.pitch * pxPerDeg;
  const eye = eyeElevation(observer);

  drawSky(ctx, width, horizonY, light);
  drawGround(ctx, width, height, horizonY, light);
  drawSun(ctx, scene, fov, width, pxPerDeg, horizonY);
  drawPlotEdge(ctx, scene, fov, pxPerDeg, width, horizonY);

  // Far to near, so a nearby shrub genuinely hides the tree behind it.
  const visible = scene.plants
    .map((plant) => {
      const species = getSpecies(plant.speciesId);
      const size = sizeAt(species, plantAge(plant.plantedAge, time.year));
      const s = sight(observer, plant, site);
      return { plant, species, size, sighting: s };
    })
    .filter((item) => isInView(item.sighting, item.size.spread, fov))
    .sort((a, b) => b.sighting.distance - a.sighting.distance);

  const faces = panoramaFaces(scene.structures, observer, segmentsOf).sort(
    (a, b) => b.distance - a.distance,
  );

  // One depth order across planting and built work: a wall can be in front of
  // one shrub and behind another, and drawing all the walls first would make
  // every wall either always in front or always behind.
  type Item =
    | { sort: number; kind: 'plant'; value: (typeof visible)[number] }
    | { sort: number; kind: 'face'; value: PanoramaFace };
  const ordered: Item[] = [
    ...visible.map((value) => ({ sort: value.sighting.distance, kind: 'plant' as const, value })),
    ...faces.map((value) => ({ sort: value.distance, kind: 'face' as const, value })),
  ].sort((a, b) => b.sort - a.sort);

  const project = (p: { x: number; y: number }) => {
    const s2 = sight(observer, p, site);
    return { offset: s2.offset, distance: s2.distance };
  };

  for (const entry of ordered) {
    if (entry.kind === 'face') {
      drawStructurePanorama(ctx, entry.value, {
        width,
        horizonY,
        pxPerDeg,
        fov,
        eye,
        light,
        selected: scene.selectedStructureId === entry.value.structure.id,
        project,
      });
      continue;
    }

    const item = entry.value;
    const { distance, offset } = item.sighting;
    const phase = phaseAt(item.species, time.doy, site);
    if (phase.dormant) continue;

    const x = width / 2 + offset * pxPerDeg;

    // Ground and top of the plant as true angles from a 1.6 m eye. Working in
    // angles rather than a flat scale is what puts the base of a near plant
    // below the base of a far one, so the ground reads as receding.
    // Standing in a raised bed lifts the plant, which lowers the eye relative to
    // it — the bed is why a border reads as raised from the terrace at all.
    const lift = groundOffsetAt(item.plant, scene.structures);
    const relativeEye = eye - lift;
    const baseAngle = (Math.atan2(relativeEye, distance) * 180) / Math.PI;
    const topAngle = (Math.atan2(item.size.height - relativeEye, distance) * 180) / Math.PI;
    const baseY = horizonY + baseAngle * pxPerDeg;
    const heightPx = (baseAngle + topAngle) * pxPerDeg;
    if (heightPx < 1.5) continue;

    const dc = { ctx, light, pxPerM: heightPx / Math.max(0.05, item.size.height) };

    ctx.save();
    // Air between you and a distant plant lightens it and takes out contrast.
    const haze = Math.min(0.5, distance / 90);
    ctx.globalAlpha = 1 - haze * 0.55;
    drawPlantElevation(
      dc,
      item.species,
      getForm(item.species, item.plant.seed),
      phase,
      item.size,
      x,
      baseY,
      phase.flowerAge,
      scene.selectedId === item.plant.id,
    );
    ctx.restore();
  }

  drawCompass(ctx, width, horizonY, observer, fov, pxPerDeg, light);

  if (visible.length === 0 && faces.length === 0) {
    ctx.fillStyle = inkColour(light, 0.6);
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      scene.plants.length
        ? 'Nothing in this direction — drag to turn, or move the viewpoint on the plan'
        : 'Add some plants to look at',
      width / 2,
      horizonY - 24,
    );
  }
}

function drawSky(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  light: Lighting,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(horizonY, 1));
  sky.addColorStop(0, light.skyTop);
  sky.addColorStop(1, light.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizonY);
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizonY: number,
  light: Lighting,
): void {
  // Darker underfoot than at the horizon, which is most of what sells a ground
  // plane without drawing a single perspective line on it.
  const ground = ctx.createLinearGradient(0, horizonY, 0, height);
  ground.addColorStop(0, shade('#cfc7ac', light, { value: 1.02, tintStrength: 0.6 }));
  ground.addColorStop(1, shade('#8f8a6f', light, { value: 0.92, tintStrength: 0.6 }));
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  ctx.strokeStyle = inkColour(light, 0.35);
  ctx.lineWidth = 1;
  roughLine(ctx, 0, horizonY, width, horizonY, 8181, { roughness: 1.2, passes: 1 });
}

/**
 * The plot boundary, projected. Without it you cannot tell where your own
 * garden stops, which is the first thing you want to know from a viewpoint.
 */
function drawPlotEdge(
  ctx: CanvasRenderingContext2D,
  scene: PanoramaScene,
  fov: number,
  pxPerDeg: number,
  width: number,
  horizonY: number,
): void {
  const { observer, plot, site, light } = scene;
  if (plot.length < 3) return;

  const inside = pointInPolygon({ x: observer.x, y: observer.y }, plot);
  ctx.save();
  ctx.strokeStyle = inkColour(light, inside ? 0.45 : 0.25);
  ctx.lineWidth = 1.5;
  ctx.setLineDash(inside ? [] : [5, 5]);

  for (let i = 0; i < plot.length; i++) {
    const a = plot[i];
    const b = plot[(i + 1) % plot.length];

    // Subdivided, because a straight line in plan is a curve in a cylindrical
    // projection — drawing it as one segment would cut the corner badly.
    const steps = 24;
    ctx.beginPath();
    let started = false;
    let previousOffset = 0;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const view = sight(observer, point, site);
      if (Math.abs(view.offset) > fov / 2 + 6) {
        started = false;
        continue;
      }
      const x = width / 2 + view.offset * pxPerDeg;
      const y =
        horizonY + ((Math.atan2(eyeElevation(observer), view.distance) * 180) / Math.PI) * pxPerDeg;

      // A segment passing behind the viewer wraps the seam; break the path.
      if (started && Math.abs(view.offset - previousOffset) > 60) started = false;
      previousOffset = view.offset;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  scene: PanoramaScene,
  fov: number,
  width: number,
  pxPerDeg: number,
  horizonY: number,
): void {
  const { light, observer } = scene;
  if (light.altitude <= -2) return;

  const offset = angleDelta(observer.heading, light.azimuth);
  if (Math.abs(offset) > fov / 2 + 4) return;

  const x = width / 2 + offset * pxPerDeg;
  const y = horizonY - light.altitude * pxPerDeg;
  const r = Math.max(6, pxPerDeg * 0.9);

  ctx.save();
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 6);
  glow.addColorStop(0, `rgba(255, 226, 156, ${0.5 * light.daylight + 0.08})`);
  glow.addColorStop(1, 'rgba(255, 226, 156, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = light.altitude > 0 ? 'rgba(252, 226, 140, 0.95)' : 'rgba(214, 178, 150, 0.7)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Bearings along the horizon, so you always know which way you are facing. */
function drawCompass(
  ctx: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  observer: Observer,
  fov: number,
  pxPerDeg: number,
  light: Lighting,
): void {
  ctx.save();
  ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const mark of compassMarks()) {
    const offset = angleDelta(observer.heading, mark.bearing);
    if (Math.abs(offset) > fov / 2) continue;
    const x = width / 2 + offset * pxPerDeg;
    const major = mark.label.length === 1;

    ctx.strokeStyle = inkColour(light, major ? 0.4 : 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, horizonY - (major ? 9 : 5));
    ctx.lineTo(x, horizonY);
    ctx.stroke();

    ctx.fillStyle = inkColour(light, major ? 0.75 : 0.45);
    ctx.fillText(mark.label, x, horizonY + 3);
  }
  ctx.restore();
}

/** Where the viewer stands and what they can see, drawn on the plan. */
export function drawObserverOnPlan(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  observer: Observer,
  site: Site,
  scale: number,
  renderedFov: number,
): void {
  const facing = bearingToCanvas(observer.heading, site.northAngle);
  const half = (renderedFov / 2) * DEG;
  const reach = Math.max(70, scale * 9);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(screen.x, screen.y);
  ctx.arc(screen.x, screen.y, reach, facing - half, facing + half);
  ctx.closePath();
  const cone = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, reach);
  cone.addColorStop(0, 'rgba(63, 128, 176, 0.30)');
  cone.addColorStop(1, 'rgba(63, 128, 176, 0)');
  ctx.fillStyle = cone;
  ctx.fill();

  ctx.strokeStyle = 'rgba(63, 128, 176, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#3f80b0';
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // A nose on the marker, so the facing is readable at a glance.
  ctx.beginPath();
  ctx.moveTo(screen.x + Math.cos(facing) * 15, screen.y + Math.sin(facing) * 15);
  ctx.lineTo(screen.x + Math.cos(facing + 2.4) * 7, screen.y + Math.sin(facing + 2.4) * 7);
  ctx.lineTo(screen.x + Math.cos(facing - 2.4) * 7, screen.y + Math.sin(facing - 2.4) * 7);
  ctx.closePath();
  ctx.fillStyle = '#3f80b0';
  ctx.fill();
  ctx.restore();
}
