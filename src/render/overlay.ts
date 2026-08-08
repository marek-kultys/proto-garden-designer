import type { ShadeGrid } from '../model/shade';
import { mix, rgbToCss, hexToRgb } from './palette';
import type { Viewport } from './viewport';

/**
 * The sun/shade overlay.
 *
 * The quantity drawn is *shade* — hours of the day a spot spends out of direct
 * sun — even though the legend and readout are phrased in sun hours, which is
 * how designers talk. Encoding the deficit rather than the total is what lets
 * the overlay put ink only where there is something to see: a spot in full sun
 * all day is left completely clear, and the drawing underneath survives.
 *
 * One hue, monotonic in lightness, from the validated blue sequential ramp.
 * Blue does double duty here — it is the sequential default and it reads as
 * shadow, so the map matches the shadows already on the canvas.
 */

const SHADE_RAMP = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
  '#0d366b',
].map(hexToRgb);

/** Band swatches for the legend — steps 250 / 450 / 650 of the same ramp. */
export const BAND_SWATCHES = {
  fullSun: '#86b6ef',
  partial: '#2a78d6',
  shade: '#104281',
};

function rampAt(t: number): { r: number; g: number; b: number } {
  const clamped = Math.max(0, Math.min(1, t));
  const pos = clamped * (SHADE_RAMP.length - 1);
  const i = Math.floor(pos);
  const j = Math.min(SHADE_RAMP.length - 1, i + 1);
  return mix(SHADE_RAMP[i], SHADE_RAMP[j], pos - i);
}

let scratch: HTMLCanvasElement | null = null;

export function drawShadeOverlay(
  ctx: CanvasRenderingContext2D,
  grid: ShadeGrid,
  viewport: Viewport,
): void {
  if (grid.maxHours <= 0) return;

  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = grid.cols;
  scratch.height = grid.rows;
  const gctx = scratch.getContext('2d');
  if (!gctx) return;

  const image = gctx.createImageData(grid.cols, grid.rows);
  const data = image.data;

  for (let i = 0; i < grid.hours.length; i++) {
    const hours = grid.hours[i];
    const o = i * 4;
    if (hours < 0) {
      data[o + 3] = 0;
      continue;
    }
    // Shade fraction: 0 = sun all day (left clear), 1 = never in direct sun.
    const shadeFraction = Math.max(0, Math.min(1, 1 - hours / grid.maxHours));
    const colour = rampAt(shadeFraction);
    data[o] = colour.r;
    data[o + 1] = colour.g;
    data[o + 2] = colour.b;
    // Alpha ramps with the value too, so full sun fades out entirely.
    data[o + 3] = Math.round(225 * Math.pow(shadeFraction, 0.75));
  }
  gctx.putImageData(image, 0, 0);

  const x = grid.originX * viewport.scale + viewport.offsetX;
  const y = grid.originY * viewport.scale + viewport.offsetY;
  const w = grid.cols * grid.cellSize * viewport.scale;
  const h = grid.rows * grid.cellSize * viewport.scale;

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch, x, y, w, h);
  ctx.restore();
}

/** Sample the grid at a plot-space point; returns sun hours, or null if outside. */
export function sampleShade(grid: ShadeGrid, x: number, y: number): number | null {
  const c = Math.floor((x - grid.originX) / grid.cellSize);
  const r = Math.floor((y - grid.originY) / grid.cellSize);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return null;
  const v = grid.hours[r * grid.cols + c];
  return v < 0 ? null : v;
}

export { rgbToCss };
