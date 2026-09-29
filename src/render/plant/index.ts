/**
 * Drawing a plant, in plan and in elevation.
 *
 * Both views read the same skeleton from `form.ts` and the same phase and size,
 * so a tree that has just dropped its leaves in plan is the same bare tree in
 * the elevation strip below. Plan view carries arrangement and shadow;
 * elevation carries height, silhouette and the seasonal changes that a top-down
 * drawing simply cannot show.
 *
 * This was one file of 1,557 lines. It is now one folder: the two views, the
 * shapes that needed a file of their own, and the pieces they share. Nothing
 * outside the folder knows that — the four callers import from here exactly as
 * they did before, and the drawing is unchanged to the byte.
 */
export { canopyOutline, type DrawContext } from './shared';
export { drawPlantPlan } from './plan';
export { drawPlantElevation } from './elevation';
