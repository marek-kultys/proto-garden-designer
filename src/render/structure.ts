import { footprints, sweptPolygons } from '../model/structures';
import { bearingToCanvas, shadowLengthFactor } from '../model/sun';
import type { Site, Structure, Vec2 } from '../model/types';
import { inkColour, shade, type Lighting } from './palette';
import { roughLine, roughPolygon, subSeed } from './sketch';
import { toScreen, type Viewport } from './viewport';

/**
 * Drawing the built parts of a garden.
 *
 * Walls and raised beds are the one thing here that is not alive, and they are
 * drawn to say so: straight lines rather than the wobble the planting gets, and
 * flat mineral colours rather than the palette's greens. The sketchy stroke is
 * kept, at a much lower roughness, so they still belong to the same drawing.
 */

/** Mineral, not vegetable — deliberately outside the plant palette's greens. */
const WALL_FACE = '#cbc3b4';
const WALL_TOP = '#ded7c9';
const BED_SOIL = '#6b5b48';

/** A wall's linework is straighter than a plant's; it was built, not grown. */
const BUILT_ROUGHNESS = 0.35;

function screenPoly(viewport: Viewport, poly: Vec2[]): Vec2[] {
  return poly.map((p) => toScreen(viewport, p));
}

function pathOf(poly: Vec2[]): Path2D {
  const path = new Path2D();
  if (poly.length === 0) return path;
  path.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i += 1) path.lineTo(poly[i].x, poly[i].y);
  path.closePath();
  return path;
}

/** Twice the signed area; negative means the points wind the other way. */
function signedArea(poly: Vec2[]): number {
  let total = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    total += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return total;
}

/**
 * All subpaths wound the same way.
 *
 * This looks like tidiness and is not. The swept shadow is filled as one path
 * so that overlapping parts do not double-darken — but a nonzero fill *cancels*
 * where two subpaths of opposite winding overlap, and the side quads a sweep
 * produces wind against the footprint they came from. Left alone, a wall's
 * shadow rubs itself out almost entirely: the model says the garden is shaded
 * and the drawing shows bare grass.
 */
function sameWinding(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

/**
 * The shadow a structure throws on the plan.
 *
 * Every swept polygon goes into one path and is filled once. Filling them
 * separately would double-darken everywhere two overlapped, and a wall's own
 * segments overlap at every corner — the joins would read as bright spots in
 * the middle of a shadow.
 */
export function drawStructureShadowPlan(
  ctx: CanvasRenderingContext2D,
  structures: Structure[],
  viewport: Viewport,
  light: Lighting,
  site: Site,
): void {
  const factor = shadowLengthFactor(light.altitude);
  if (factor <= 0) return;
  const angle = bearingToCanvas(light.azimuth + 180, site.northAngle);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  const path = new Path2D();
  let any = false;

  for (const structure of structures) {
    const drop = Math.min(60, structure.height * factor);
    if (drop <= 0) continue;
    for (const foot of footprints(structure)) {
      for (const part of sweptPolygons(foot, ux * drop, uy * drop)) {
        const pts = screenPoly(viewport, part);
        if (pts.length < 3) continue;
        path.addPath(pathOf(sameWinding(pts)));
        any = true;
      }
    }
  }
  if (!any) return;

  ctx.save();
  ctx.filter = `blur(${light.shadowBlur.toFixed(1)}px)`;
  // Solid, so darker than a canopy's dappled shadow at the same alpha.
  ctx.fillStyle = `rgba(46, 54, 78, ${(light.shadowAlpha * 0.95).toFixed(3)})`;
  ctx.fill(path);
  ctx.restore();
}

/** A structure seen from above. */
export function drawStructurePlan(
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  viewport: Viewport,
  light: Lighting,
  selected: boolean,
): void {
  const feet = footprints(structure);
  if (feet.length === 0) return;

  const isWall = structure.kind === 'wall';
  // A taller wall reads darker from above, which is the only cue plan view has
  // for height at all.
  const lift = isWall ? Math.min(1, structure.height / 4) : Math.min(1, structure.height / 1.2);
  const face = isWall
    ? shade(WALL_TOP, light, { value: 1 - lift * 0.18 })
    : shade(BED_SOIL, light, { value: 0.92 + lift * 0.1 });

  ctx.save();
  for (const foot of feet) {
    const pts = screenPoly(viewport, foot);
    if (pts.length < 3) continue;
    ctx.fillStyle = face;
    ctx.fill(pathOf(pts));
  }

  ctx.strokeStyle = inkColour(light, selected ? 0.95 : 0.8);
  ctx.lineWidth = selected ? 2.4 : 1.6;
  ctx.lineCap = 'round';
  let seedStep = 0;
  for (const foot of feet) {
    const pts = screenPoly(viewport, foot);
    if (pts.length < 3) continue;
    seedStep += 1;
    roughPolygon(ctx, pts, subSeed(structure.seed, seedStep), {
      roughness: BUILT_ROUGHNESS,
      passes: 1,
    });
  }
  ctx.restore();

  if (selected) drawSelection(ctx, structure, viewport);
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  structure: Structure,
  viewport: Viewport,
): void {
  ctx.save();
  ctx.strokeStyle = '#3f80b0';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  // The centre line rather than the outline: it shows where the run actually
  // goes, which is what you grab to move it.
  const pts = screenPoly(viewport, structure.points);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  if (structure.kind === 'bed') ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);

  for (const p of pts) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#3f80b0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export interface StructureSlice {
  structure: Structure;
  /** Metres along the sight line, from A. */
  fromAlong: number;
  toAlong: number;
  /** Signed metres to the side; positive is behind. Used for depth order. */
  offset: number;
}

