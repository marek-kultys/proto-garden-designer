import { sunIntensity } from '../model/sun';

/**
 * Colour of light through the day.
 *
 * The time-of-day slider has to do more than move shadows around — the whole
 * scene should warm up and cool down. Low sun travels through much more
 * atmosphere, which scatters the blue out and leaves the familiar orange of
 * early morning and late afternoon; overhead sun is close to white. Everything
 * drawn passes through `shade()`, so a garden at 07:00 in April genuinely looks
 * different from the same garden at 13:00, not just differently shadowed.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface Lighting {
  altitude: number;
  azimuth: number;
  /** Strength of direct sun, 0–1. */
  intensity: number;
  /** Colour of the direct beam. */
  sun: RGB;
  /** Sky fill, which is what lights the shadows. */
  ambient: RGB;
  isDay: boolean;
  /** 0 = full night, 1 = full day, with twilight in between. */
  daylight: number;
  shadowAlpha: number;
  /** How soft shadow edges are, in pixels. */
  shadowBlur: number;
  skyTop: string;
  skyBottom: string;
  groundTint: string;
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const num = parseInt(v, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToCss({ r, g, b }: RGB, alpha = 1): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return alpha >= 1
    ? `rgb(${c(r)}, ${c(g)}, ${c(b)})`
    : `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${alpha.toFixed(3)})`;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k };
}

