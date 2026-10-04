import { hexToRgb, rgbToCss } from './palette';

/**
 * The interface's own colours — the paper, the ink, the selection blue.
 *
 * Not the garden's. A plant's greens, a flower's pink and a brick's red are
 * computed from the species and the light in `palette.ts`; these are the
 * colours of the thing you are looking *through*, and they do not change with
 * the season or the hour.
 *
 * They exist here because the interface is drawn twice over, in two languages
 * that cannot see each other. The panels are CSS, which reads the custom
 * properties in `styles.css`; the plan, the elevation and the 360° view are a
 * canvas, which cannot read a custom property at all and needs a string. So the
 * selection blue was written out in eleven places in the drawing code, the warm
 * accent in five and the paper in two, every one of them a literal that knew
 * nothing about the stylesheet. Changing `--accent` turned the panels a new
 * blue and left the plan on the old one.
 *
 * This is now the only place they are written down. The stylesheet declares no
 * colours of its own: `applyChrome` below sets the custom properties from these
 * before React mounts, so `var(--accent)` in CSS and `chrome('accent')` on the
 * canvas are the same value by construction rather than by agreement.
 *
 * The one exception is `body`, which keeps a literal fallback for the moment
 * before any of this has run — see the note on it in `styles.css`.
 */
export const CHROME = {
  /** The page itself. */
  paper: '#f7f4ec',
  /** A panel standing on the paper — slightly lighter, not white. */
  panel: '#fffdf8',
  /** Text, and anything drawn as if written. */
  ink: '#24221e',
  inkSoft: '#5f5a51',
  inkFaint: '#928c80',
  /** Ordinary rules and borders. */
  line: '#e0dacd',
  /** A rule that has to be seen rather than felt. */
  lineStrong: '#cfc7b6',
  /** Selection, and the viewpoint: the one blue in a garden of greens. */
  accent: '#3f80b0',
  /** The sight line and its handles — warm, so it reads against the accent. */
  accentWarm: '#b05c30',
} as const;

export type ChromeColour = keyof typeof CHROME;

/**
 * One of those colours as a canvas fill or stroke, optionally faded.
 *
 * The canvas wants `rgba(63, 128, 176, 0.3)` where the stylesheet wants
 * `var(--accent)`. Rather than write out both forms of every shade, the alpha
 * is applied here from the one hex above.
 */
export function chrome(colour: ChromeColour, alpha = 1): string {
  return rgbToCss(hexToRgb(CHROME[colour]), alpha);
}

/** `accentWarm` is `--accent-warm`: the stylesheet's spelling of the same name. */
function property(colour: ChromeColour): string {
  return `--${colour.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * Hand the colours to the stylesheet, which cannot reach them any other way.
 *
 * Called once, before anything is rendered. Everything visible is drawn by
 * React or onto a canvas, so nothing is on screen to be recoloured — the page
 * is simply painted correctly the first time.
 */
export function applyChrome(root: HTMLElement): void {
  for (const colour of Object.keys(CHROME) as ChromeColour[]) {
    root.style.setProperty(property(colour), CHROME[colour]);
  }
}
