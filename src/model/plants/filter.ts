import type {
  DrainagePref,
  Foliage,
  SizeClass,
  SoilPh,
  SoilType,
  Species,
  SunPref,
} from '../types';
import { SPECIES, hardinessRating } from './index';
import { inStyle, type PlantingStyle } from './styles';

/**
 * Narrowing the library down to the plants that will do.
 *
 * "Dry shade on chalk, hardy to H5" is a question about plants, not about a
 * screen, and it used to be answerable only by clicking: the rules lived inside
 * the library panel, three hundred lines into a React component, where nothing
 * could test them. They are here now so that they can be — including the two
 * that are easy to get wrong and were, once, wrong.
 */

export interface PlantFilters {
  /** Free text, matched against the names and the colours. */
  query: string;
  type: Species['type'] | 'all';
  foliage: Foliage | 'all';
  sun: SunPref | 'all';
  soilPh: SoilPh | 'all';
  soilType: SoilType | 'all';
  drainage: DrainagePref | 'all';
  size: SizeClass | 'all';
  hardiness: 'all' | 'H4' | 'H5' | 'H6' | 'H7';
  /** Only plants already on the plan. */
  plantedOnly: boolean;
  /** A planting style cuts across the types rather than being one of them. */
  style: PlantingStyle | null;
}

export const NO_FILTERS: PlantFilters = {
  query: '',
  type: 'all',
  foliage: 'all',
  sun: 'all',
  soilPh: 'all',
  soilType: 'all',
  drainage: 'all',
  size: 'all',
  hardiness: 'all',
  plantedOnly: false,
  style: null,
};

/** The growing conditions, which fold away in the panel, as against the type. */
const CONDITIONS = ['sun', 'soilPh', 'soilType', 'drainage', 'foliage', 'size', 'hardiness'] as const;

/** One row of chips, named so a row can be left out of its own count. */
export type FilterAxis = (typeof CONDITIONS)[number] | 'type';

/** Anything that can say whether a species is on the plan; a Set or a Map of counts. */
export interface PlantedLookup {
  has(speciesId: string): boolean;
}

const NOTHING_PLANTED: PlantedLookup = { has: () => false };

function matchesQuery(species: Species, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    species.common,
    species.latin,
    species.genus,
    species.family,
    species.flowerColour,
    species.foliageColour,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/**
 * Whether one plant survives the filters.
 *
 * Hardiness is the odd one out: it is a threshold, not a match. Asking for H5
 * has to include the H6 and H7 plants, which are hardier still — matching H5
 * exactly would hide precisely the plants that are safest.
 */
export function matchesFilters(
  species: Species,
  filters: PlantFilters,
  planted: PlantedLookup = NOTHING_PLANTED,
): boolean {
  const f = filters;
  if (f.plantedOnly && !planted.has(species.id)) return false;
  if (f.style !== null && !inStyle(species, f.style)) return false;
  if (f.type !== 'all' && species.type !== f.type) return false;
  if (f.foliage !== 'all' && species.foliage !== f.foliage) return false;
  if (f.sun !== 'all' && !species.sun.includes(f.sun)) return false;
  if (f.soilPh !== 'all' && !species.soilPh.includes(f.soilPh)) return false;
  if (f.soilType !== 'all' && !species.soilType.includes(f.soilType)) return false;
  if (f.drainage !== 'all' && !species.drainage.includes(f.drainage)) return false;
  if (f.size !== 'all' && species.sizeClass !== f.size) return false;
  if (f.hardiness !== 'all' && hardinessRating(species) < Number(f.hardiness.slice(1))) return false;
  return matchesQuery(species, f.query);
}

/** The library, narrowed, in library order. */
export function filterPlants(filters: PlantFilters, planted?: PlantedLookup): Species[] {
  return SPECIES.filter((s) => matchesFilters(s, filters, planted));
}

/**
 * How many plants a chip would leave, given everything else already set.
 *
 * Chips that would empty the list are dimmed rather than hidden — with bog and
 * pond in the drainage row and no marginals in the palette, a tab that silently
 * returns nothing reads as a bug.
 *
 * `except` is the part that looks arbitrary and is not. A row must not count
 * against itself: without this, picking Small made Medium and Large report
 * nothing — they were being asked how many plants are medium *and* small — so
 * both dimmed, saying the library had no medium plants when switching to Medium
 * would have shown a hundred and thirty-eight. The question a chip answers is
 * "how many if I picked this instead", so its own axis is left out.
 *
 * The query and the planted switch are left out throughout: a chip's number
 * describes the library, not what is left after typing three letters.
 */
export function countMatching(
  filters: PlantFilters,
  predicate: (species: Species) => boolean,
  except?: FilterAxis,
): number {
  const f = filters;
  return SPECIES.filter(
    (s) =>
      predicate(s) &&
      (f.style === null || inStyle(s, f.style)) &&
      (except === 'type' || f.type === 'all' || s.type === f.type) &&
      (except === 'sun' || f.sun === 'all' || s.sun.includes(f.sun)) &&
      (except === 'soilPh' || f.soilPh === 'all' || s.soilPh.includes(f.soilPh)) &&
      (except === 'soilType' || f.soilType === 'all' || s.soilType.includes(f.soilType)) &&
      (except === 'drainage' || f.drainage === 'all' || s.drainage.includes(f.drainage)) &&
      (except === 'foliage' || f.foliage === 'all' || s.foliage === f.foliage) &&
      (except === 'size' || f.size === 'all' || s.sizeClass === f.size) &&
      (except === 'hardiness' ||
        f.hardiness === 'all' ||
        hardinessRating(s) >= Number(f.hardiness.slice(1))),
  ).length;
}

/** How many growing conditions are narrowing the list, for the folded-away row. */
export function activeConditions(filters: PlantFilters): number {
  return CONDITIONS.filter((axis) => filters[axis] !== 'all').length;
}

/** Whether anything at all is narrowing the library right now. */
export function isNarrowed(filters: PlantFilters): boolean {
  return (
    activeConditions(filters) > 0 ||
    filters.type !== 'all' ||
    filters.plantedOnly ||
    filters.style !== null ||
    filters.query.trim() !== ''
  );
}
