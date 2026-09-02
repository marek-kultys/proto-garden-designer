import { describe, expect, it } from 'vitest';
import {
  CURRENT_VERSION,
  SCHEMA,
  describeLosses,
  makeProjectFile,
  parseProjectFile,
  type Design,
} from '../projectFile';
import { SPECIES, getSpecies } from '../../model/plants';
import { rectanglePlot } from '../../model/geometry';
import type { Site } from '../../model/types';

const SITE: Site = {
  latitude: 51.51,
  longitude: -0.13,
  altitude: 11,
  northAngle: 0,
  dst: true,
  label: 'London',
  slopeFall: 0,
  slopeDirection: 180,
};

function design(): Design {
  return {
    plot: rectanglePlot(14, 10),
    plants: [
      { id: 'a', speciesId: 'betula-jacquemontii', x: 4, y: 3, seed: 12345, plantedAge: 0 },
      { id: 'b', speciesId: 'acer-osakazuki', x: 9, y: 2.5, seed: 67890, plantedAge: 0 },
      { id: 'c', speciesId: 'taxus-baccata', x: 11.5, y: 6, seed: 24680, plantedAge: 0 },
    ],
    site: SITE,
  structures: [],
  };
}

/** What actually reaches the parser: a file that has been through JSON. */
function throughJson(file: unknown): unknown {
  return JSON.parse(JSON.stringify(file));
}

describe('round trip', () => {
  it('returns a design unchanged through save and load', () => {
    const original = design();
    const result = parseProjectFile(
      throughJson(makeProjectFile('Back garden', original, new Date('2026-08-30T10:00:00Z'))),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('Back garden');
    expect(result.design.plants).toEqual(original.plants);
    expect(result.design.plot).toEqual(original.plot);
    expect(result.design.site).toEqual(original.site);
    expect(result.skipped).toEqual([]);
  });

  it('preserves each plant seed exactly, so a reopened plant is the same individual', () => {
    const original = design();
    const result = parseProjectFile(throughJson(makeProjectFile('x', original, new Date())));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.plants.map((p) => p.seed)).toEqual(original.plants.map((p) => p.seed));
  });

  it('round-trips every species in the palette', () => {
    const plants = SPECIES.map((s, i) => ({
      id: `p${i}`,
      speciesId: s.id,
      x: i % 10,
      y: Math.floor(i / 10),
      seed: i * 7919,
      plantedAge: 0,
    }));
    const result = parseProjectFile(
      throughJson(makeProjectFile('all', { ...design(), plants }, new Date())),
    );
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.plants).toHaveLength(SPECIES.length);
    expect(result.skipped).toEqual([]);
  });
});

describe('a plant that is no longer in the library', () => {
  /**
   * The failure this guard exists for. `getSpecies` throws on an unknown id and
   * there is no error boundary, so an unfiltered load would white-screen the
   * app — and, with the bad data still in storage, would do it again on reload.
   */
  it('would throw if it reached the renderer, which is why it is filtered', () => {
    expect(() => getSpecies('acer-palmatum-osakazuki')).toThrow(/Unknown species/);
  });

  it('is dropped and counted rather than thrown', () => {
    const withGhost = design();
    withGhost.plants.push({
      id: 'ghost',
      speciesId: 'acer-palmatum-osakazuki',
      x: 2,
      y: 2,
      seed: 5,
      plantedAge: 0,
    });

    const result = parseProjectFile(throughJson(makeProjectFile('x', withGhost, new Date())));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual(['acer-palmatum-osakazuki']);
    expect(result.design.plants.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps every other plant when several are missing', () => {
    const d = design();
    d.plants.push(
      { id: 'g1', speciesId: 'gone-one', x: 1, y: 1, seed: 1, plantedAge: 0 },
      { id: 'g2', speciesId: 'gone-two', x: 2, y: 2, seed: 2, plantedAge: 0 },
      { id: 'g3', speciesId: 'gone-one', x: 3, y: 3, seed: 3, plantedAge: 0 },
    );
    const result = parseProjectFile(throughJson(makeProjectFile('x', d, new Date())));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.skipped).toHaveLength(3);
    expect(result.design.plants).toHaveLength(3);
  });

  it('every loaded plant can be looked up without throwing', () => {
    const d = design();
    d.plants.push({ id: 'g', speciesId: 'not-a-plant', x: 1, y: 1, seed: 1, plantedAge: 0 });
    const result = parseProjectFile(throughJson(makeProjectFile('x', d, new Date())));
    if (!result.ok) throw new Error('expected a successful load');
    for (const plant of result.design.plants) {
      expect(() => getSpecies(plant.speciesId)).not.toThrow();
    }
  });
});

