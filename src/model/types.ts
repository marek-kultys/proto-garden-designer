export type PlantType =
  | 'tree'
  | 'shrub'
  | 'conifer'
  | 'climber'
  | 'grass'
  | 'fern'
  | 'perennial'
  | 'bulb'
  | 'annual';

/** Silhouette family — picks which draw function renders the plant. */
export type Habit =
  | 'round' // broad rounded crown (birch, maple)
  | 'multistem' // several stems from the base (amelanchier)
  | 'columnar' // clipped upright (yew)
  | 'mound' // dense dome (hydrangea, lavender)
  | 'tussock' // arching clump with flower spikes (grasses)
  | 'clump' // low leafy mound (hosta, geranium)
  | 'airy' // sparse see-through stems (verbena)
  | 'globe' // bare stems each topped with a sphere (allium)
  | 'spire' // basal leaves under a tall dense flower spike (delphinium, foxglove)
  | 'fern' // a shuttlecock of arching fronds (dryopteris)
  | 'treefern' // a fibrous trunk carrying a fern crown (dicksonia)
  | 'climber'; // a sheet of growth on a support rather than a free-standing mass

/**
 * deciduous  — woody, drops its leaves
 * evergreen  — woody, keeps them
 * herbaceous — dies back to the ground entirely in winter
 */
export type Foliage = 'deciduous' | 'evergreen' | 'herbaceous';

/**
 * Aspect a plant will take.
 *
 * `dappled` is not a midpoint between sun and shade — it is the moving, broken
 * light under a deciduous canopy, and it is what several of these plants
 * actually want rather than merely tolerate. A hellebore or a Japanese maple in
 * open partial shade is a different and worse plant than the same one under a
 * birch, so the distinction earns its place in the data.
 */
export type SunPref = 'full' | 'dappled' | 'partial' | 'shade';
/**
 * Soil pH a plant will grow in.
 *
 * Most garden plants take all three and the field is unremarkable for them.
 * It exists for the ones where it decides the outcome: a magnolia or a Japanese
 * maple on shallow chalk yellows and sulks however well it is planted, and
 * lavender on a wet acid clay simply rots. Those are failures no amount of good
 * design recovers from, which is why this is data rather than a note.
 */
export type SoilPh = 'acidic' | 'neutral' | 'alkaline';

/**
 * How wet the ground can be.
 *
 * Ordered driest to wettest. The first three are soil conditions; `bog` and
 * `pond` are really planting situations at and in water, and no plant in the
 * current palette will take either — they are here because the axis is only
 * meaningful with its wet end present, and because marginals are the obvious
 * thing to add next.
 *
 * The distinction that does the work now is between plants that merely prefer
 * drainage and plants that require it. Lavender, salvia and echinacea rot in
 * ground that stays wet in winter, and a clipped yew in a wet hollow dies where
 * a dogwood two metres away thrives.
 */
export type DrainagePref = 'free' | 'retentive' | 'waterlogged' | 'bog' | 'pond';

/**
 * Texture of the ground, which is a separate question from its pH and its
 * wetness even though the three correlate in practice — chalk is usually
 * alkaline and free-draining, clay usually heavy and slow.
 *
 * Kept separate because the exceptions are exactly the cases a designer is
 * paid to get right: a rose is superb on clay and poor on dry sand, and a
 * lavender is the other way round, at the same pH.
 */
export type SoilType = 'clay' | 'loam' | 'sand' | 'chalk';

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
  soilPh: SoilPh[];
  soilType: SoilType[];
  drainage: DrainagePref[];
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
  /**
   * Years of growth this plant had already made when it went in.
   *
   * Nursery stock is 0. A semi-mature specimen bought in at ten years old is
   * 10, and is that much further along its curve for the whole life of the
   * design — so at year 0 it is already a tree while everything round it is a
   * whip, and at year 20 it is a thirty-year-old.
   *
   * Per plant rather than per garden, because the garden-wide version of this
   * is the age slider, which already exists. What this adds is the thing a
   * designer actually does: buy structure in for one or two key plants and let
   * the rest catch up.
   */
  plantedAge: number;
}

/**
 * Built things in the garden, as opposed to grown ones.
 *
 * `wall` is a run of points with a thickness — a garden wall, or a solid fence,
 * which is the same thing thinner. `bed` is a closed outline with a low height:
 * a raised bed, whose whole point is that the soil in it sits above the ground,
 * so plants standing in one are lifted by its height.
 */
export type StructureKind = 'wall' | 'bed';

export interface Structure {
  id: string;
  kind: StructureKind;
  /**
   * Plot-space metres. A wall is an open run of two or more points; a bed is a
   * closed outline of three or more.
   */
  points: Vec2[];
  /** Metres above the ground. */
  height: number;
  /** Metres. Walls only; a bed's walls are drawn at a fixed thin gauge. */
  thickness: number;
  /** Stable per-instance randomness, so the sketchy linework never shimmers. */
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
