import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EYE_HEIGHT,
  EYE_PRESETS,
  GROUND_PRESETS,
  MAX_PITCH_DOWN,
  MAX_PITCH_UP,
  MIN_VERTICAL_FOV,
  angleDelta,
  angularHalfWidth,
  bearingOf,
  clampEyeHeight,
  clampGroundHeight,
  clampPitch,
  compassMarks,
  eyeElevation,
  effectiveFov,
  isInView,
  pixelsPerDegree,
  normaliseBearing,
  sight,
  turn,
  type Observer,
} from '../panorama';
import type { Site } from '../types';

const LONDON: Site = {
  latitude: 51.5,
  longitude: -0.13,
  altitude: 0,
  northAngle: 0,
  dst: true,
  label: 'London',
};

/** Standing in the middle of a 14 × 10 plot, facing north. */
const VIEWER: Observer = {
  x: 7,
  y: 5,
  heading: 0,
  fov: 90,
  pitch: 0,
  eyeHeight: DEFAULT_EYE_HEIGHT,
  groundHeight: 0,
};

describe('bearings in plot space', () => {
  it('reads the compass off a direction with north up the page', () => {
    expect(bearingOf(0, -1, 0)).toBeCloseTo(0, 6); // up the page is north
    expect(bearingOf(1, 0, 0)).toBeCloseTo(90, 6); // right is east
    expect(bearingOf(0, 1, 0)).toBeCloseTo(180, 6); // down is south
    expect(bearingOf(-1, 0, 0)).toBeCloseTo(270, 6); // left is west
  });

  it('follows the north dial when the drawing is rotated', () => {
    // Point north to the right of the page: up the page is now west, and the
    // direction that was east is now north.
    expect(bearingOf(0, -1, 90)).toBeCloseTo(270, 6);
    expect(bearingOf(1, 0, 90)).toBeCloseTo(0, 6);
  });

  it('agrees with the shadow projection it is the inverse of', () => {
    for (const northAngle of [0, 37, 180, 305]) {
      for (const bearing of [0, 45, 130, 275, 359]) {
        const a = ((bearing + northAngle - 90) * Math.PI) / 180;
        const back = bearingOf(Math.cos(a), Math.sin(a), northAngle);
        expect(angleDelta(bearing, back)).toBeCloseTo(0, 6);
      }
    }
  });
});

describe('angles', () => {
  it('takes the short way round', () => {
    expect(angleDelta(350, 10)).toBeCloseTo(20, 6);
    expect(angleDelta(10, 350)).toBeCloseTo(-20, 6);
    expect(angleDelta(0, 180)).toBeCloseTo(180, 6);
  });

  it('keeps a heading a proper compass bearing through any number of turns', () => {
    let o = VIEWER;
    for (let i = 0; i < 20; i++) o = turn(o, -45);
    expect(o.heading).toBeGreaterThanOrEqual(0);
    expect(o.heading).toBeLessThan(360);
    expect(normaliseBearing(-45 * 20)).toBe(o.heading);
  });
});

describe('sighting a plant', () => {
  it('puts a plant due north of the viewer straight ahead', () => {
    const s = sight(VIEWER, { x: 7, y: 1 }, LONDON);
    expect(s.bearing).toBeCloseTo(0, 6);
    expect(s.offset).toBeCloseTo(0, 6);
    expect(s.distance).toBeCloseTo(4, 6);
  });

  it('puts a plant to the east on the right of the picture', () => {
    const s = sight(VIEWER, { x: 12, y: 5 }, LONDON);
    expect(s.bearing).toBeCloseTo(90, 6);
    expect(s.offset).toBeCloseTo(90, 6);
  });

  it('reports something behind you as behind you, not ahead', () => {
    const s = sight(VIEWER, { x: 7, y: 9 }, LONDON);
    expect(Math.abs(s.offset)).toBeCloseTo(180, 6);
    expect(isInView(s, 2, 90)).toBe(false);
  });

  it('never divides by a zero distance when you stand on a plant', () => {
    const s = sight(VIEWER, { x: 7, y: 5 }, LONDON);
    expect(s.distance).toBeGreaterThan(0);
    expect(Number.isFinite(s.offset)).toBe(true);
  });
});

describe('what is visible', () => {
  it('keeps a wide plant in frame after its centre has left it', () => {
    // A 6 m canopy three metres away still fills half the view when its middle
    // is past the edge; dropping it the moment the centre leaves would make it
    // blink out exactly when you turn towards it.
    const s = sight({ ...VIEWER, heading: 0 }, { x: 10.2, y: 5 }, LONDON);
    expect(Math.abs(s.offset)).toBeGreaterThan(45);
    expect(isInView(s, 6, 90)).toBe(true);
    expect(isInView(s, 0.2, 90)).toBe(false);
  });

  it('subtends a wider angle the closer it is', () => {
    expect(angularHalfWidth(2, 2)).toBeGreaterThan(angularHalfWidth(2, 20));
    expect(angularHalfWidth(2, 1000)).toBeLessThan(0.1);
  });

  it('sees more of the garden with a wider field of view', () => {
    const plants = [
      { x: 2, y: 2 },
      { x: 12, y: 2 },
      { x: 2, y: 8 },
      { x: 12, y: 8 },
    ];
    const count = (fov: number) =>
      plants.filter((p) => isInView(sight({ ...VIEWER, fov }, p, LONDON), 1, fov)).length;
    expect(count(60)).toBeLessThanOrEqual(count(120));
    expect(count(120)).toBeGreaterThan(count(60));
  });
});

