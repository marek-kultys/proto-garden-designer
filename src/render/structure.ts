import { footprints, sweptPolygons } from '../model/structures';
import { shadowCastOnSlope, type Terrain } from '../model/terrain';
import { DRAWN_SHADOW_CAP } from './constants';
import { pointInPolygon } from '../model/geometry';
import { shadowLengthFactor } from '../model/sun';
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
  terrain: Terrain,
): void {
  if (shadowLengthFactor(light.altitude) <= 0) return;
  // The same reach the sun map uses, capped for drawing — so a wall's shadow on
  // the plan lengthens downhill exactly as the overlay says it does.
  const cast = shadowCastOnSlope(terrain, light.altitude, light.azimuth, site.northAngle);
  const factor = Math.min(DRAWN_SHADOW_CAP, cast.reach);
  const ux = cast.ux;
  const uy = cast.uy;

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

    /*
     * A bed is drawn once, whole, by `panoramaBeds` — never as separate walls.
     *
     * There was a pass here that redrew a bed's front walls on top of it, to
     * put the near wall ahead of the planting. It was not needed: a plant is
     * drawn upward from its base on the soil and never reaches below it, so it
     * cannot cover the wall in front of it. And it did real harm on the shapes
     * people actually draw — on a concave outline the test for "facing the
     * viewer" also passes for segments round the back, each of which was then
     * drawn as a full-height wall at its own distance and outlined. The result
     * was a bed panelled with seams and stacked into phantom tiers.
     */
    if (structure.kind === 'bed') continue;

    for (const seg of segmentsFor(structure)) {
      const mx = (seg.a.x + seg.b.x) / 2 - observer.x;
      const my = (seg.a.y + seg.b.y) / 2 - observer.y;
      faces.push({ structure, a: seg.a, b: seg.b, distance: Math.hypot(mx, my) });
    }
  }
  return faces;
}

export interface PanoramaBed {
  structure: Structure;
  polygon: Vec2[];
  /** Distance to the far edge; plants standing in it are nearer, so draw after. */
  distance: number;
}

/**
 * A raised bed, taken as one solid thing rather than a set of separate walls.
 *
 * The earlier attempt drew each side and hid the ones facing away. That works
 * for a rectangle and fails for the shapes people actually draw: a bed clicked
 * out freehand has a dozen corners and is usually concave, and on a concave
 * shape "facing away" is not the same as "hidden". Sides that were needed got
 * dropped, leaving holes you could see the garden through — the bed read as
 * empty, and a plant standing over a hole had neither wall nor soil beneath it.
 *
 * Drawing the whole mass in one piece removes the question. There is no inside
 * to leak through, whatever shape the bed is.
 */
export function panoramaBeds(
  structures: Structure[],
  observer: { x: number; y: number },
): PanoramaBed[] {
  const beds: PanoramaBed[] = [];
  for (const structure of structures) {
    if (structure.kind !== 'bed' || structure.height <= 0) continue;
    if (structure.points.length < 3) continue;
    let far = 0;
    for (const p of structure.points) {
      const d = Math.hypot(p.x - observer.x, p.y - observer.y);
      if (d > far) far = d;
    }
    beds.push({ structure, polygon: structure.points, distance: far });
  }

  // Where two beds overlap, the taller holds the soil and must be drawn last,
  // or a plant given the taller bed's height hangs above the shorter's surface.
  for (const bed of beds) {
    for (const other of beds) {
      if (other === bed) continue;
      if (other.structure.height <= bed.structure.height) continue;
      if (!overlaps(bed.polygon, other.polygon)) continue;
      bed.distance = Math.max(bed.distance, other.distance + 0.01);
    }
  }

  return beds;
}

