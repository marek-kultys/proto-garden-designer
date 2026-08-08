import type { Site } from './types';

/**
 * Solar position using the NOAA general solar position equations.
 *
 * Gardeners read shadows for a living, so a plausible-looking fake sun would be
 * spotted immediately. Doing this properly is what makes latitude, longitude and
 * the north dial actually mean something: at London the sun reaches ~62° at
 * midsummer noon but only ~15° at midwinter noon, so the same tree throws a
 * shadow roughly four times longer in December than in June, for free.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export interface SolarPosition {
  /** Degrees above the horizon; negative when the sun is down. */
  altitude: number;
  /** Degrees clockwise from true north (90 = east, 180 = south, 270 = west). */
  azimuth: number;
}

export interface DayLength {
  /** Local clock hours, or null when the sun never rises/sets that day. */
  sunrise: number | null;
  sunset: number | null;
  solarNoon: number;
  /** Hours of daylight. */
  daylight: number;
}

/** Day of year (1-based) of the last Sunday of a given month. */
function lastSundayDoy(year: number, month: number): number {
  // month is 0-based; day 0 of month+1 is the last day of `month`.
  const last = new Date(Date.UTC(year, month + 1, 0));
  const day = last.getUTCDate() - last.getUTCDay();
  const date = new Date(Date.UTC(year, month, day));
  return dayOfYear(date);
}

export function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86_400_000) + 1;
}

/** Summer time under the EU/UK rule: last Sunday in March to last Sunday in October. */
export function isSummerTime(doy: number, calendarYear: number): boolean {
  return doy >= lastSundayDoy(calendarYear, 2) && doy < lastSundayDoy(calendarYear, 9);
}

/**
 * Standard-time offset from UTC in hours, inferred from longitude. Exact for the
 * UK and close enough elsewhere for a design tool.
 */
export function standardOffset(longitude: number): number {
  const offset = Math.round(longitude / 15);
  // Longitudes just west of Greenwich round to -0, which is numerically fine but
  // surfaces as "-0" wherever the offset is displayed or compared.
  return offset === 0 ? 0 : offset;
}

export function utcOffset(site: Site, doy: number, calendarYear: number): number {
  const base = standardOffset(site.longitude);
  return site.dst && isSummerTime(doy, calendarYear) ? base + 1 : base;
}

interface SolarTerms {
  declination: number; // radians
  eqTime: number; // minutes
}

function solarTerms(doy: number, hour: number): SolarTerms {
  // Fractional year, radians.
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hour - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const declination =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return { declination, eqTime };
}

/**
 * Sun altitude and azimuth for a site at a local clock time.
 *
 * The horizontal direction is built as a vector in a south/east/up frame rather
 * than from one of the many sign-convention-dependent azimuth formulae — it is
 * far harder to get subtly wrong, and it stays correct when the sun swings north
 * of east/west on midsummer mornings and evenings.
 */
export function solarPosition(
  site: Site,
  doy: number,
  hour: number,
  calendarYear: number,
): SolarPosition {
  const { declination: decl, eqTime } = solarTerms(doy, hour);
  const tz = utcOffset(site, doy, calendarYear);
  const lat = site.latitude * RAD;

  // True solar time, minutes past local midnight.
  const timeOffset = eqTime + 4 * site.longitude - 60 * tz;
  const tst = hour * 60 + timeOffset;
  const ha = (tst / 4 - 180) * RAD; // hour angle: 0 at solar noon, + in the afternoon

  const sinAlt =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * DEG;

  const south = Math.cos(decl) * Math.cos(ha) * Math.sin(lat) - Math.sin(decl) * Math.cos(lat);
  const east = -Math.cos(decl) * Math.sin(ha);
  let azimuth = Math.atan2(east, -south) * DEG;
  if (azimuth < 0) azimuth += 360;

  return { altitude, azimuth };
}

/** Sunrise, sunset and solar noon in local clock hours. */
export function dayLength(site: Site, doy: number, calendarYear: number): DayLength {
  const { declination: decl, eqTime } = solarTerms(doy, 12);
  const tz = utcOffset(site, doy, calendarYear);
  const lat = site.latitude * RAD;

  // 90.833° accounts for refraction and the sun's disc.
  const cosH0 =
    Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const noon = (720 - eqTime - 4 * site.longitude + 60 * tz) / 60;

  if (cosH0 > 1) return { sunrise: null, sunset: null, solarNoon: noon, daylight: 0 };
  if (cosH0 < -1) return { sunrise: null, sunset: null, solarNoon: noon, daylight: 24 };

  const h0 = Math.acos(cosH0) * DEG;
  const sunrise = noon - h0 / 15;
  const sunset = noon + h0 / 15;
  return { sunrise, sunset, solarNoon: noon, daylight: sunset - sunrise };
}

/**
 * How far a shadow reaches, in multiples of the caster's height. Clamped because
 * the true value runs to infinity as the sun touches the horizon.
 */
export function shadowLengthFactor(altitude: number): number {
  if (altitude <= 0.5) return 0;
  return Math.min(12, 1 / Math.tan(altitude * RAD));
}

/**
 * Fraction of full strength reaching the ground: zero at the horizon, rising as
 * the sun climbs and the path through the atmosphere shortens.
 */
export function sunIntensity(altitude: number): number {
  if (altitude <= 0) return 0;
  const airMass = 1 / (Math.sin(altitude * RAD) + 0.15 * Math.pow(altitude + 3.885, -1.253));
  return Math.pow(0.7, Math.pow(airMass, 0.678));
}

/** Convert a plot-space compass bearing into a canvas angle, honouring the north dial. */
export function bearingToCanvas(bearing: number, northAngle: number): number {
  // Canvas angle 0 = +x (right), measured clockwise because y grows downward.
  // Bearing 0 (north) should point along the north dial direction, which is
  // `northAngle` clockwise from screen-up (-90° in canvas terms).
  return (bearing + northAngle - 90) * RAD;
}