/**
 * Where a structure crosses the elevation's slice, if it does.
 *
 * A wall running across the sight line appears as a short block; one running
 * along it appears as a long low run. Both are true, and both are what a
 * designer means by "the wall in that view".
 */
export function sliceStructure(
  structure: Structure,
  a: Vec2,
  b: Vec2,
  band: number,
): StructureSlice | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  const projected = structure.points.map((p) => {
    const px = p.x - a.x;
    const py = p.y - a.y;
    return { along: px * ux + py * uy, offset: px * -uy + py * ux };
  });

  const near = projected.filter((p) => Math.abs(p.offset) <= band);
  if (near.length === 0) {
    // A run may cross the band without either end sitting inside it.
    const crossing = projected.some(
      (p, i) => i > 0 && Math.sign(p.offset) !== Math.sign(projected[i - 1].offset),
    );
    if (!crossing) return null;
    const alls = projected.map((p) => p.along);
    return {
      structure,
      fromAlong: Math.min(...alls),
      toAlong: Math.max(...alls),
      offset: projected.reduce((t, p) => t + p.offset, 0) / projected.length,
    };
  }

  const alongs = near.map((p) => p.along);
  const half = structure.kind === 'wall' ? structure.thickness / 2 : 0;
  return {
    structure,
    fromAlong: Math.min(...alongs) - half,
    toAlong: Math.max(...alongs) + half,
    offset: near.reduce((t, p) => t + p.offset, 0) / near.length,
  };
}

/** A structure drawn side-on, standing on the ground line. */
export function drawStructureElevation(
  ctx: CanvasRenderingContext2D,
  slice: StructureSlice,
  originX: number,
  groundY: number,
  pxPerM: number,
  light: Lighting,
  selected: boolean,
): void {
  const { structure } = slice;
  const x0 = originX + slice.fromAlong * pxPerM;
  const x1 = originX + slice.toAlong * pxPerM;
  // A wall seen end-on is still a wall; give it its thickness rather than
  // letting it vanish to a hairline.
  const width = Math.max(structure.thickness * pxPerM, x1 - x0);
  const height = structure.height * pxPerM;
  const top = groundY - height;

  const isWall = structure.kind === 'wall';
  ctx.save();
  ctx.fillStyle = shade(isWall ? WALL_FACE : BED_SOIL, light, { value: 0.98 });
  ctx.fillRect(x0, top, width, height);

  if (isWall) {
    // A coping course along the top, which is what tells you it is a wall and
    // not a doorway, at any size the strip is likely to be.
    const coping = Math.max(2, Math.min(6, height * 0.09));
    ctx.fillStyle = shade(WALL_TOP, light, { value: 1.02 });
    ctx.fillRect(x0 - 1, top, width + 2, coping);
  }

  ctx.strokeStyle = inkColour(light, selected ? 0.95 : 0.75);
  ctx.lineWidth = selected ? 2.2 : 1.4;
  roughLine(ctx, x0, top, x0 + width, top, subSeed(structure.seed, 11), {
    roughness: BUILT_ROUGHNESS,
    passes: 1,
  });
  roughLine(ctx, x0, top, x0, groundY, subSeed(structure.seed, 12), {
    roughness: BUILT_ROUGHNESS,
    passes: 1,
  });
  roughLine(ctx, x0 + width, top, x0 + width, groundY, subSeed(structure.seed, 13), {
    roughness: BUILT_ROUGHNESS,
    passes: 1,
  });
  ctx.restore();
}

// ------------------------------------------------------------------ 360° view

