import type { Bounds } from '../model/geometry';
import type { Vec2 } from '../model/types';

export interface Viewport {
  /** Pixels per metre. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function fitViewport(
  bounds: Bounds,
  width: number,
  height: number,
  padding = 48,
): Viewport {
  const w = Math.max(0.5, bounds.maxX - bounds.minX);
  const h = Math.max(0.5, bounds.maxY - bounds.minY);
  // Scale the inset to the canvas: a fixed 64 px margin is comfortable on a
  // desktop and swallows most of a phone screen.
  const inset = Math.max(12, Math.min(padding, width * 0.07, height * 0.09));
  const scale = Math.min((width - inset * 2) / w, (height - inset * 2) / h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    offsetX: width / 2 - cx * scale,
    offsetY: height / 2 - cy * scale,
  };
}

export function toScreen(v: Viewport, p: Vec2): Vec2 {
  return { x: p.x * v.scale + v.offsetX, y: p.y * v.scale + v.offsetY };
}

export function toPlot(v: Viewport, sx: number, sy: number): Vec2 {
  return { x: (sx - v.offsetX) / v.scale, y: (sy - v.offsetY) / v.scale };
}

/** A round number of metres that renders as a sensible scale bar. */
export function niceScaleStep(scale: number, targetPx = 110): number {
  const raw = targetPx / scale;
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
  for (const s of steps) if (raw <= s) return s;
  return 100;
}
