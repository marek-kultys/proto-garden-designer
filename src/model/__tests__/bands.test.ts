import { describe, expect, it } from 'vitest';
import { bandThresholds } from '../shade';

describe('sun/shade band thresholds', () => {
  it('uses the familiar horticultural figures on a long day', () => {
    const summer = bandThresholds(16.6);
    expect(summer.fullSun).toBe(6);
    expect(summer.partial).toBe(3);
  });

  it('scales them down on a short winter day', () => {
    // Six hours out of an 8.3-hour December day is 72% of all available light;
    // holding the summer figure there would report almost the whole plot as
    // shaded regardless of what was planted.
    const winter = bandThresholds(8.3);
    expect(winter.fullSun).toBeLessThan(6);
    expect(winter.fullSun).toBeCloseTo(4.565, 2);
    expect(winter.partial).toBeCloseTo(2.075, 2);
  });

  it('keeps full sun above partial at every day length', () => {
    for (let hours = 0; hours <= 24; hours += 0.5) {
      const t = bandThresholds(hours);
      expect(t.fullSun).toBeGreaterThanOrEqual(t.partial);
      expect(t.fullSun).toBeLessThanOrEqual(Math.max(hours, 6));
    }
  });
});
