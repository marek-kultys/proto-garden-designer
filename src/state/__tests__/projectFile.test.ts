import { describe, expect, it } from 'vitest';
import {
  CURRENT_VERSION,
  SCHEMA,
  describeSkipped,
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
};

function design(): Design {
  return {
    plot: rectanglePlot(14, 10),
    plants: [
      { id: 'a', speciesId: 'betula-jacquemontii', x: 4, y: 3, seed: 12345 },
      { id: 'b', speciesId: 'acer-osakazuki', x: 9, y: 2.5, seed: 67890 },
      { id: 'c', speciesId: 'taxus-baccata', x: 11.5, y: 6, seed: 24680 },
    ],
    site: SITE,
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
      { id: 'g1', speciesId: 'gone-one', x: 1, y: 1, seed: 1 },
      { id: 'g2', speciesId: 'gone-two', x: 2, y: 2, seed: 2 },
      { id: 'g3', speciesId: 'gone-one', x: 3, y: 3, seed: 3 },
    );
    const result = parseProjectFile(throughJson(makeProjectFile('x', d, new Date())));
    if (!result.ok) throw new Error('expected a successful load');
    expect(result.skipped).toHaveLength(3);
    expect(result.design.plants).toHaveLength(3);
  });

  it('every loaded plant can be looked up without throwing', () => {
    const d = design();
    d.plants.push({ id: 'g', speciesId: 'not-a-plant', x: 1, y: 1, seed: 1 });
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

  it('refuses a plant missing its position rather than defaulting it to zero', () => {
    const file = makeProjectFile('x', design(), new Date());
    const broken = {
      ...file,
      design: {
        ...file.design,
        plants: [{ id: 'a', speciesId: 'betula-jacquemontii', seed: 1 }],
      },
    };
    expect(parseProjectFile(throughJson(broken)).ok).toBe(false);
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

describe('describeSkipped', () => {
  it('says nothing when nothing was lost', () => {
    expect(describeSkipped([])).toBeNull();
  });

  it('counts plants, not kinds', () => {
    const text = describeSkipped(['a', 'a', 'b']);
    expect(text).toContain('3 plants');
  });

  it('uses the singular for one', () => {
    const text = describeSkipped(['a']);
    expect(text).toContain('1 plant');
    expect(text).not.toContain('1 plants');
  });
});
