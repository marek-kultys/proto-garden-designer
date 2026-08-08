import type { Phase, Site, Species } from './types';

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

/** Late winter, when standing seedheads and dead stems get cut down. */
const CUT_BACK_START = 40;
const CUT_BACK_END = 70;

/**
 * Dry structure that stands over winter.
 *
 * This is the one thing in the model that has to survive the turn of the year:
 * grass plumes rise in late summer, stand through December and January, and are
 * only cut down in February. A plain ramp on day-of-year cannot express that —
 * it resets to zero on 1 January and the garden loses its winter structure
 * overnight — so the wrap is handled explicitly.
 */
function standingStructure(riseStart: number, riseEnd: number, doy: number): number {
  if (doy <= CUT_BACK_END) return 1 - smoothstep(CUT_BACK_START, CUT_BACK_END, doy);
  if (doy >= riseStart) return smoothstep(riseStart, riseEnd, doy);
  return 0;
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
  const flower = bell(a.flowerStart, a.flowerEnd, doy);

  if (species.foliage === 'evergreen') {
    // Evergreens still flush new growth in spring; that flush is a visibly
    // lighter green for a few weeks, which is worth showing.
    const spring = bell(a.budBurst, a.fullLeaf + 30, doy);
    return { leafCover: 1, autumn: 0, spring, flower, seedhead: 0, dormant: false };
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

  if (species.foliage === 'herbaceous') {
    // Dies back to the ground: nothing above soil once the foliage has gone.
    const seedhead = species.winterStructure
      ? standingStructure(a.autumnStart, a.leafFall, doy)
      : 0;
    // Herbaceous stems collapse rather than hanging on, so they clear faster.
    const collapse = smoothstep(a.autumnStart, a.autumnStart + 30, doy);
    const cover = Math.max(0, flushing - collapse);
    return {
      leafCover: cover,
      // Anything still standing in January is dead material, and must be
      // coloured as such. Autumn alone ramps on day-of-year and so resets to
      // zero on 1 January, which would repaint a winter grass in summer green.
      autumn: Math.max(autumn, seedhead),
      spring,
      flower,
      seedhead,
      dormant: cover < 0.03 && seedhead < 0.03,
    };
  }

  const seedhead = species.winterStructure
    ? standingStructure(a.leafFall - 20, a.leafFall + 15, doy)
    : 0;
  return { leafCover, autumn: Math.max(autumn, seedhead), spring, flower, seedhead, dormant: false };
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
  if (phase.dormant) return 'dormant below ground';
  const bits: string[] = [];
  if (phase.flower > 0.35) bits.push('in flower');
  if (phase.autumn > 0.5 && phase.leafCover > 0.1) bits.push('autumn colour');
  if (phase.leafCover < 0.15 && species.foliage === 'deciduous') bits.push('bare');
  else if (phase.spring > 0.4) bits.push('fresh growth');
  if (phase.seedhead > 0.3) bits.push('seedheads');
  return bits.length ? bits.join(', ') : 'in leaf';
}