/** A whole bed: sides and soil, drawn as one shape that cannot have gaps. */
export function drawBedPanorama(
  ctx: CanvasRenderingContext2D,
  bed: PanoramaBed,
  opts: PanoramaFaceOptions,
): void {
  const { width, horizonY, pxPerDeg, fov, eye, light, selected, project, groundHeight } = opts;
  // Measured from the ground the bed stands on, not from the datum.
  const foot = eye - groundHeight;
  const height = bed.structure.height;
  const polygon = bed.polygon;

  const samples = polygon.map((p) => project(p));
  const angles = unwrapped(samples.map((s) => s.offset));

  const tops: Vec2[] = [];
  const bases: Vec2[] = [];
  let anyInView = false;

  for (let i = 0; i < samples.length; i += 1) {
    const offset = angles[i];
    const distance = samples[i].distance;
    if (Math.abs(offset) <= fov / 2 + 30) anyInView = true;
    const x = width / 2 + offset * pxPerDeg;
    tops.push({ x, y: horizonY - ((Math.atan2(height - foot, distance) * 180) / Math.PI) * pxPerDeg });
    bases.push({ x, y: horizonY + ((Math.atan2(foot, distance) * 180) / Math.PI) * pxPerDeg });
  }
  if (!anyInView) return;

  // The mass: every side, plus the soil, in one path. Wound the same way so a
  // nonzero fill unions them instead of cancelling where they overlap.
  const mass = new Path2D();
  for (let i = 0; i < polygon.length; i += 1) {
    const j = (i + 1) % polygon.length;
    mass.addPath(pathOf(sameWinding([tops[i], tops[j], bases[j], bases[i]])));
  }
  mass.addPath(pathOf(sameWinding(tops)));

  /*
   * Distance is paid for in colour, not in transparency.
   *
   * Fading a bed with globalAlpha makes it see-through: a bed behind shows
   * through a bed in front, so two that are yards apart look as though they
   * overlap, and the soil reads as washed out and empty. A bed is a solid
   * thing. It is lightened towards the haze with distance and stays opaque.
   */
  const haze = Math.min(0.5, bed.distance / 90);
  ctx.save();

  ctx.fillStyle = shade(BED_SOIL, light, { value: 0.94 + haze * 0.42 });
  ctx.fill(mass);

  // The soil surface on top of it, lit from above so it reads as the face you
  // can plant into rather than another wall.
  const soil = pathOf(tops);
  ctx.fillStyle = shade(BED_SOIL, light, { value: 1.12 + haze * 0.42 });
  ctx.fill(soil);

  // Only the soil's edge is drawn. Stroking the mass would draw every seam
  // between one side and the next, and an eleven-cornered bed would come out
  // looking like a fence rather than a solid block of earth.
  ctx.strokeStyle = inkColour(light, selected ? 0.95 : 0.55);
  ctx.lineWidth = selected ? 2.2 : 1.2;
  ctx.stroke(soil);
  ctx.restore();
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
  /** Height of the eye above the datum. */
  eye: number;
  /**
   * Height of the ground this structure stands on, above the datum.
   *
   * Zero on a level garden. Without it a wall or bed was drawn as though the
   * ground were always flat, while the plants standing in it rose with the
   * hillside — so on a slope a plant floated above its own bed by exactly the
   * height of the ground beneath them both.
   */
  groundHeight: number;
  light: Lighting;
  selected: boolean;
  /** Where a plot point sits relative to the viewer. */
  project: (p: Vec2) => FaceProjection;
}


/**
 * Angles along a run, kept continuous instead of wrapping at the back.
 *
 * `offset` comes back in (-180, 180], so a face that passes behind the viewer
 * jumps from about +170 to -170 between one sample and the next. Joining those
 * two points draws a band straight across the whole view: stand near a wall,
 * turn your back on it, and it covers everything in front of you.
 *
 * Unwrapping keeps each sample within half a turn of the one before, so a run
 * behind you stays at a large angle and lands harmlessly off-screen, while one
 * passing beside you crosses the edge of the frame smoothly.
 */
