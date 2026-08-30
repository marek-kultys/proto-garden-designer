import { bearingToCanvas } from './sun';
import type { Site, Vec2 } from './types';

/**
 * Standing in the garden and looking around.
 *
 * The plan says where things go and the elevation says how tall they are; both
 * are drawings. This is the first view that answers the question a client
 * actually asks — what will it look like from the terrace? — and it is a
 * different projection from either: a cylindrical panorama from an eye point
 * inside the plot, where distance genuinely matters and a shrub two metres away
 * can hide a tree twenty metres off.
 *
 * Cylindrical rather than a flat perspective plane on purpose. A pinhole
 * projection multiplies by tan(angle), which runs away at the edges and makes a
 * wide view unusable; mapping angle linearly to pixels keeps a 90° field
 * undistorted and lets the same maths carry on smoothly through a full turn.
 */

/**
 * Eye height, in metres, of the person the view is drawn for.
 *
 * 1.6 m is the conventional architectural eye level — a person of about 1.71 m,
 * since eyes sit some 10–12 cm below the top of the head. It is close to the
 * average adult man and a good deal above the average adult woman, whose eyes
 * are nearer 1.50 m.
 *
 * That gap is not cosmetic. Twenty centimetres decides whether a 1.5 m hedge or
 * a stand of miscanthus is something you see over or something you see, so two
 * people in the same garden genuinely disagree about whether it is enclosed.
 * Hence a control rather than a constant; this is only the starting value.
 */
export const DEFAULT_EYE_HEIGHT = 1.6;

/**
 * Eye heights worth comparing a design against. Figures are stature less the
 * ~11 cm from the crown of the head to the eyes, except the seated one, which
 * is sitting eye height above a 45 cm bench.
 */
export const EYE_PRESETS: { label: string; height: number }[] = [
  { label: 'Child, about 7', height: 1.12 },
  { label: 'Seated on a bench', height: 1.22 },
  { label: 'Average adult', height: 1.57 },
  { label: 'Standard eye level', height: DEFAULT_EYE_HEIGHT },
  { label: 'Tall adult', height: 1.78 },
];

/** Common places to stand that are not the lawn. */
export const GROUND_PRESETS: { label: string; height: number }[] = [
  { label: 'On the ground', height: 0 },
  { label: 'Raised terrace', height: 0.45 },
  { label: 'Deck or low wall', height: 1.1 },
  { label: 'First-floor window', height: 2.8 },
];

export function clampEyeHeight(m: number): number {
  return Math.max(0.3, Math.min(3, m));
}

export function clampGroundHeight(m: number): number {
  return Math.max(0, Math.min(20, m));
}

/** Nothing is drawn closer than this — you would be standing in it. */
export const MIN_DISTANCE = 0.8;

/**
 * The least sky-plus-ground the picture will ever show, in degrees.
 *
 * Horizontal and vertical share one scale — that is what makes it a panorama
 * rather than a stretched drawing — so a narrow field in a short wide panel
 * magnifies everything vertically until a shrub three metres away fills the
 * frame and the horizon falls off the bottom. Rather than distort, the field is
 * allowed to open out: you see wider than you asked for instead of closer.
 *
 * Lowered from 50 after testing: on a short panel a 50 degree floor forced the
 * view out past 140 degrees, and a gardener's word for that picture was
 * "deformed" — which is fair, since a cylindrical projection that wide bends
 * every straight line in the garden. At 28 the requested field is honoured in
 * most panels, and the width control below is worth having because of it. The
 * cost is less sky and ground at once, which the tilt already answers.
 */
export const MIN_VERTICAL_FOV = 28;

/** The field the viewer may ask for, in degrees. */
export const FOV_RANGE = { min: 45, max: 140, step: 5 };

/** Pixels per degree of arc — the one number the whole projection hangs off. */
export function pixelsPerDegree(width: number, height: number, requestedFov: number): number {
  return Math.min(width / Math.max(1, requestedFov), height / MIN_VERTICAL_FOV);
}

/**
 * The horizontal field actually rendered, which is the requested one only when
 * the panel is tall enough to hold it.
 */
