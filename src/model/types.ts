export type PlantType = 'tree' | 'shrub' | 'conifer' | 'grass' | 'perennial' | 'annual';

/** Silhouette family — picks which draw function renders the plant. */
export type Habit =
  | 'round' // broad rounded crown (birch, maple)
  | 'multistem' // several stems from the base (amelanchier)
  | 'columnar' // clipped upright (yew)
  | 'mound' // dense dome (hydrangea, lavender)
  | 'tussock' // arching clump with flower spikes (grasses)
  | 'clump' // low leafy mound (hosta, geranium)
  | 'airy' // sparse see-through stems (verbena)
  | 'globe'; // bare stems each topped with a sphere (allium)

/**
 * deciduous  — woody, drops its leaves
 * evergreen  — woody, keeps them
 * herbaceous — dies back to the ground entirely in winter
 */
export type Foliage = 'deciduous' | 'evergreen' | 'herbaceous';

export type SunPref = 'full' | 'partial' | 'shade';
export type SizeClass = 'small' | 'medium' | 'large';

/**
 * How the plant persists, where that differs from "it just carries on".
 *
 * This does not feed the maths — growth and phenology handle these through
 * their ordinary parameters — but it changes what the age slider *means*, and a
 * designer needs telling. A cosmos is the same size in year 20 as in year 1
 * because it is a different plant each year; an allium is gone by midsummer
 * because it has gone back to the bulb, not because it died.
 */
export type Lifecycle = 'annual' | 'bulb';

/**
 * A window in the year during which dry structure stands: seedheads, dead
 * stems, spent flowerheads. `to` earlier than `from` means it crosses the new
 * year, which is the normal case for grasses left up until a February cut-back.
 */
export interface StandingWindow {
  from: number;
  to: number;
}

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
  /**
   * Flowering window. `flowerEnd` earlier than `flowerStart` means it crosses
   * the new year — Viburnum tinus opens in November and carries on to April.
   */
  flowerStart: number;
  flowerEnd: number;
  /** Flowers open on bare wood before the leaves — magnolia, forsythia. */
  flowersOnBareWood?: boolean;
  /** Dry structure left standing; omit for anything that collapses and goes. */
  standing?: StandingWindow;
  /** Berries or fruit, if they are worth drawing. */
  fruitStart?: number;
  fruitEnd?: number;

  lifecycle?: Lifecycle;

  colors: {
    leafSpring: string;
    leafSummer: string;
    leafAutumn: string;
    flower: string;
    /** Some flowers age through a second colour — hydrangea lime to pink. */
    flowerLate?: string;
    fruit?: string;
    /**
     * Trunk and stems. For a dogwood grown for its winter stems this is the
     * whole point of the plant, so it carries the flame colour, not a brown.
     */
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
  /** How far through the flowering window, for blooms that age through a colour. */
  flowerAge: number;
  /** Berries or fruit on the plant. */
  fruit: number;
  /** Dry seedheads standing over winter. */
  seedhead: number;
  /** Herbaceous plant is below ground — draw nothing. */
  dormant: boolean;
}
