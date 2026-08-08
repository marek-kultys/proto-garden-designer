import { describe, expect, it } from 'vitest';
import { anchorsFor, phaseAt, seasonShift, doyToLabel } from '../phenology';
import { getSpecies } from '../plants';
import type { Site } from '../types';

const LONDON: Site = {
  latitude: 51.5,
  longitude: -0.13,
  altitude: 0,
  northAngle: 0,
  dst: true,
  label: 'London',
};

const JAN = 10;
const APRIL = 105;
const JULY = 195;
const OCTOBER = 288;

describe('deciduous phenology', () => {
  const birch = getSpecies('betula-jacquemontii');

  it('is bare in January and in full leaf in July', () => {
    expect(phaseAt(birch, JAN, LONDON).leafCover).toBeLessThan(0.05);
    expect(phaseAt(birch, JULY, LONDON).leafCover).toBeGreaterThan(0.95);
  });

  it('shows no autumn colour in spring and strong colour in late October', () => {
    expect(phaseAt(birch, APRIL, LONDON).autumn).toBe(0);
    expect(phaseAt(birch, OCTOBER, LONDON).autumn).toBeGreaterThan(0.6);
  });

  it('still carries leaves when the autumn colour arrives', () => {
    // Leaves must colour before they drop, or the tree turns bare then yellow.
    const colouring = phaseAt(birch, 285, LONDON);
    expect(colouring.autumn).toBeGreaterThan(0.4);
    expect(colouring.leafCover).toBeGreaterThan(0.9);
  });
});

describe('evergreen phenology', () => {
  it('keeps full cover all year but flushes in spring', () => {
    const yew = getSpecies('taxus-baccata');
    for (const doy of [JAN, APRIL, JULY, OCTOBER]) {
      expect(phaseAt(yew, doy, LONDON).leafCover).toBe(1);
    }
    expect(phaseAt(yew, 135, LONDON).spring).toBeGreaterThan(
      phaseAt(yew, JAN, LONDON).spring,
    );
  });
});

describe('herbaceous phenology', () => {
  it('takes the hosta below ground for the winter', () => {
    const hosta = getSpecies('hosta-halcyon');
    expect(phaseAt(hosta, JAN, LONDON).dormant).toBe(true);
    expect(phaseAt(hosta, 330, LONDON).dormant).toBe(true);
    expect(phaseAt(hosta, JULY, LONDON).dormant).toBe(false);
    expect(phaseAt(hosta, JULY, LONDON).leafCover).toBeGreaterThan(0.9);
  });

  it('leaves the grass standing through winter as seedheads', () => {
    const grass = getSpecies('calamagrostis-karl-foerster');
    const january = phaseAt(grass, JAN, LONDON);
    expect(january.seedhead).toBeGreaterThan(0.5);
    expect(january.dormant).toBe(false);
    // Cut back in February, so by March there is nothing left.
    expect(phaseAt(grass, 75, LONDON).seedhead).toBeLessThan(0.05);
  });

  it('colours winter-standing material as dead, not as summer growth', () => {
    // The autumn ramp runs on day-of-year and so resets on 1 January. Anything
    // still standing then is dry, and must not be repainted green.
    for (const id of ['calamagrostis-karl-foerster', 'verbena-bonariensis']) {
      expect(phaseAt(getSpecies(id), JAN, LONDON).autumn).toBeGreaterThan(0.9);
    }
    // A plant with nothing standing is unaffected.
    expect(phaseAt(getSpecies('hosta-halcyon'), JAN, LONDON).autumn).toBe(0);
  });
});

describe('flowering', () => {
  it('puts the amelanchier in flower in April and not in August', () => {
    const amelanchier = getSpecies('amelanchier-lamarckii');
    expect(phaseAt(amelanchier, APRIL, LONDON).flower).toBeGreaterThan(0.5);
    expect(phaseAt(amelanchier, 220, LONDON).flower).toBe(0);
  });

  it('keeps the geranium flowering across most of the season', () => {
    const geranium = getSpecies('geranium-rozanne');
    for (const doy of [170, 200, 240, 270]) {
      expect(phaseAt(geranium, doy, LONDON).flower).toBeGreaterThan(0.4);
    }
  });
});

describe('site effects', () => {
  it('delays spring by about a fortnight 400 m up', () => {
    const shift = seasonShift({ ...LONDON, altitude: 400 });
    expect(shift.spring).toBeGreaterThan(11);
    expect(shift.spring).toBeLessThan(16);
    // And shortens the season at both ends.
    expect(shift.seasonDelta).toBeLessThan(-22);
  });

  it('moves bud burst later and leaf fall earlier at altitude', () => {
    const birch = getSpecies('betula-jacquemontii');
    const low = anchorsFor(birch, LONDON);
    const high = anchorsFor(birch, { ...LONDON, altitude: 400 });
    expect(high.budBurst).toBeGreaterThan(low.budBurst + 10);
    expect(high.leafFall).toBeLessThan(low.leafFall - 10);
  });

  it('runs Penzance ahead of Aviemore in spring', () => {
    const penzance = seasonShift({ ...LONDON, latitude: 50.12, altitude: 20 });
    const aviemore = seasonShift({ ...LONDON, latitude: 57.19, altitude: 228 });
    expect(penzance.spring).toBeLessThan(aviemore.spring - 20);
  });

  it('clamps extreme entries instead of inverting the seasons', () => {
    const absurd = seasonShift({ ...LONDON, altitude: 9000 });
    expect(absurd.spring).toBeLessThanOrEqual(45);
    const anchors = anchorsFor(getSpecies('betula-jacquemontii'), {
      ...LONDON,
      altitude: 9000,
    });
    expect(anchors.leafFall).toBeGreaterThan(anchors.autumnStart);
    expect(anchors.autumnStart).toBeGreaterThan(anchors.fullLeaf);
    expect(anchors.fullLeaf).toBeGreaterThan(anchors.budBurst);
  });
});

describe('date labels', () => {
  it('reads calendar dates off the day of year', () => {
    expect(doyToLabel(1)).toBe('1 January');
    expect(doyToLabel(32)).toBe('1 February');
    expect(doyToLabel(102)).toBe('12 April');
    expect(doyToLabel(365)).toBe('31 December');
  });
});