describe('version stamp', () => {
  it('refuses a file from a newer version instead of guessing at it', () => {
    const file = makeProjectFile('x', design(), new Date());
    const newer = { ...file, version: CURRENT_VERSION + 1 };

    const result = parseProjectFile(throughJson(newer));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('from-the-future');
    if (result.failure.kind !== 'from-the-future') return;
    expect(result.failure.savedVersion).toBe(CURRENT_VERSION + 1);
  });

  it('refuses a version below the first that ever shipped', () => {
    const file = { ...makeProjectFile('x', design(), new Date()), version: 0 };
    const result = parseProjectFile(throughJson(file));
    expect(result.ok).toBe(false);
  });

  it('accepts the current version', () => {
    const result = parseProjectFile(throughJson(makeProjectFile('x', design(), new Date())));
    expect(result.ok).toBe(true);
  });
});

describe('damaged and hostile input', () => {
  const junk: unknown[] = [
    null,
    undefined,
    0,
    'a string',
    [],
    {},
    { schema: 'something-else', version: 1 },
    { schema: SCHEMA },
    { schema: SCHEMA, version: 'one' },
    { schema: SCHEMA, version: CURRENT_VERSION },
    { schema: SCHEMA, version: CURRENT_VERSION, name: '', savedAt: 'x', design: {} },
  ];

  it('never throws, whatever it is handed', () => {
    for (const value of junk) {
      expect(() => parseProjectFile(value)).not.toThrow();
      expect(parseProjectFile(value).ok).toBe(false);
    }
  });

  it('refuses a plot that is not a polygon', () => {
    const d = design();
    const file = makeProjectFile('x', d, new Date());
    const broken = { ...file, design: { ...file.design, plot: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } };
    expect(parseProjectFile(throughJson(broken)).ok).toBe(false);
  });

  it('refuses coordinates that would put the sun somewhere impossible', () => {
    const file = makeProjectFile('x', design(), new Date());
    const broken = { ...file, design: { ...file.design, site: { ...SITE, latitude: 200 } } };
    expect(parseProjectFile(throughJson(broken)).ok).toBe(false);
  });

  /**
   * A damaged plant costs that plant, never the garden.
   *
   * This used to fail the whole design, while a damaged wall beside it cost
   * only the wall. Since designs are now exported as hand-editable files and
   * old ones must keep opening, all-or-nothing was the more damaging policy.
   */
  it('drops a plant missing its position, and keeps the rest of the garden', () => {
    const file = makeProjectFile('x', design(), new Date());
    const broken = {
      ...file,
      design: {
        ...file.design,
        plants: [
          ...file.design.plants,
          { id: 'z', speciesId: 'betula-jacquemontii', seed: 1, plantedAge: 0 },
        ],
      },
    };

    const result = parseProjectFile(throughJson(broken));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.plants).toHaveLength(3);
    expect(result.droppedPlants).toBe(1);
    expect(describeLosses(result)).toMatch(/1 plant could not be rebuilt/);
  });

  it('drops something that is not a plant record at all, and says so', () => {
    const file = makeProjectFile('x', design(), new Date());
    const broken = {
      ...file,
      design: { ...file.design, plants: [...file.design.plants, 'not a plant', 42] },
    };

    const result = parseProjectFile(throughJson(broken));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.plants).toHaveLength(3);
    expect(result.droppedPlants).toBe(2);
  });

  it('still refuses a planting that is not a list at all', () => {
    const file = makeProjectFile('x', design(), new Date());
    const broken = { ...file, design: { ...file.design, plants: 'everything' } };
    // Not a damaged plant — a file that is not a design.
    expect(parseProjectFile(throughJson(broken)).ok).toBe(false);
  });

  it('tells the two kinds of plant loss apart', () => {
    const text = describeLosses({ skipped: ['gone'], droppedPlants: 2, droppedStructures: 1 });
    expect(text).toMatch(/no longer in the library/);
    expect(text).toMatch(/2 plants could not be rebuilt/);
    expect(text).toMatch(/1 wall or bed could not be rebuilt/);
  });

  it('drops a duplicated instance id, which would make the selection ambiguous', () => {
    const file = makeProjectFile('x', design(), new Date());
    const doubled = {
      ...file,
      design: {
        ...file.design,
        plants: [...file.design.plants, { ...file.design.plants[0] }],
      },
    };
    const result = parseProjectFile(throughJson(doubled));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.plants).toHaveLength(3);
    expect(new Set(result.design.plants.map((p) => p.id)).size).toBe(3);
  });
});

