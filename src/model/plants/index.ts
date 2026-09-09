import type { Species } from '../types';

/**
 * The plant palette, each entry researched rather than invented.
 *
 * They are chosen to span the axes the simulation actually exercises, so that a
 * tester dragging the sliders sees genuinely different behaviour rather than
 * thirty variations on a green blob:
 *
 *   growth      eucalyptus (a metre a year) → pinus mugo (a few centimetres)
 *   persistence yew standing for centuries → cosmos, a different plant each year
 *   foliage     evergreen laurustinus → allium, gone from August to March
 *   season      hellebore in February → miscanthus plumes still up in January
 *   light       lavender demanding full sun → hosta and hellebore wanting shade
 *
 * Several exist to exercise a specific piece of the model, and it is worth
 * knowing which: magnolia flowers on bare wood, viburnum flowers across the turn
 * of the year, cornus is grown for the colour of its leafless stems, allium goes
 * dormant in high summer rather than in winter, and rowan and crab apple carry
 * fruit long after their leaves have gone.
 *
 * Dimensions and flowering periods are from the RHS entry for each plant (linked
 * in `source`); where nursery sources give a realistic 20-year size that differs
 * from the RHS "ultimate" figure, the growth curve is tuned to hit the 20-year
 * number, since that is the range the age slider covers.
 */

import { PLANT_ORDER } from './order';
import { TREES } from './trees';
import { SHRUBS } from './shrubs';
import { CONIFERS } from './conifers';
import { CLIMBERS } from './climbers';
import { GRASSES } from './grasses';
import { FERNS } from './ferns';
import { PERENNIALS } from './perennials';
import { BULBS } from './bulbs';
import { ANNUALS } from './annuals';

/**
 * Assembled from the files above, in the order plants joined the library.
 *
 * Nothing in the app depends on that order — every reader filters or looks up
 * by id — except the numbering in PLANTS.md, which is why it is kept. A plant
 * missing from PLANT_ORDER is appended rather than dropped, so adding one means
 * editing a single type file and nothing else.
 */
const BY_TYPE: Species[] = [
  ...TREES,
  ...SHRUBS,
  ...CONIFERS,
  ...CLIMBERS,
  ...GRASSES,
  ...FERNS,
  ...PERENNIALS,
  ...BULBS,
  ...ANNUALS,
];

const byId = new Map(BY_TYPE.map((s) => [s.id, s]));
const listed = new Set(PLANT_ORDER);

export const SPECIES: Species[] = [
  ...PLANT_ORDER.map((id) => byId.get(id)).filter((s): s is Species => s !== undefined),
  ...BY_TYPE.filter((s) => !listed.has(s.id)),
];


export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(
  SPECIES.map((s) => [s.id, s]),
);

export function getSpecies(id: string): Species {
  const s = SPECIES_BY_ID[id];
  if (!s) throw new Error(`Unknown species: ${id}`);
  return s;
}

/**
 * An RHS hardiness rating as a number, for comparing one against another.
 *
 * The field is a string because that is how the ratings are written and shown —
 * but "will this survive my winter" is a threshold question, not an equality
 * one. Asking for H5 has to include the H6 and H7 plants, which are hardier
 * still; matching H5 exactly would hide precisely the plants that are safest.
 *
 * Anything that does not parse returns 0, so a damaged record falls out of a
 * "hardy to at least" filter rather than being promised as tough.
 */
export function hardinessRating(species: Species): number {
  const match = /^H(\d)$/.exec(species.hardiness.trim());
  return match ? Number(match[1]) : 0;
}

export const TYPE_LABELS: Record<Species['type'], string> = {
  tree: 'Trees',
  shrub: 'Shrubs',
  conifer: 'Conifers',
  climber: 'Climbers',
  grass: 'Grasses',
  fern: 'Ferns',
  perennial: 'Perennials',
  bulb: 'Bulbs',
  annual: 'Annuals',
};