export function mixHex(a: string, b: string, t: number): RGB {
  return mix(hexToRgb(a), hexToRgb(b), t);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Tanner Helland's approximation of a blackbody colour, normalised to 0–1. */
export function kelvinToRgb(kelvin: number): RGB {
  const t = Math.max(1000, Math.min(12000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  return {
    r: clamp01(r / 255),
    g: clamp01(g / 255),
    b: clamp01(b / 255),
  };
}

const MOONLIGHT: RGB = { r: 0.42, g: 0.5, b: 0.72 };

export function lightingFor(altitude: number, azimuth: number): Lighting {
  const intensity = sunIntensity(altitude);
  // Warm at the horizon, close to daylight white overhead.
  const kelvin = 1900 + 3900 * smoothstep(0, 38, altitude);
  // Pulled back toward white: a literal blackbody colour at 1900 K turns
  // foliage to rust, which reads as a fault rather than as low sun.
  const sun = mix({ r: 1, g: 1, b: 1 }, kelvinToRgb(kelvin), 0.62);

  // Twilight keeps a little light in the sky after the sun has gone.
  const daylight = smoothstep(-7, 3, altitude);
  const isDay = altitude > 0;

  const skyAmbient: RGB = { r: 0.5, g: 0.58, b: 0.72 };
  const ambient = mix(
    { r: MOONLIGHT.r * 0.35, g: MOONLIGHT.g * 0.35, b: MOONLIGHT.b * 0.35 },
    skyAmbient,
    daylight,
  );

  const skyTop = rgbToCss(
    mix({ r: 22, g: 28, b: 48 }, { r: 150, g: 186, b: 224 }, daylight),
  );
  const skyBottom = rgbToCss(
    mix(
      { r: 38, g: 44, b: 66 },
      mix({ r: 246, g: 196, b: 148 }, { r: 214, g: 232, b: 246 }, smoothstep(6, 34, altitude)),
      daylight,
    ),
  );

  return {
    altitude,
    azimuth,
    intensity,
    sun,
    ambient,
    isDay,
    daylight,
    shadowAlpha: 0.1 + 0.28 * intensity,
    shadowBlur: 1 + 14 * (1 - clamp01(altitude / 45)),
    skyTop,
    skyBottom,
    groundTint: rgbToCss(mix({ r: 60, g: 66, b: 82 }, { r: 226, g: 226, b: 210 }, daylight)),
  };
}

export interface ShadeOpts {
  /** 0 = fully in shadow (ambient only), 1 = full sun. */
  exposure?: number;
  /** Lighten or darken before tinting. */
  value?: number;
  alpha?: number;
  /**
   * How strongly the light colours this surface, 0–1.
   *
   * Planting is the subject and takes the full tint. The plot surface takes
   * rather less, and the paper the drawing sits on takes none at all — a sheet
   * of paper is the medium, not part of the garden, and letting golden-hour
   * light turn it peach makes the whole drawing look like a photo filter.
   */
  tintStrength?: number;
}

/**
 * Put a base colour under the current light.
 *
 * Surfaces receive ambient sky light plus whatever direct sun reaches them, and
 * the result is nudged back toward its own hue so foliage never washes out to
 * grey at dusk — a stylised drawing, not a physically correct render.
 */
export function shade(base: RGB | string, light: Lighting, opts: ShadeOpts = {}): string {
  const rgb = typeof base === 'string' ? hexToRgb(base) : base;
  const exposure = opts.exposure ?? 1;
  const value = opts.value ?? 1;

  // Hue and brightness are decided separately, which is the trick that makes
  // this look like a time of day rather than like a filter. Multiplying a base
  // colour by ambient-plus-beam alone ties the two together, and because sky
  // light is blue and the direct beam is weak at low sun, every surface drifts
  // cold and grey exactly when it should be going golden.
  //
  // So: the tint is whichever light is actually falling on the surface — the
  // beam in sun, the sky in shadow — and the tint is then normalised to unit
  // luminance so it only shifts colour. Brightness is applied separately.
  const beam = exposure * smoothstep(-1.5, 4, light.altitude);
  const tint = mix(light.ambient, light.sun, beam);

  const dayFactor = 0.42 + 0.58 * smoothstep(-7, 20, light.altitude);
  const shadowFactor = 0.66 + 0.34 * exposure;
  const brightness = dayFactor * shadowFactor * value;

  const luminance = 0.2126 * tint.r + 0.7152 * tint.g + 0.0722 * tint.b || 1;
  const unit = mix(
    { r: 1, g: 1, b: 1 },
    { r: tint.r / luminance, g: tint.g / luminance, b: tint.b / luminance },
    opts.tintStrength ?? 1,
  );

  let lit: RGB = {
    r: rgb.r * unit.r * brightness,
    g: rgb.g * unit.g * brightness,
    b: rgb.b * unit.b * brightness,
  };

  // Night vision is poor on colour: pull everything toward moonlit blue.
  if (light.daylight < 1) {
    const grey = (lit.r + lit.g + lit.b) / 3;
    const desat = 0.6 * (1 - light.daylight);
    lit = mix(
      lit,
      { r: grey * MOONLIGHT.r * 1.6, g: grey * MOONLIGHT.g * 1.6, b: grey * MOONLIGHT.b * 1.6 },
      desat,
    );
  }

  return rgbToCss(lit, opts.alpha ?? 1);
}

/** Ink colour for linework — near-black by day, softer and bluer at night. */
export function inkColour(light: Lighting, alpha = 1): string {
  const ink = mix({ r: 108, g: 118, b: 140 }, { r: 38, g: 36, b: 32 }, light.daylight);
  return rgbToCss(ink, alpha);
}

/**
 * Foliage colour for a plant on a given day: fresh spring growth, settled summer
 * green, then autumn colour blended in as the season turns.
 */
export function foliageColour(
  colors: { leafSpring: string; leafSummer: string; leafAutumn: string },
  phase: { spring: number; autumn: number },
): RGB {
  const summer = hexToRgb(colors.leafSummer);
  const withSpring = mix(summer, hexToRgb(colors.leafSpring), clamp01(phase.spring) * 0.85);
  return mix(withSpring, hexToRgb(colors.leafAutumn), clamp01(phase.autumn));
}

/** Flower colour, allowing for blooms that age through a second colour. */
export function flowerColour(
  colors: { flower: string; flowerLate?: string },
  seasonProgress: number,
): RGB {
  const early = hexToRgb(colors.flower);
  if (!colors.flowerLate) return early;
  return mix(early, hexToRgb(colors.flowerLate), clamp01(seasonProgress));
}

export { clamp01, smoothstep };
