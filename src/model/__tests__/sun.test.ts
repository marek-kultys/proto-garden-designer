import { describe, expect, it } from 'vitest';
import {
  dayLength,
  isSummerTime,
  shadowLengthFactor,
  solarPosition,
  utcOffset,
} from '../sun';
import type { Site } from '../types';

/**
 * These are checked against published figures for London rather than against
 * the implementation's own output. Solar geometry is easy to get subtly wrong —
 * a sign flip in the hour angle, a longitude convention, a missing equation of
 * time — and every such error would show up in the app as shadows pointing the
 * wrong way, which is the one thing a garden designer will spot instantly.
 */

const LONDON: Site = {
  latitude: 51.5,
  longitude: -0.13,
  altitude: 0,
  northAngle: 0,
  dst: true,
  label: 'London',
};

const MIDSUMMER = 172; // 21 June
const MIDWINTER = 355; // 21 December
const YEAR = 2026;

function noonAltitude(site: Site, doy: number): number {
  const noon = dayLength(site, doy, YEAR).solarNoon;
  return solarPosition(site, doy, noon, YEAR).altitude;
}

describe('solar position', () => {
  it('puts the midsummer noon sun about 62° above London', () => {
    // 90 - 51.5 + 23.44 = 61.9
    expect(noonAltitude(LONDON, MIDSUMMER)).toBeCloseTo(61.9, 0);
  });

  it('puts the midwinter noon sun about 15° above London', () => {
    // 90 - 51.5 - 23.44 = 15.1
    expect(noonAltitude(LONDON, MIDWINTER)).toBeCloseTo(15.1, 0);
  });

  it('faces due south at solar noon', () => {
    for (const doy of [1, 80, MIDSUMMER, 250, MIDWINTER]) {
      const noon = dayLength(LONDON, doy, YEAR).solarNoon;
      expect(solarPosition(LONDON, doy, noon, YEAR).azimuth).toBeCloseTo(180, 0);
    }
  });

  it('swings north of west on a midsummer evening', () => {
    // At 20:00 BST in late June the London sun sits in the north-west, not the
    // west — a formula that clamps azimuth to the southern half would miss this.
    const { azimuth, altitude } = solarPosition(LONDON, MIDSUMMER, 20, YEAR);
    expect(altitude).toBeGreaterThan(0);
    expect(azimuth).toBeGreaterThan(280);
    expect(azimuth).toBeLessThan(315);
  });

  it('rises in the south-east in midwinter', () => {
    const { sunrise } = dayLength(LONDON, MIDWINTER, YEAR);
    const { azimuth } = solarPosition(LONDON, MIDWINTER, sunrise! + 0.25, YEAR);
    expect(azimuth).toBeGreaterThan(120);
    expect(azimuth).toBeLessThan(145);
  });

  it('is below the horizon at midnight', () => {
    expect(solarPosition(LONDON, MIDSUMMER, 0, YEAR).altitude).toBeLessThan(0);
  });
});

describe('sunrise and sunset', () => {
  it('matches published London times at midwinter (GMT)', () => {
    // Published: sunrise 08:04, sunset 15:53.
    const { sunrise, sunset } = dayLength(LONDON, MIDWINTER, YEAR);
    expect(sunrise).toBeCloseTo(8 + 4 / 60, 1);
    expect(sunset).toBeCloseTo(15 + 53 / 60, 1);
  });

  it('matches published London times at midsummer (BST)', () => {
    // Published: sunrise 04:43, sunset 21:21.
    const { sunrise, sunset, daylight } = dayLength(LONDON, MIDSUMMER, YEAR);
    expect(sunrise).toBeCloseTo(4 + 43 / 60, 1);
    expect(sunset).toBeCloseTo(21 + 21 / 60, 1);
    expect(daylight).toBeCloseTo(16.6, 1);
  });

  it('gives Edinburgh a longer midsummer day than Penzance', () => {
    const edinburgh: Site = { ...LONDON, latitude: 55.95, longitude: -3.19 };
    const penzance: Site = { ...LONDON, latitude: 50.12, longitude: -5.54 };
    expect(dayLength(edinburgh, MIDSUMMER, YEAR).daylight).toBeGreaterThan(
      dayLength(penzance, MIDSUMMER, YEAR).daylight + 1,
    );
  });

  it('reports polar day above the Arctic Circle in June', () => {
    const tromso: Site = { ...LONDON, latitude: 69.65, longitude: 18.96, dst: false };
    expect(dayLength(tromso, MIDSUMMER, YEAR).daylight).toBe(24);
  });
});

describe('clock offsets', () => {
  it('applies summer time between late March and late October', () => {
    expect(isSummerTime(1, YEAR)).toBe(false);
    expect(isSummerTime(MIDSUMMER, YEAR)).toBe(true);
    expect(isSummerTime(MIDWINTER, YEAR)).toBe(false);
  });

  it('shifts the UK clock by an hour in summer only', () => {
    expect(utcOffset(LONDON, MIDWINTER, YEAR)).toBe(0);
    expect(utcOffset(LONDON, MIDSUMMER, YEAR)).toBe(1);
    expect(utcOffset({ ...LONDON, dst: false }, MIDSUMMER, YEAR)).toBe(0);
  });
});

describe('shadow length', () => {
  it('is roughly four times longer at midwinter noon than at midsummer noon', () => {
    const summer = shadowLengthFactor(noonAltitude(LONDON, MIDSUMMER));
    const winter = shadowLengthFactor(noonAltitude(LONDON, MIDWINTER));
    expect(winter / summer).toBeGreaterThan(3.5);
    expect(winter / summer).toBeLessThan(8);
  });

  it('equals the caster height when the sun is at 45°', () => {
    expect(shadowLengthFactor(45)).toBeCloseTo(1, 3);
  });

  it('is clamped rather than infinite at the horizon', () => {
    expect(shadowLengthFactor(0)).toBe(0);
    expect(shadowLengthFactor(0.2)).toBe(0);
    expect(shadowLengthFactor(1)).toBeLessThanOrEqual(12);
  });
});
