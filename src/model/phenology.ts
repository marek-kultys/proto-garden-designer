import type { Phase, Site, Species, StandingWindow } from './types';

/**
 * What a plant is doing on a given day of the year.
 *
 * Each species carries day-of-year anchors measured at a reference site (London,
 * sea level). Moving the site shifts those anchors using Hopkins' bioclimatic
 * law — the classic rule of thumb that spring arrives about four days later for
 * every degree of latitude north and every 400 ft (~122 m) of altitude, and that
 * autumn runs the other way. It is what turns the altitude field from a number
 * you type into something you can see: put the same garden 400 m up and bud
 * burst slips a fortnight while leaf fall comes a fortnight early.
 */

const REF_LATITUDE = 51.5;
const REF_ALTITUDE = 0;
const DAYS_PER_DEGREE_LAT = 4;
const DAYS_PER_100M = 3.3; // 4 days per 400 ft

export interface SeasonShift {
  /** Days later that spring arrives (negative = earlier). */
  spring: number;
  /** Days that autumn is brought forward. */
  autumn: number;
  /** Change in growing-season length, days. */
  seasonDelta: number;
}

export function seasonShift(site: Site): SeasonShift {
  const raw =
    DAYS_PER_DEGREE_LAT * (site.latitude - REF_LATITUDE) +
    (DAYS_PER_100M * (site.altitude - REF_ALTITUDE)) / 100;
  // Clamped so an extreme entry bends the seasons without inverting them.
  const spring = Math.max(-45, Math.min(45, raw));
  return { spring, autumn: -spring, seasonDelta: -2 * spring };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** A bell that rises over the first fifth of the window and falls over the last third. */
function bell(start: number, end: number, x: number): number {
  if (end <= start) return 0;
  const span = end - start;
  return smoothstep(start, start + span * 0.2, x) * (1 - smoothstep(end - span * 0.35, end, x));
}

const RISE_DAYS = 32;
const FALL_DAYS = 30;

/**
 * Dry structure standing on the plant: seedheads, spent flowerheads, dead stems.
 *
 * Two shapes, and the difference matters. Grass plumes rise in late summer,
 * stand through December and January, and only come down at the February cut —
 * a window that crosses the new year, which a plain day-of-year ramp cannot
 * express at all (it resets on 1 January and the garden loses its winter
 * structure overnight). Allium seedheads are the opposite: they go over in high
 * summer and are gone long before autumn, entirely inside one year.
 */
function standingAt(window: StandingWindow, doy: number): number {
  if (window.to > window.from) {
    const span = window.to - window.from;
    const rise = Math.min(RISE_DAYS, span * 0.35);
    const fall = Math.min(FALL_DAYS, span * 0.35);
    return (
      smoothstep(window.from, window.from + rise, doy) *
      (1 - smoothstep(window.to - fall, window.to, doy))
    );
  }
  if (doy >= window.from) return smoothstep(window.from, window.from + RISE_DAYS, doy);
  if (doy <= window.to) return 1 - smoothstep(Math.max(0, window.to - FALL_DAYS), window.to, doy);
  return 0;
}

/**
 * A bell over a window that may cross the new year.
 *
 * Viburnum tinus opens in November and carries on to April; a straight
 * `bell(305, 110, doy)` has its end before its start and silently returns zero,
 * so the plant would never flower at all. Evaluating the window in both the
 * previous year and the next and taking whichever is live handles it.
 */
function wrappedBell(start: number, end: number, doy: number): number {
  if (end > start) return bell(start, end, doy);
  if (end === start) return 0;
  return Math.max(bell(start, end + 365, doy), bell(start - 365, end, doy));
}

/** How far through a window a day sits, 0–1, wrap included. */
function windowProgress(start: number, end: number, doy: number): number {
  const span = end > start ? end - start : end + 365 - start;
  if (span <= 0) return 0;
  const offset = doy >= start ? doy - start : doy + 365 - start;
  return Math.max(0, Math.min(1, offset / span));
}

interface Anchors {
  budBurst: number;
  fullLeaf: number;
  autumnStart: number;
  leafFall: number;
  flowerStart: number;
  flowerEnd: number;
}

/** Species anchors moved to the actual site. */
export function anchorsFor(species: Species, site: Site): Anchors {
  const { spring, autumn } = seasonShift(site);
  const budBurst = species.budBurst + spring;
  const fullLeaf = Math.max(budBurst + 8, species.fullLeaf + spring);
  const autumnStart = species.autumnStart + autumn;
  return {
    budBurst,
    fullLeaf,
    autumnStart: Math.max(fullLeaf + 20, autumnStart),
    leafFall: Math.max(autumnStart + 20, species.leafFall + autumn),
    flowerStart: species.flowerStart + spring * 0.7,
    flowerEnd: species.flowerEnd + spring * 0.7,
  };
}

export function phaseAt(species: Species, doy: number, site: Site): Phase {
  const a = anchorsFor(species, site);
  const flower = wrappedBell(a.flowerStart, a.flowerEnd, doy);
  const flowerAge = windowProgress(a.flowerStart, a.flowerEnd, doy);
  const fruit =
    species.fruitStart !== undefined && species.fruitEnd !== undefined
      ? wrappedBell(species.fruitStart, species.fruitEnd, doy)
      : 0;

  if (species.foliage === 'evergreen') {
    // Evergreens still flush new growth in spring; that flush is a visibly
    // lighter green for a few weeks, which is worth showing.
    const spring = bell(a.budBurst, a.fullLeaf + 30, doy);
    return {
      leafCover: 1,
      autumn: 0,
      spring,
      flower,
      flowerAge,
      fruit,
      // Evergreen foliage and dry standing structure are not exclusive: Stipa
      // gigantea keeps a green basal clump all year and holds its oat panicles
      // above it from midsummer until they are cut in late winter.
      seedhead: species.standing ? standingAt(species.standing, doy) : 0,
      dormant: false,
    };
  }

  const flushing = smoothstep(a.budBurst, a.fullLeaf, doy);
  // Leaves colour up before they drop, so fall trails autumn onset.
  const fallStart = a.autumnStart + (a.leafFall - a.autumnStart) * 0.45;
  const dropping = smoothstep(fallStart, a.leafFall, doy);
  const leafCover = Math.max(0, flushing - dropping);

  // Colour finishes turning just as the leaves begin to go, which is the order
  // it happens in: a tree does not drop green leaves and then turn yellow.
  const autumn = smoothstep(a.autumnStart, fallStart, doy);
  const spring = bell(a.budBurst, a.fullLeaf + 25, doy);

  const seedhead = species.standing ? standingAt(species.standing, doy) : 0;

  if (species.foliage === 'herbaceous') {
    // Dies back to the ground: nothing above soil once the foliage has gone.
    // Herbaceous stems collapse rather than hanging on, so they clear faster.
    const collapse = smoothstep(a.autumnStart, a.autumnStart + 30, doy);
    const cover = Math.max(0, flushing - collapse);
    return {
      leafCover: cover,
      // Anything still standing is dead material and must be coloured as such.
      // Autumn alone ramps on day-of-year and so resets to zero on 1 January,
      // which would repaint a winter grass in summer green.
      autumn: Math.max(autumn, seedhead),
      spring,
      flower,
      flowerAge,
      fruit,
      seedhead,
      dormant: cover < 0.03 && seedhead < 0.03 && flower < 0.03,
    };
  }

  return {
    leafCover,
    autumn: Math.max(autumn, seedhead),
    spring,
    flower,
    flowerAge,
    fruit,
    seedhead,
    dormant: false,
  };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

export function doyToLabel(doy: number): string {
  const d = Math.max(1, Math.min(365, Math.round(doy)));
  let m = 11;
  while (m > 0 && MONTH_STARTS[m] >= d) m--;
  return `${d - MONTH_STARTS[m]} ${MONTHS[m]}`;
}

export function doyToShortLabel(doy: number): string {
  const d = Math.max(1, Math.min(365, Math.round(doy)));
  let m = 11;
  while (m > 0 && MONTH_STARTS[m] >= d) m--;
  return MONTHS[m].slice(0, 3);
}

export function monthStartDoy(month: number): number {
  return MONTH_STARTS[month] + 1;
}

/** Plain-language summary of what the plant is doing, for the canvas readout. */
export function phaseSummary(species: Species, phase: Phase): string {
  if (phase.dormant) return species.lifecycle === 'bulb' ? 'back to the bulb' : 'dormant below ground';
  const bits: string[] = [];
  if (phase.flower > 0.35) bits.push('in flower');
  if (phase.fruit > 0.35) bits.push(species.type === 'tree' ? 'in fruit' : 'in berry');
  if (phase.autumn > 0.5 && phase.leafCover > 0.1) bits.push('autumn colour');
  if (phase.leafCover < 0.15 && species.foliage === 'deciduous') bits.push('bare');
  else if (phase.spring > 0.4) bits.push('fresh growth');
  if (phase.seedhead > 0.3) bits.push('seedheads');
  return bits.length ? bits.join(', ') : 'in leaf';
}