describe('opening a design saved before walls existed', () => {
  /**
   * Version 1 is a real format that real saves are sitting in. It knew nothing
   * of walls and raised beds, so its files simply have no `structures` key —
   * and the promise made when the version stamp was added was that an older
   * save opens as the garden it always was, rather than being refused.
   */
  function version1File() {
    const file = makeProjectFile('Old garden', design(), new Date('2026-08-30T10:00:00Z'));
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    raw.version = 1;
    const inner = raw.design as Record<string, unknown>;
    delete inner.structures;
    return raw;
  }

  it('opens, rather than being refused as too old', () => {
    const result = parseProjectFile(version1File());
    expect(result.ok).toBe(true);
  });

  it('keeps every plant and the plot exactly as they were', () => {
    const result = parseProjectFile(version1File());
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.name).toBe('Old garden');
    expect(result.design.plants).toEqual(design().plants);
    expect(result.design.plot).toEqual(design().plot);
  });

  it('arrives with no walls or beds, which is what it always had', () => {
    const result = parseProjectFile(version1File());
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.structures).toEqual([]);
    expect(result.droppedStructures).toBe(0);
  });

  it('says nothing was lost, because nothing was', () => {
    const result = parseProjectFile(version1File());
    if (!result.ok) throw new Error('expected a successful load');
    expect(describeLosses(result)).toBeNull();
  });
});

describe('opening a design saved before part-grown planting existed', () => {
  /**
   * Version 2 is a real format with real saves in it. Its plants have no
   * `plantedAge`, and every one of them was nursery stock — which is exactly
   * what an absent field has to read as.
   */
  function version2File() {
    const file = makeProjectFile('Two garden', design(), new Date('2026-08-30T10:00:00Z'));
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    raw.version = 2;
    const inner = raw.design as { plants: Record<string, unknown>[] };
    for (const plant of inner.plants) delete plant.plantedAge;
    return raw;
  }

  it('opens rather than being refused', () => {
    expect(parseProjectFile(version2File()).ok).toBe(true);
  });

  it('reads every plant in it as nursery stock', () => {
    const result = parseProjectFile(version2File());
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.plants.map((p) => p.plantedAge)).toEqual([0, 0, 0]);
  });

  it('round-trips a part-grown specimen at the current version', () => {
    const withSpecimen = design();
    withSpecimen.plants[0] = { ...withSpecimen.plants[0], plantedAge: 10 };
    const result = parseProjectFile(
      throughJson(makeProjectFile('x', withSpecimen, new Date())),
    );
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.plants[0].plantedAge).toBe(10);
  });

  it('clamps an absurd age rather than refusing the design', () => {
    const silly = design();
    silly.plants[0] = { ...silly.plants[0], plantedAge: 9000 };
    const result = parseProjectFile(throughJson(makeProjectFile('x', silly, new Date())));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.plants[0].plantedAge).toBeLessThanOrEqual(50);
  });
});

