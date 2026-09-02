/**
 * How deep a slice the elevation strip shows, in metres, measured across the
 * sight line — half of it either side.
 *
 * Adjustable rather than fixed, because the two useful questions want opposite
 * answers: a narrow slice reads one row cleanly and checks a single specimen
 * against a wall, while a wide one shows whether a whole border steps up
 * properly from its front edge to its back.
 */
export const SLICE_DEPTH_RANGE = { min: 5, max: 20, step: 0.5 };
export const DEFAULT_SLICE_DEPTH = 5;

/** Metres either side of the line, which is what the geometry actually wants. */
export function sliceHalfWidth(depth: number): number {
  return Math.max(SLICE_DEPTH_RANGE.min, Math.min(SLICE_DEPTH_RANGE.max, depth)) / 2;
}

/** Minimum vertical extent the elevation strip is scaled for, in metres. */
export const MIN_ELEVATION_HEIGHT = 5;

/**
 * The longest a drawn shadow may be, as a multiple of the caster's height.
 *
 * The sun map measures shadows out to sixty times the height, because at a
 * grazing sun that is the truth. A drawing cannot use that: one shadow would
 * cover the paper and tell you nothing. Twelve is what the flat calculation
 * always capped at, so keeping it means level gardens are drawn exactly as
 * before while a slope now lengthens and shortens shadows as it should.
 */
export const DRAWN_SHADOW_CAP = 12;
