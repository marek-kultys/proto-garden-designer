import { polygonBounds, pointInPolygon } from './geometry';
import { getSpecies } from './plants';
import { phaseAt } from './phenology';
import { plantAge, sizeAt } from './growth';
import { bearingToCanvas, dayLength, solarPosition } from './sun';
import { casterOf, groundOffsetAt, sweptPolygons } from './structures';
import type { Phase, PlantInstance, Plot, Site, Species, Structure, TimeState } from './types';

/**
 * How much light a canopy stops.
 *
 * A bare deciduous tree is not transparent — a winter birch still takes maybe a
 * quarter of the light out — while a clipped yew is very nearly opaque. Running
 * this off `leafCover` is what makes the shade map change with the season slider
 * as well as with the sun.
 */
export function canopyDensity(species: Species, phase: Phase): number {
  if (phase.dormant) return 0;
  switch (species.foliage) {
    case 'evergreen':
      if (species.type === 'conifer') return 0.92;
      // A climber is a sheet of leaves on a support, denser than a shrub's
      // canopy and with nothing to see through behind it.
      return species.type === 'climber' ? 0.85 : 0.75;
    case 'herbaceous':
      return 0.35 * phase.leafCover;
    default: {
      const bare = species.type === 'tree' ? 0.22 : 0.15;
      return bare + (0.72 - bare) * phase.leafCover;
    }
  }
}

export interface ShadeGrid {
  cols: number;
  rows: number;
  cellSize: number;
  originX: number;
  originY: number;
  /** Direct sun hours per cell; -1 outside the plot. */
  hours: Float32Array;
  /** Daylight hours available on this day — the ceiling for any cell. */
  maxHours: number;
  /** Fractions of the plot in each band, 0–1. */
  bands: { fullSun: number; partial: number; shade: number };
  /** The hour thresholds those bands were counted against. */
  thresholds: { fullSun: number; partial: number };
}

const FULL_SUN_HOURS = 6;
const PARTIAL_HOURS = 3;

/**
 * "Full sun means six hours or more" is a growing-season rule of thumb, and it
 * quietly stops meaning anything in winter: six hours out of an eight-hour
 * December day is 72% of all available light, so almost nothing clears it and
 * the map reads as uniformly shaded. Capping the thresholds at a share of the
 * daylight keeps the familiar figures exactly through spring and summer while
 * still saying something useful about a January afternoon.
 */
export function bandThresholds(maxHours: number): { fullSun: number; partial: number } {
  return {
    fullSun: Math.min(FULL_SUN_HOURS, 0.55 * maxHours),
    partial: Math.min(PARTIAL_HOURS, 0.25 * maxHours),
  };
}

export interface ShadeOptions {
  /** Metres per grid cell. */
  cellSize?: number;
  /** Minutes between sun samples through the day. */
  stepMinutes?: number;
  maxCells?: number;
}

/**
 * Accumulated hours of direct sun per square metre of plot, for one day.
 *
 * Walks the sun across the sky in fifteen-minute steps and, at each step,
 * projects every plant's canopy onto the ground as an ellipse stretched along
 * the shadow direction. Cells inside an ellipse keep only the light that gets
 * through the canopy above them, so overlapping shadows compound the way real
 * ones do.
 *
 * Walls and raised beds cast too, and they are the reason this map is worth
 * looking at on a small plot: a two-metre south boundary wall decides the whole
 * character of the bed in front of it, and it does so on the shortest day far
 * more than on the longest. They are swept polygons rather than ellipses, and
 * opaque rather than dappled.
 */