describe('walls and raised beds in a saved design', () => {
  const wall = {
    id: 'w1',
    kind: 'wall' as const,
    points: [
      { x: 0, y: 9 },
      { x: 14, y: 9 },
    ],
    height: 1.8,
    thickness: 0.22,
    seed: 4242,
  };

  it('round-trips unchanged', () => {
    const withWall = { ...design(), structures: [wall] };
    const result = parseProjectFile(
      throughJson(makeProjectFile('x', withWall, new Date())),
    );
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.structures).toEqual([wall]);
  });

  it('drops a damaged one and counts it, keeping the rest of the garden', () => {
    const withJunk = {
      ...design(),
      structures: [wall, { id: 'w2', kind: 'wall', points: [{ x: 1, y: 1 }], height: 2 }],
    };
    const result = parseProjectFile(
      throughJson(makeProjectFile('x', withJunk as never, new Date())),
    );
    if (!result.ok) throw new Error('expected a successful load');
    // Too few points to stand up is not a wall, whatever it claims to be.
    expect(result.design.structures).toHaveLength(1);
    expect(result.droppedStructures).toBe(1);
    expect(result.design.plants).toHaveLength(3);
  });

  it('clamps an absurd height rather than refusing the design', () => {
    const silly = { ...design(), structures: [{ ...wall, height: 900 }] };
    const result = parseProjectFile(throughJson(makeProjectFile('x', silly, new Date())));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.structures[0].height).toBeLessThanOrEqual(4);
  });

  it('reports both losses together when a design has each', () => {
    const text = describeLosses({ skipped: ['gone-plant'], droppedStructures: 2 });
    expect(text).toContain('1 plant');
    expect(text).toContain('2 walls or beds');
  });
});

describe('a slope read from a file', () => {
  const withSlope = (slope: Record<string, unknown>) => {
    const file = makeProjectFile('x', design(), new Date());
    return throughJson({
      ...file,
      design: { ...file.design, site: { ...SITE, ...slope } },
    });
  };

  /**
   * A fall the control cannot reach would leave the slider showing one garden
   * and the drawing showing another, until the first touch of that slider
   * silently rewrote the design to match the reading.
   */
  it('is brought into the range the control can reach', () => {
    const result = parseProjectFile(withSlope({ slopeFall: 15 }));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.site.slopeFall).toBeLessThanOrEqual(6);
  });

  it('keeps a fall the control could have made, exactly', () => {
    const result = parseProjectFile(withSlope({ slopeFall: 2.5, slopeDirection: 225 }));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.site.slopeFall).toBeCloseTo(2.5, 9);
    expect(result.design.site.slopeDirection).toBeCloseTo(225, 9);
  });

  it('reads a design saved before the ground could tilt as level', () => {
    const result = parseProjectFile(withSlope({}));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.design.site.slopeFall).toBe(0);
  });
});

describe('describeLosses', () => {
  it('says nothing when nothing was lost', () => {
    expect(describeLosses({ skipped: [] })).toBeNull();
  });

  it('counts plants, not kinds', () => {
    const text = describeLosses({ skipped: ['a', 'a', 'b'] });
    expect(text).toContain('3 plants');
  });

  it('uses the singular for one', () => {
    const text = describeLosses({ skipped: ['a'] });
    expect(text).toContain('1 plant');
    expect(text).not.toContain('1 plants');
  });
});
