import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteProject,
  listProjects,
  newProjectId,
  readProject,
  storageAvailable,
  writeProject,
} from '../projectStorage';
import { makeProjectFile, type Design } from '../projectFile';
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

const DESIGN: Design = {
  plot: rectanglePlot(14, 10),
  plants: [{ id: 'a', speciesId: 'betula-jacquemontii', x: 4, y: 3, seed: 1, plantedAge: 0 }],
  site: SITE,
  structures: [],
};

/** A Map-backed stand-in for localStorage, with the behaviours that matter. */
function fakeStorage(options: { failWrites?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(i: number): string | null {
      return [...map.keys()][i] ?? null;
    },
    getItem(k: string): string | null {
      return map.get(k) ?? null;
    },
    setItem(k: string, v: string): void {
      if (options.failWrites) throw new DOMException('quota', 'QuotaExceededError');
      map.set(k, v);
    },
    removeItem(k: string): void {
      map.delete(k);
    },
    clear(): void {
      map.clear();
    },
    raw: map,
  };
}

function useStorage(fake: ReturnType<typeof fakeStorage>) {
  vi.stubGlobal('window', { localStorage: fake });
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saving and reading back', () => {
  it('round-trips a design through storage', () => {
    useStorage(fakeStorage());
    const id = newProjectId();

    expect(writeProject(id, makeProjectFile('Back garden', DESIGN, new Date())).ok).toBe(true);

    const result = readProject(id);
    expect(result).not.toBeNull();
    if (result === null || !result.ok) throw new Error('expected a successful load');
    expect(result.name).toBe('Back garden');
    expect(result.design.plants).toHaveLength(1);
  });

  it('returns null for an id that was never saved', () => {
    useStorage(fakeStorage());
    expect(readProject('nothing-here')).toBeNull();
  });

  it('deletes', () => {
    useStorage(fakeStorage());
    const id = newProjectId();
    writeProject(id, makeProjectFile('x', DESIGN, new Date()));
    expect(deleteProject(id).ok).toBe(true);
    expect(readProject(id)).toBeNull();
  });

  it('gives every project a distinct id', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newProjectId()));
    expect(ids.size).toBe(200);
  });
});

describe('listing', () => {
  it('lists most recently saved first', () => {
    useStorage(fakeStorage());
    writeProject('one', makeProjectFile('Older', DESIGN, new Date('2026-01-01T00:00:00Z')));
    writeProject('two', makeProjectFile('Newer', DESIGN, new Date('2026-06-01T00:00:00Z')));

    expect(listProjects().map((p) => p.name)).toEqual(['Newer', 'Older']);
  });

  it('ignores keys belonging to anything else on the origin', () => {
    const fake = useStorage(fakeStorage());
    writeProject('mine', makeProjectFile('Mine', DESIGN, new Date()));
    fake.raw.set('some-other-app', 'not ours');
    fake.raw.set('theme', 'dark');

    expect(listProjects().map((p) => p.name)).toEqual(['Mine']);
  });

  /**
   * One damaged design must cost you that design, not the ability to see any of
   * the others — the whole point of a per-project key rather than one blob.
   */
  it('still lists the good projects when one entry is corrupt', () => {
    const fake = useStorage(fakeStorage());
    writeProject('good', makeProjectFile('Good one', DESIGN, new Date()));
    fake.raw.set('garden-designer:project:broken', '{ this is not json');

    expect(listProjects().map((p) => p.name)).toEqual(['Good one']);
  });

  it('reports a corrupt design as unreadable rather than throwing', () => {
    const fake = useStorage(fakeStorage());
    fake.raw.set('garden-designer:project:broken', '{ this is not json');

    const result = readProject('broken');
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.ok).toBe(false);
  });
});

describe('when the browser will not store anything', () => {
  it('reports unavailable rather than throwing when there is no window at all', () => {
    vi.stubGlobal('window', undefined);
    expect(() => storageAvailable()).not.toThrow();
    expect(storageAvailable()).toBe(false);
    expect(listProjects()).toEqual([]);
  });

  it('reports a failed write instead of throwing when the quota is full', () => {
    useStorage(fakeStorage({ failWrites: true }));
    const result = writeProject('x', makeProjectFile('x', DESIGN, new Date()));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toMatch(/room/i);
  });

  it('reports unavailable when a probe write is refused', () => {
    useStorage(fakeStorage({ failWrites: true }));
    expect(storageAvailable()).toBe(false);
  });
});