describe('the horizon strip', () => {
  it('offers eight compass points a turn apart', () => {
    const marks = compassMarks();
    expect(marks).toHaveLength(8);
    expect(marks[0]).toEqual({ bearing: 0, label: 'N' });
    expect(marks[4]).toEqual({ bearing: 180, label: 'S' });
  });
});

describe('eye height', () => {
  it('starts at the conventional architectural eye level', () => {
    expect(DEFAULT_EYE_HEIGHT).toBe(1.6);
  });

  it('adds what you are standing on to how tall you are', () => {
    // The geometry only ever sees one number: 1.6 m on a 45 cm terrace is the
    // same view as being 2.05 m tall on the lawn.
    expect(eyeElevation({ ...VIEWER, eyeHeight: 1.6, groundHeight: 0.45 })).toBeCloseTo(2.05, 6);
    expect(eyeElevation({ ...VIEWER, eyeHeight: 1.12, groundHeight: 0 })).toBeCloseTo(1.12, 6);
  });

  it('refuses heights that are not a person', () => {
    expect(clampEyeHeight(0)).toBe(0.3);
    expect(clampEyeHeight(50)).toBe(3);
    expect(clampEyeHeight(1.57)).toBe(1.57);
    expect(clampGroundHeight(-4)).toBe(0);
    expect(clampGroundHeight(1.1)).toBe(1.1);
  });

  it('offers presets that really do differ enough to matter', () => {
    // A control that only spanned a few centimetres would not be worth having:
    // the point is that a child and a tall adult disagree about a 1.5 m hedge.
    const heights = EYE_PRESETS.map((p) => p.height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.6);
    for (const h of heights) expect(clampEyeHeight(h)).toBe(h);
    for (const g of GROUND_PRESETS.map((p) => p.height)) expect(clampGroundHeight(g)).toBe(g);
    expect(GROUND_PRESETS[0].height).toBe(0);
  });

  it('changes whether a hedge is something you see over', () => {
    // The whole reason the control exists, stated as a test.
    const hedge = 1.5;
    const child = eyeElevation({ ...VIEWER, eyeHeight: 1.12 });
    const tall = eyeElevation({ ...VIEWER, eyeHeight: 1.78 });
    expect(child).toBeLessThan(hedge);
    expect(tall).toBeGreaterThan(hedge);
  });
});

describe('fitting the field to the panel', () => {
  it('gives the field you asked for when the panel is tall enough', () => {
    // 90° across 1200 px is 13.3 px/deg, so the vertical sweep needs
    // 13.3 × MIN_VERTICAL_FOV px before the horizontal becomes the binding
    // constraint. Written against the constant rather than a number, because
    // the floor was lowered once already — a wide field bends every straight
    // line, and a gardener testing this called the result deformed.
    const bindsAbove = (1200 / 90) * MIN_VERTICAL_FOV;
    expect(effectiveFov(1200, bindsAbove + 40, 90)).toBeCloseTo(90, 1);
    expect(effectiveFov(1200, bindsAbove - 40, 90)).toBeGreaterThan(90);
  });

  it('lets a narrower request actually narrow the view', () => {
    // The point of the width control: asking for less must give less, not the
    // same picture. On a strip that used to be pinned wide by the floor, 60°
    // now genuinely reads narrower than 120°.
    expect(effectiveFov(1250, 300, 60)).toBeLessThan(effectiveFov(1250, 300, 120));
  });

  it('opens the field out rather than magnifying a short panel', () => {
    // The failure this prevents: one shared scale means a 90° field in a 300 px
    // strip blows the vertical up until a shrub three metres away fills it.
    const fov = effectiveFov(1250, 300, 90);
    expect(fov).toBeGreaterThan(90);
    expect(pixelsPerDegree(1250, 300, 90)).toBeCloseTo(300 / MIN_VERTICAL_FOV, 5);
  });

  it('never shows less than the minimum vertical sweep', () => {
    for (const [w, h] of [[400, 110], [1250, 300], [1900, 470], [320, 700]]) {
      const perDeg = pixelsPerDegree(w, h, 90);
      expect(h / perDeg).toBeGreaterThanOrEqual(MIN_VERTICAL_FOV - 1e-6);
    }
  });

  it('makes a taller panel show a narrower, closer field', () => {
    expect(effectiveFov(1250, 470, 90)).toBeLessThan(effectiveFov(1250, 190, 90));
  });

  it('keeps the horizontal scale consistent with the field it reports', () => {
    for (const [w, h] of [[900, 200], [1400, 640]]) {
      const perDeg = pixelsPerDegree(w, h, 90);
      expect(effectiveFov(w, h, 90) * perDeg).toBeCloseTo(w, 5);
    }
  });
});

describe('looking up and down', () => {
  it('lets you tilt far enough to see the top of a tree you are standing under', () => {
    // A 12 m birch seven metres away tops out 56° above eye level. With only
    // ~30° of sky in frame, the crown is cropped unless the view can tilt.
    const needed = (Math.atan2(12 - DEFAULT_EYE_HEIGHT, 7) * 180) / Math.PI;
    expect(needed).toBeGreaterThan(50);
    expect(MAX_PITCH_UP).toBeGreaterThanOrEqual(50);
  });

  it('stops short of looking straight up or at your own feet', () => {
    expect(clampPitch(200)).toBe(MAX_PITCH_UP);
    expect(clampPitch(-200)).toBe(-MAX_PITCH_DOWN);
    expect(clampPitch(10)).toBe(10);
  });

  it('tilts further up than down, because that is where the planting is', () => {
    expect(MAX_PITCH_UP).toBeGreaterThan(MAX_PITCH_DOWN);
  });
});