export interface PanoramaFace {
  structure: Structure;
  a: Vec2;
  b: Vec2;
  /** Mean distance from the eye, for depth ordering against the planting. */
  distance: number;
}

/**
 * A structure's vertical faces, as seen from a viewpoint.
 *
 * Both kinds are drawn the same way — as upright faces standing on their run.
 * A bed is simply four low ones, which is what a raised bed looks like from a
 * standing eye: you see its sides, not its plan.
 */
export function panoramaFaces(
  structures: Structure[],
  observer: { x: number; y: number },
  segmentsFor: (s: Structure) => { a: Vec2; b: Vec2 }[],
): PanoramaFace[] {
  const faces: PanoramaFace[] = [];
  for (const structure of structures) {
    if (structure.height <= 0) continue;
    for (const seg of segmentsFor(structure)) {
      const mx = (seg.a.x + seg.b.x) / 2 - observer.x;
      const my = (seg.a.y + seg.b.y) / 2 - observer.y;
      faces.push({ structure, a: seg.a, b: seg.b, distance: Math.hypot(mx, my) });
    }
  }
  return faces;
}

export interface FaceProjection {
  /** Signed degrees from the centre of view. */
  offset: number;
  /** Metres from the eye. */
  distance: number;
}

export interface PanoramaFaceOptions {
  width: number;
  horizonY: number;
  pxPerDeg: number;
  fov: number;
  /** Height of the eye above the ground the structure stands on. */
  eye: number;
  light: Lighting;
  selected: boolean;
  /** Where a plot point sits relative to the viewer. */
  project: (p: Vec2) => FaceProjection;
}

/** How finely a run is sampled; a straight wall is a curve in this projection. */
const FACE_SAMPLES = 28;

/**
 * One upright face, drawn as a filled band between its top and bottom edges.
 *
 * Sampled along its length rather than drawn as a flat quad: the projection maps
 * angle linearly to pixels, so a straight wall is genuinely a curve on screen,
 * and a two-point quad would cut the corner — visibly, on anything close.
 */
export function drawStructurePanorama(
  ctx: CanvasRenderingContext2D,
  face: PanoramaFace,
  opts: PanoramaFaceOptions,
): void {
  const { width, horizonY, pxPerDeg, fov, eye, light, selected, project } = opts;
  const height = face.structure.height;

  const tops: Vec2[] = [];
  const bases: Vec2[] = [];
  let anyInView = false;

  for (let i = 0; i <= FACE_SAMPLES; i += 1) {
    const t = i / FACE_SAMPLES;
    const point = {
      x: face.a.x + (face.b.x - face.a.x) * t,
      y: face.a.y + (face.b.y - face.a.y) * t,
    };
    const { offset, distance } = project(point);
    // Generous margin: a wall whose centre has swung out of frame still has an
    // end in it, and dropping it early makes it flick away as you turn.
    if (Math.abs(offset) <= fov / 2 + 30) anyInView = true;

    const x = width / 2 + offset * pxPerDeg;
    const baseAngle = (Math.atan2(eye, distance) * 180) / Math.PI;
    const topAngle = (Math.atan2(height - eye, distance) * 180) / Math.PI;
    bases.push({ x, y: horizonY + baseAngle * pxPerDeg });
    tops.push({ x, y: horizonY - topAngle * pxPerDeg });
  }

  if (!anyInView) return;

  const isWall = face.structure.kind === 'wall';
  // Faces away from the light read darker, which is most of what makes a wall
  // look solid rather than like a painted line.
  const haze = Math.min(0.5, face.distance / 90);

  ctx.save();
  ctx.globalAlpha = 1 - haze * 0.55;

  const path = new Path2D();
  path.moveTo(tops[0].x, tops[0].y);
  for (const p of tops) path.lineTo(p.x, p.y);
  for (let i = bases.length - 1; i >= 0; i -= 1) path.lineTo(bases[i].x, bases[i].y);
  path.closePath();

  ctx.fillStyle = shade(isWall ? WALL_FACE : BED_SOIL, light, { value: 0.94 });
  ctx.fill(path);

  ctx.strokeStyle = inkColour(light, selected ? 0.95 : 0.7);
  ctx.lineWidth = selected ? 2.2 : 1.3;
  ctx.stroke(path);

  if (isWall) {
    // The coping, which is the cue that reads as "wall" at a glance.
    ctx.strokeStyle = shade(WALL_TOP, light, { value: 1.05 });
    ctx.lineWidth = Math.max(1.5, Math.min(5, (tops[0].y - bases[0].y) * -0.05));
    ctx.beginPath();
    ctx.moveTo(tops[0].x, tops[0].y);
    for (const p of tops) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  ctx.restore();
}
