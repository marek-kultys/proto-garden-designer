import type { Vec2 } from '../model/types';

/**
 * Hand-drawn linework on a canvas.
 *
 * Every primitive takes an explicit `seed` and builds its own generator from it,
 * rather than drawing from a shared stream. That matters more than it looks: if
 * the wobble depended on the order calls happen to be made, then adding one leaf
 * cluster as the season slider moves would reshuffle the randomness of every
 * stroke after it, and the whole drawing would boil and crawl while you dragged.
 * Seeding per stroke means a given line is the same line on every frame.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a stable child seed, so one form can seed many independent strokes. */
export function subSeed(seed: number, index: number): number {
  return (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
}

export interface RoughOpts {
  roughness?: number;
  passes?: number;
}

export function roughLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  opts: RoughOpts = {},
): void {
  const rng = mulberry32(seed);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const r = (opts.roughness ?? 1) * Math.min(3.5, len * 0.035 + 0.5);
  const passes = opts.passes ?? 2;

  for (let p = 0; p < passes; p++) {
    const j = () => (rng() - 0.5) * 2 * r;
    ctx.beginPath();
    ctx.moveTo(x1 + j() * 0.5, y1 + j() * 0.5);
    ctx.quadraticCurveTo(
      (x1 + x2) / 2 + j() * 1.4,
      (y1 + y2) / 2 + j() * 1.4,
      x2 + j() * 0.5,
      y2 + j() * 0.5,
    );
    ctx.stroke();
  }
}

type PathSink = CanvasRenderingContext2D | Path2D;

/** Trace a smooth Catmull-Rom curve through the points. */
export function traceCurve(sink: PathSink, pts: Vec2[], closed: boolean): void {
  const n = pts.length;
  if (n < 2) return;
  const at = (i: number) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);

  sink.moveTo(pts[0].x, pts[0].y);
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    sink.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
  if (closed) sink.closePath();
}

export function curvePath(pts: Vec2[], closed: boolean): Path2D {
  const path = new Path2D();
  traceCurve(path, pts, closed);
  return path;
}

/**
 * Points around an ellipse, pushed in and out by a per-plant wobble profile so
 * canopies read as organic rather than as circles.
 */
export function blobPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  wobble: number[],
  rotation = 0,
): Vec2[] {
  const n = wobble.length;
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rotation;
    pts.push({
      x: cx + Math.cos(a) * rx * wobble[i],
      y: cy + Math.sin(a) * ry * wobble[i],
    });
  }
  return pts;
}

/**
 * Stroke a polygon edge by edge, keeping its corners.
 *
 * A plot boundary is surveyed, not sketched: it has straight runs and definite
 * corners. Passing it through the curve tracer rounds every corner off and, with
 * only four points, turns a rectangle into a blob well outside the real
 * boundary — so straight edges get their own path.
 */
export function roughPolygon(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  seed: number,
  opts: RoughOpts = {},
): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    roughLine(ctx, a.x, a.y, b.x, b.y, subSeed(seed, i), opts);
  }
}

/** Stroke a closed or open curve twice with slight offsets, like a pen going round. */
export function roughCurve(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  closed: boolean,
  seed: number,
  opts: RoughOpts = {},
): void {
  const passes = opts.passes ?? 2;
  const roughness = opts.roughness ?? 1;
  for (let p = 0; p < passes; p++) {
    const rng = mulberry32(subSeed(seed, p));
    const jittered = pts.map((pt) => ({
      x: pt.x + (rng() - 0.5) * 2 * roughness,
      y: pt.y + (rng() - 0.5) * 2 * roughness,
    }));
    ctx.beginPath();
    traceCurve(ctx, jittered, closed);
    ctx.stroke();
  }
}

export interface HachureOpts extends RoughOpts {
  /** Degrees. */
  angle?: number;
  /** Pixels between lines. */
  gap?: number;
}

/**
 * Sketchy shading inside a shape: parallel strokes clipped to the path, the way
 * you would fill an area with a pen rather than a brush.
 */
export function hachure(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bounds: { x: number; y: number; w: number; h: number },
  seed: number,
  opts: HachureOpts = {},
): void {
  const angle = ((opts.angle ?? -45) * Math.PI) / 180;
  const gap = Math.max(2, opts.gap ?? 5);

  ctx.save();
  ctx.clip(path);

  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const reach = Math.hypot(bounds.w, bounds.h) / 2 + gap;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;

  const count = Math.ceil((reach * 2) / gap);
  for (let i = 0; i <= count; i++) {
    const offset = -reach + i * gap;
    const ox = cx + nx * offset;
    const oy = cy + ny * offset;
    roughLine(
      ctx,
      ox - dx * reach,
      oy - dy * reach,
      ox + dx * reach,
      oy + dy * reach,
      subSeed(seed, i),
      { roughness: opts.roughness ?? 0.7, passes: opts.passes ?? 1 },
    );
  }
  ctx.restore();
}

/** A short tapered stroke — the workhorse for stems, twigs and grass blades. */
export function taperedStroke(
  ctx: CanvasRenderingContext2D,
  from: Vec2,
  to: Vec2,
  widthFrom: number,
  widthTo: number,
  bend: number,
  fill: string,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (from.x + to.x) / 2 + nx * bend;
  const my = (from.y + to.y) / 2 + ny * bend;

  ctx.beginPath();
  ctx.moveTo(from.x + nx * widthFrom * 0.5, from.y + ny * widthFrom * 0.5);
  ctx.quadraticCurveTo(
    mx + nx * widthTo * 0.5,
    my + ny * widthTo * 0.5,
    to.x + nx * widthTo * 0.5,
    to.y + ny * widthTo * 0.5,
  );
  ctx.lineTo(to.x - nx * widthTo * 0.5, to.y - ny * widthTo * 0.5);
  ctx.quadraticCurveTo(
    mx - nx * widthTo * 0.5,
    my - ny * widthTo * 0.5,
    from.x - nx * widthFrom * 0.5,
    from.y - ny * widthFrom * 0.5,
  );
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Fill and outline a blob in one go. */
export function drawBlob(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  seed: number,
  fill: string | null,
  stroke: string | null,
  opts: RoughOpts & { lineWidth?: number } = {},
): Path2D {
  const path = curvePath(pts, true);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(path);
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = opts.lineWidth ?? 1;
    roughCurve(ctx, pts, true, seed, opts);
  }
  return path;
}