export function effectiveFov(width: number, height: number, requestedFov: number): number {
  return width / pixelsPerDegree(width, height, requestedFov);
}

export interface Observer {
  x: number;
  y: number;
  /** Compass bearing the viewer faces, degrees clockwise from north. */
  heading: number;
  /** Horizontal field of view, degrees. */
  fov: number;
  /** Degrees above the horizontal the viewer is looking; negative is down. */
  pitch: number;
  /** Height of the viewer's eyes above whatever they are standing on, metres. */
  eyeHeight: number;
  /** Height of that surface above the plot — a terrace step, an upstairs window. */
  groundHeight: number;
}

/**
 * How far the eye is above the ground the plants grow out of.
 *
 * The projection only ever needs this one number: standing 1.6 m tall on a
 * 45 cm terrace is, as far as the geometry is concerned, being 2.05 m tall on
 * the lawn. Keeping them as two inputs is for the person, not the maths.
 */
export function eyeElevation(observer: Observer): number {
  return observer.eyeHeight + observer.groundHeight;
}

/**
 * How far up and down the view will tilt.
 *
 * Not decoration. Horizontal and vertical share one scale, so a panel wide
 * enough to be useful can only ever show forty-odd degrees of sky — and
 * standing seven metres from a twelve-metre birch you have to look up nearly
 * sixty to see the top of it. Without a tilt the answer to "does my tree fit
 * under next door's roofline?" is permanently cropped off the top of the frame.
 */
export const MAX_PITCH_UP = 55;
export const MAX_PITCH_DOWN = 30;

export function clampPitch(pitch: number): number {
  return Math.max(-MAX_PITCH_DOWN, Math.min(MAX_PITCH_UP, pitch));
}

export interface Sighting {
  /** Metres from the eye. */
  distance: number;
  /** Compass bearing of the target from the eye. */
  bearing: number;
  /** Signed degrees from the centre of view; negative is to the left. */
  offset: number;
}

export function normaliseBearing(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Shortest signed difference from `a` to `b`, in the range (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = normaliseBearing(b - a);
  if (d > 180) d -= 360;
  return d;
}

/**
 * Compass bearing of a plot-space direction.
 *
 * Plot space is the drawing's own frame — x right, y down — and north sits
 * wherever the north dial puts it, so this is the inverse of the mapping the
 * shadows already use.
 */
export function bearingOf(dx: number, dy: number, northAngle: number): number {
  const canvasDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return normaliseBearing(canvasDeg + 90 - northAngle);
}

/** Where a point in the plot sits relative to the viewer. */
export function sight(observer: Observer, target: Vec2, site: Site): Sighting {
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  const bearing = bearingOf(dx, dy, site.northAngle);
  return {
    distance: Math.max(MIN_DISTANCE, Math.hypot(dx, dy)),
    bearing,
    offset: angleDelta(observer.heading, bearing),
  };
}

/**
 * Half the angular width a plant subtends, in degrees.
 *
 * Used to decide visibility rather than to size the drawing: something wide and
 * close still has to be drawn when its centre has swung out of frame, or it
 * would vanish the instant you turned towards it.
 */
export function angularHalfWidth(spread: number, distance: number): number {
  return (Math.atan(spread / 2 / Math.max(MIN_DISTANCE, distance)) * 180) / Math.PI;
}

export function isInView(sighting: Sighting, spread: number, fov: number): boolean {
  return Math.abs(sighting.offset) <= fov / 2 + angularHalfWidth(spread, sighting.distance) + 2;
}

/** Turn the observer, keeping the heading a proper compass bearing. */
export function turn(observer: Observer, byDegrees: number): Observer {
  return { ...observer, heading: normaliseBearing(observer.heading + byDegrees) };
}

/** The plot-space direction the viewer faces, as a unit vector. */
export function facingVector(observer: Observer, site: Site): Vec2 {
  const a = bearingToCanvas(observer.heading, site.northAngle);
  return { x: Math.cos(a), y: Math.sin(a) };
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The eight compass points, for the strip along the horizon. */
export function compassMarks(): { bearing: number; label: string }[] {
  return POINTS.map((label, i) => ({ bearing: i * 45, label }));
}