export function computeShadeGrid(
  plot: Plot,
  plants: PlantInstance[],
  site: Site,
  time: TimeState,
  calendarYear: number,
  structures: Structure[] = [],
  opts: ShadeOptions = {},
): ShadeGrid {
  const stepMinutes = opts.stepMinutes ?? 15;
  const maxCells = opts.maxCells ?? 150;
  const bounds = polygonBounds(plot);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);

  let cellSize = opts.cellSize ?? 0.25;
  cellSize = Math.max(cellSize, width / maxCells, height / maxCells);

  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const n = cols * rows;

  const hours = new Float32Array(n);
  const inside = new Uint8Array(n);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = {
        x: bounds.minX + (c + 0.5) * cellSize,
        y: bounds.minY + (r + 0.5) * cellSize,
      };
      inside[r * cols + c] = pointInPolygon(p, plot) ? 1 : 0;
    }
  }

  const day = dayLength(site, time.doy, calendarYear);
  const empty: ShadeGrid = {
    cols,
    rows,
    cellSize,
    originX: bounds.minX,
    originY: bounds.minY,
    hours,
    maxHours: Math.max(0, day.daylight),
    bands: { fullSun: 0, partial: 0, shade: 1 },
    thresholds: bandThresholds(Math.max(0, day.daylight)),
  };
  if (day.sunrise === null || day.sunset === null || day.daylight <= 0) return empty;

  // Pre-resolve each plant's size and canopy density for this year and day.
  const casters = plants
    .map((plant) => {
      const species = getSpecies(plant.speciesId);
      const phase = phaseAt(species, time.doy, site);
      const size = sizeAt(species, plantAge(plant.plantedAge, time.year));
      // A plant in a raised bed starts from the top of it, so its shadow both
      // lengthens and starts further out. Ignoring this would make a bed purely
      // cosmetic in the one view where it does measurable work.
      const base = groundOffsetAt(plant, structures);
      return { plant, size, base, density: canopyDensity(species, phase) };
    })
    .filter((c) => c.density > 0.01);

  const builtCasters = structures
    .map(casterOf)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Midpoint rule over the daylight window: every sample sits strictly inside
  // it, and the sub-intervals sum to the day length exactly. Stepping from
  // sunrise in fixed increments instead would drop a partial interval at dusk
  // and skip the samples nearest each end for having the sun too low, so a spot
  // in the open would report noticeably less sun than there was daylight.
  const steps = Math.max(1, Math.ceil(day.daylight / (stepMinutes / 60)));
  const step = day.daylight / steps;
  const transmit = new Float32Array(n);

  for (let i = 0; i < steps; i++) {
    const hour = day.sunrise + (i + 0.5) * step;
    const sun = solarPosition(site, time.doy, hour, calendarYear);

    transmit.fill(1);
    // The sun is up by construction; below a fraction of a degree the shadow is
    // longer than any plot, so it is clamped rather than skipped.
    if (sun.altitude <= 0.05) {
      for (let c = 0; c < n; c++) if (inside[c]) hours[c] += step * transmit[c];
      continue;
    }

    const reach = 1 / Math.tan((sun.altitude * Math.PI) / 180);
    const angle = bearingToCanvas(sun.azimuth + 180, site.northAngle);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const vx = -uy;
    const vy = ux;

    for (const caster of casters) {
      const len = Math.min(40, caster.size.height * reach);
      const a = caster.size.spread / 2 + len / 2;
      const b = caster.size.spread / 2;
      if (a <= 0 || b <= 0) continue;
      // The shadow of something standing `base` metres up starts that much
      // further along the ground before it begins.
      const lift = Math.min(40, caster.base * reach);
      const cx = caster.plant.x + ux * (lift + len / 2);
      const cy = caster.plant.y + uy * (lift + len / 2);

      const rad = a + b;
      const c0 = Math.max(0, Math.floor((cx - rad - bounds.minX) / cellSize));
      const c1 = Math.min(cols - 1, Math.ceil((cx + rad - bounds.minX) / cellSize));
      const r0 = Math.max(0, Math.floor((cy - rad - bounds.minY) / cellSize));
      const r1 = Math.min(rows - 1, Math.ceil((cy + rad - bounds.minY) / cellSize));
      const keep = 1 - caster.density;

      for (let r = r0; r <= r1; r++) {
        const py = bounds.minY + (r + 0.5) * cellSize - cy;
        const rowBase = r * cols;
        for (let c = c0; c <= c1; c++) {
          if (!inside[rowBase + c]) continue;
          const px = bounds.minX + (c + 0.5) * cellSize - cx;
          const along = (px * ux + py * uy) / a;
          const across = (px * vx + py * vy) / b;
          if (along * along + across * across <= 1) transmit[rowBase + c] *= keep;
        }
      }
    }

    for (const built of builtCasters) {
      const drop = Math.min(60, built.height * reach);
      const vx = ux * drop;
      const vy = uy * drop;
      const keep = built.transmission;

      for (const foot of built.footprints) {
        for (const part of sweptPolygons(foot, vx, vy)) {
          let pminX = Infinity;
          let pminY = Infinity;
          let pmaxX = -Infinity;
          let pmaxY = -Infinity;
          for (const pt of part) {
            if (pt.x < pminX) pminX = pt.x;
            if (pt.y < pminY) pminY = pt.y;
            if (pt.x > pmaxX) pmaxX = pt.x;
            if (pt.y > pmaxY) pmaxY = pt.y;
          }
          const c0 = Math.max(0, Math.floor((pminX - bounds.minX) / cellSize));
          const c1 = Math.min(cols - 1, Math.ceil((pmaxX - bounds.minX) / cellSize));
          const r0 = Math.max(0, Math.floor((pminY - bounds.minY) / cellSize));
          const r1 = Math.min(rows - 1, Math.ceil((pmaxY - bounds.minY) / cellSize));

          for (let r = r0; r <= r1; r++) {
            const rowBase = r * cols;
            const py = bounds.minY + (r + 0.5) * cellSize;
            for (let c = c0; c <= c1; c++) {
              const idx = rowBase + c;
              if (!inside[idx] || transmit[idx] === 0) continue;
              const px = bounds.minX + (c + 0.5) * cellSize;
              if (pointInPolygon({ x: px, y: py }, part)) transmit[idx] *= keep;
            }
          }
        }
      }
    }

    for (let c = 0; c < n; c++) {
      if (inside[c]) hours[c] += step * transmit[c];
    }
  }

  const thresholds = bandThresholds(day.daylight);
  let full = 0;
  let partial = 0;
  let shaded = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!inside[i]) {
      hours[i] = -1;
      continue;
    }
    total++;
    if (hours[i] >= thresholds.fullSun) full++;
    else if (hours[i] >= thresholds.partial) partial++;
    else shaded++;
  }

  return {
    cols,
    rows,
    cellSize,
    originX: bounds.minX,
    originY: bounds.minY,
    hours,
    maxHours: Math.max(0, day.daylight),
    bands: total
      ? { fullSun: full / total, partial: partial / total, shade: shaded / total }
      : { fullSun: 0, partial: 0, shade: 0 },
    thresholds,
  };
}

export function shadeBandLabel(hours: number, thresholds: { fullSun: number; partial: number }): string {
  if (hours < 0) return '';
  if (hours >= thresholds.fullSun) return 'full sun';
  if (hours >= thresholds.partial) return 'partial shade';
  return 'shade';
}

export { FULL_SUN_HOURS, PARTIAL_HOURS };