function unwrapped(offsets: number[]): number[] {
  const out: number[] = [];
  let previous: number | null = null;
  for (const raw of offsets) {
    let angle = raw;
    if (previous !== null) {
      while (angle - previous > 180) angle -= 360;
      while (angle - previous < -180) angle += 360;
    }
    previous = angle;
    out.push(angle);
  }
  return out;
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
  const { width, horizonY, pxPerDeg, fov, eye, light, selected, project, groundHeight } = opts;
  const foot = eye - groundHeight;
  const height = face.structure.height;

  const samples: { offset: number; distance: number }[] = [];
  for (let i = 0; i <= FACE_SAMPLES; i += 1) {
    const t = i / FACE_SAMPLES;
    samples.push(
      project({
        x: face.a.x + (face.b.x - face.a.x) * t,
        y: face.a.y + (face.b.y - face.a.y) * t,
      }),
    );
  }
  const angles = unwrapped(samples.map((s) => s.offset));

  const tops: Vec2[] = [];
  const bases: Vec2[] = [];
  let anyInView = false;

  for (let i = 0; i < samples.length; i += 1) {
    const offset = angles[i];
    const distance = samples[i].distance;
    // Generous margin: a wall whose centre has swung out of frame still has an
    // end in it, and dropping it early makes it flick away as you turn.
    if (Math.abs(offset) <= fov / 2 + 30) anyInView = true;

    const x = width / 2 + offset * pxPerDeg;
    const baseAngle = (Math.atan2(foot, distance) * 180) / Math.PI;
    const topAngle = (Math.atan2(height - foot, distance) * 180) / Math.PI;
    bases.push({ x, y: horizonY + baseAngle * pxPerDeg });
    tops.push({ x, y: horizonY - topAngle * pxPerDeg });
  }

  if (!anyInView) return;

  const isWall = face.structure.kind === 'wall';
  // Distance in colour rather than transparency, for the same reason as the
  // beds: a wall you can see through is not a wall.
  const haze = Math.min(0.5, face.distance / 90);

  ctx.save();

  const path = new Path2D();
  path.moveTo(tops[0].x, tops[0].y);
  for (const p of tops) path.lineTo(p.x, p.y);
  for (let i = bases.length - 1; i >= 0; i -= 1) path.lineTo(bases[i].x, bases[i].y);
  path.closePath();

  ctx.fillStyle = shade(isWall ? WALL_FACE : BED_SOIL, light, { value: 0.94 + haze * 0.42 });
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

/**
 * The top of a structure: the soil surface of a raised bed, or the coping of a
 * wall low enough to look down on.
 *
 * Without this a bed is four upright faces with nothing between them, and the
 * garden shows straight through the middle of it — an empty trough rather than
 * something filled to its own height.
 */
export interface PanoramaTop {
  structure: Structure;
  polygon: Vec2[];
  /**
   * Distance to the far edge, not the near one.
   *
   * The surface is drawn early, with the back of the bed, so that anything
   * standing in it — and the near face in front of it — is painted over the
   * top. Sorting it by its nearest corner instead would lay the soil over the
   * plants growing out of it.
   */
  distance: number;
}

/** Do these two footprints share any ground? Approximate, and cheap. */
function overlaps(a: Vec2[], b: Vec2[]): boolean {
  const centroid = (poly: Vec2[]) => ({
    x: poly.reduce((t, p) => t + p.x, 0) / poly.length,
    y: poly.reduce((t, p) => t + p.y, 0) / poly.length,
  });
  if (a.some((p) => pointInPolygon(p, b))) return true;
  if (b.some((p) => pointInPolygon(p, a))) return true;
  // One wholly inside the other, with no vertex of either inside the other's
  // edges — a small bed centred in a big one.
  return pointInPolygon(centroid(a), b) || pointInPolygon(centroid(b), a);
}

export function panoramaTops(
  structures: Structure[],
  observer: { x: number; y: number },
  eye: number,
): PanoramaTop[] {
  const tops: PanoramaTop[] = [];
  for (const structure of structures) {
    // Beds carry their own soil surface; this is the coping of a low wall.
    if (structure.kind === 'bed') continue;
    // Nothing to see: you are not above it, so the top is edge-on or hidden.
    if (structure.height <= 0 || structure.height >= eye) continue;
    for (const polygon of footprints(structure)) {
      let far = 0;
      for (const p of polygon) {
        const d = Math.hypot(p.x - observer.x, p.y - observer.y);
        if (d > far) far = d;
      }
      tops.push({ structure, polygon, distance: far });
    }
  }

  /**
   * Where two beds overlap, the taller one holds the soil, and that is the
   * height a plant standing there is given. The drawing has to agree, or the
   * plant hangs in the air above the shorter bed's surface — which is exactly
   * what happens with beds drawn by hand, since those overlap by a few
   * centimetres almost every time.
   *
   * Done by pushing the shorter one further away rather than by sorting tops
   * among themselves, so their order against the plants and walls — which is
   * genuinely a question of distance — is left alone.
   */
  for (const top of tops) {
    for (const other of tops) {
      if (other === top) continue;
      if (other.structure.height <= top.structure.height) continue;
      if (!overlaps(top.polygon, other.polygon)) continue;
      top.distance = Math.max(top.distance, other.distance + 0.01);
    }
  }

  return tops;
}

/** How finely each edge of a top surface is sampled, for the same curve reason. */
const TOP_EDGE_SAMPLES = 10;

export function drawStructureTopPanorama(
  ctx: CanvasRenderingContext2D,
  top: PanoramaTop,
  opts: PanoramaFaceOptions,
): void {
  const { width, horizonY, pxPerDeg, fov, eye, light, selected, project, groundHeight } = opts;
  const foot = eye - groundHeight;
  const height = top.structure.height;
  const polygon = top.polygon;
  if (polygon.length < 3) return;

  const samples: { offset: number; distance: number }[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (let s = 0; s < TOP_EDGE_SAMPLES; s += 1) {
      const t = s / TOP_EDGE_SAMPLES;
      samples.push(project({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
    }
  }
  const angles = unwrapped(samples.map((s) => s.offset));

  const outline: Vec2[] = [];
  let anyInView = false;
  for (let i = 0; i < samples.length; i += 1) {
    const offset = angles[i];
    if (Math.abs(offset) <= fov / 2 + 30) anyInView = true;
    // height is below the eye by construction, so this angle is negative and
    // the surface lands below the horizon — which is what looking down is.
    const angle = (Math.atan2(height - foot, samples[i].distance) * 180) / Math.PI;
    outline.push({
      x: width / 2 + offset * pxPerDeg,
      y: horizonY - angle * pxPerDeg,
    });
  }
  if (!anyInView) return;

  const path = new Path2D();
  path.moveTo(outline[0].x, outline[0].y);
  for (const p of outline) path.lineTo(p.x, p.y);
  path.closePath();

  ctx.save();
  const haze = Math.min(0.5, top.distance / 90);
  // Lit from above, so the top is the brighter face of the same material.
  ctx.fillStyle = shade(top.structure.kind === 'wall' ? WALL_TOP : BED_SOIL, light, {
    value: (top.structure.kind === 'wall' ? 1.04 : 1.12) + haze * 0.42,
  });
  ctx.fill(path);
  ctx.strokeStyle = inkColour(light, selected ? 0.9 : 0.55);
  ctx.lineWidth = selected ? 2 : 1.1;
  ctx.stroke(path);
  ctx.restore();
}
