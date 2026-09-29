import type {
  DrainagePref,
  Foliage,
  PlantType,
  SizeClass,
  SoilPh,
  SoilType,
  Species,
  SunPref,
} from '../../model/types';

/**
 * What the chips say, and in what order.
 *
 * Only labels and orderings live here — which plants a chip would leave is a
 * question about plants, and is answered in `model/plants/filter.ts`. Keeping
 * the two apart is what lets the rules be tested without a browser.
 */

export const TYPES: { id: PlantType | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'tree', label: 'Trees' },
  { id: 'shrub', label: 'Shrubs' },
  { id: 'conifer', label: 'Conifers' },
  { id: 'climber', label: 'Climbers' },
  { id: 'grass', label: 'Grasses' },
  { id: 'fern', label: 'Ferns' },
  { id: 'perennial', label: 'Perennials' },
  { id: 'bulb', label: 'Bulbs' },
  { id: 'annual', label: 'Annuals' },
];

export const FOLIAGE: { id: Foliage | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'deciduous', label: 'Deciduous' },
  { id: 'evergreen', label: 'Evergreen' },
  { id: 'herbaceous', label: 'Dies back' },
];

/** Ordered sunniest to shadiest, which is how anyone reads a row like this. */
export const SUN: { id: SunPref | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'full', label: 'Full sun' },
  { id: 'dappled', label: 'Dappled shade' },
  { id: 'partial', label: 'Semi shade' },
  { id: 'shade', label: 'Shade' },
];

export const SOIL_PH: { id: SoilPh | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'acidic', label: 'Acidic' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'alkaline', label: 'Alkaline' },
];

export const SOIL_TYPE: { id: SoilType | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'clay', label: 'Clay' },
  { id: 'loam', label: 'Loam' },
  { id: 'sand', label: 'Sand' },
  { id: 'chalk', label: 'Chalk' },
];

/** Driest to wettest. */
export const DRAINAGE: { id: DrainagePref | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'free', label: 'Free draining' },
  { id: 'retentive', label: 'Water retentive' },
  { id: 'waterlogged', label: 'Waterlogged' },
  { id: 'bog', label: 'Bog' },
  { id: 'pond', label: 'Pond' },
];

/**
 * Smallest first. The three classes overlap in real height — a "small" plant may
 * reach two metres and a "medium" one starts below one — so this sorts by the
 * kind of thing it is rather than by a measurement. The height on each card is
 * the precise answer.
 */
export const SIZES: { id: SizeClass | 'all'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

/**
 * A threshold, not an exact match: picking H5 shows everything hardy to H5 *or
 * better*, because a hardier plant is a safer answer to "will this survive
 * here", never a wrong one. Every other row on this panel narrows by equality;
 * this one cannot, and the caption says "hardy to" so the difference reads.
 */
export const HARDINESS: { id: 'all' | 'H4' | 'H5' | 'H6' | 'H7'; label: string }[] = [
  { id: 'all', label: 'Any' },
  { id: 'H4', label: 'H4+' },
  { id: 'H5', label: 'H5+' },
  { id: 'H6', label: 'H6+' },
  { id: 'H7', label: 'H7' },
];

export const SUN_LABELS: Record<SunPref, string> = {
  full: 'full sun',
  dappled: 'dappled shade',
  partial: 'semi shade',
  shade: 'shade',
};

export const SOIL_PH_LABELS: Record<SoilPh, string> = {
  acidic: 'acidic',
  neutral: 'neutral',
  alkaline: 'alkaline',
};

export const DRAINAGE_LABELS: Record<DrainagePref, string> = {
  free: 'free draining',
  retentive: 'water retentive',
  waterlogged: 'tolerates waterlogging',
  bog: 'bog',
  pond: 'pond',
};

export const TYPE_ORDER: PlantType[] = [
  'tree',
  'shrub',
  'conifer',
  'climber',
  'grass',
  'fern',
  'perennial',
  'bulb',
  'annual',
];

export function sizeLabel(m: number): string {
  return m < 1 ? `${Math.round(m * 100)} cm` : `${m} m`;
}

export function lifecycleLabel(species: Species): string {
  if (species.lifecycle === 'annual') return 'annual';
  if (species.lifecycle === 'bulb') return 'bulb';
  return species.foliage === 'herbaceous' ? 'dies back' : species.foliage;
}
