export type PlantType = 'tree' | 'shrub' | 'conifer' | 'grass' | 'perennial';

/** Silhouette family — picks which draw function renders the plant. */
export type Habit =
  | 'round' // broad rounded crown (birch, maple)
  | 'multistem' // several stems from the base (amelanchier)
  | 'columnar' // clipped upright (yew)
  | 'mound' // dense dome (hydrangea, lavender)
  | 'tussock' // arching clump with flower spikes (grasses)
  | 'clump' // low leafy mound (hosta, geranium)
  | 'airy'; // sparse see-through stems (verbena)

/**
 * deciduous  — woody, drops its leaves
 * evergreen  — woody, keeps them
 * herbaceous — dies back to the ground entirely in winter
 */
export type Foliage = 'deciduous' | 'evergreen' | 'herbaceous';

export type SunPref = 'full' | 'partial' | 'shade';
export type SizeClass = 'small' | 'medium' | 'large';

export interface Species {
  id: string;
  common: string;
  latin: string;
  genus: string;
  family: string;
  type: PlantType;
  habit: Habit;
  foliage: Foliage;

  /** Kept at a maintained size by clipping rather than growing to full size. */
  clipped?: boolean;
  /** Metres per year, only used for clipped subjects. */
  annualGrowth?: number;

  // Dimensions in metres.
  plantedHeight: number;
  plantedSpread: number;
  matureHeight: number;
  matureSpread: number;
  yearsToMature: number;

  // Phenology, as day-of-year at the reference site (London, 51.5°N, sea level).
  budBurst: number;
  fullLeaf: number;
  autumnStart: number;
  leafFall: number;
  flowerStart: number;
  flowerEnd: number;
  /** Grasses and seedheads that stand through winter. */
  winterStructure?: boolean;

  colors: {
    leafSpring: string;
    leafSummer: string;
    leafAutumn: string;
    flower: string;
    /** Some flowers age through a second colour — hydrangea lime to pink. */
    flowerLate?: string;
    bark: string;
  };

  sun: SunPref[];
  hardiness: string;
  sizeClass: SizeClass;
  /** Human-readable flower colour, used by the library filters. */
  flowerColour: string;
  foliageColour: string;

  notes: string;
  source: string;
}

export interface PlantInstance {
  id: string;
  speciesId: string;
  /** Position in plot space, metres. */
  x: number;
  y: number;
  /** Stable per-instance randomness so the sketchy linework never shimmers. */
  seed: number;
}

export interface Site {
  latitude: number;
  longitude: number;
  /** Metres above sea level. */
  altitude: number;
  /**
   * Where north points on the canvas, in degrees clockwise from screen-up.
   * 0 = north is up the screen.
   */
  northAngle: number;
  /** Observe summer time (BST/CEST rules). */
  dst: boolean;
  label: string;
}

export interface TimeState {
  /** Local clock time, 0–24, fractional. */
  hour: number;
  /** Day of year, 1–365. */
  doy: number;
  /** Years from now, 0–20. */
  year: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Plot boundary as a closed polygon in metres. */
export type Plot = Vec2[];

/** Size of a plant at a given moment, metres. */
export interface PlantSize {
  height: number;
  spread: number;
}

/** How a plant looks on a given day of the year, all 0–1. */
export interface Phase {
  /** 0 = bare, 1 = full canopy. */
  leafCover: number;
  /** 0 = green, 1 = full autumn colour. */
  autumn: number;
  /** 0 = mature foliage, 1 = fresh spring growth. */
  spring: number;
  /** 0 = no flower, 1 = peak flower. */
  flower: number;
  /** Dry seedheads standing over winter. */
  seedhead: number;
  /** Herbaceous plant is below ground — draw nothing. */
  dormant: boolean;
}
