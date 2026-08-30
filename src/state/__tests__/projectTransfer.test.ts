import { describe, expect, it, vi } from 'vitest';
import {
  FILE_EXTENSION,
  exportProjectFile,
  readProjectFromFile,
  serialiseProject,
  suggestFilename,
} from '../projectTransfer';
import { CURRENT_VERSION, parseProjectFile, type Design } from '../projectFile';
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
  plants: [
    { id: 'a', speciesId: 'betula-jacquemontii', x: 4, y: 3, seed: 1234, plantedAge: 0 },
    { id: 'b', speciesId: 'taxus-baccata', x: 11, y: 6, seed: 5678, plantedAge: 0 },
  ],
  site: SITE,
  structures: [],
};

function fileOf(text: string, name = 'garden.json'): File {
  return new File([text], name, { type: 'application/json' });
}

describe('suggested filename', () => {
  it('makes a name that is safe on any filesystem', () => {
    expect(suggestFilename('Back garden')).toBe(`back-garden${FILE_EXTENSION}`);
    expect(suggestFilename('Mum & Dad plot #2')).toBe(`mum-dad-plot-2${FILE_EXTENSION}`);
  });

  it('never produces a name that is only an extension', () => {
    for (const awkward of ['', '   ', '///', '???']) {
      const name = suggestFilename(awkward);
      expect(name).toBe(`garden${FILE_EXTENSION}`);
      expect(name.startsWith('.')).toBe(false);
    }
  });

  it('keeps a very long name to a sensible length', () => {
    expect(suggestFilename('a'.repeat(300)).length).toBeLessThanOrEqual(60 + FILE_EXTENSION.length);
  });
});

describe('the exported file', () => {
  it('is readable back by the ordinary loader', () => {
    const text = serialiseProject('Back garden', DESIGN, new Date('2026-08-30T10:00:00Z'));
    const result = parseProjectFile(JSON.parse(text));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('Back garden');
    expect(result.design.plants).toEqual(DESIGN.plants);
    expect(result.design.plot).toEqual(DESIGN.plot);
    expect(result.design.site).toEqual(DESIGN.site);
  });

  it('carries the version stamp, so a future reader knows what it is holding', () => {
    const parsed: unknown = JSON.parse(serialiseProject('x', DESIGN, new Date()));
    expect(parsed).toMatchObject({ schema: 'garden-designer-project', version: CURRENT_VERSION });
  });

  it('is readable by a person who opens it in a text editor', () => {
    expect(serialiseProject('x', DESIGN, new Date())).toContain('\n  ');
  });

  it('reports rather than throws when there is no way to save at all', async () => {
    // Node has neither a document nor a `claude` host, which is the same shape
    // of failure as a browser refusing the download: it must come back as a
    // value, not an exception.
    await expect(exportProjectFile('x', DESIGN)).resolves.toMatchObject({ ok: false });
  });

  it('uses the host capability when the page is given one, rather than a link', async () => {
    const saved: { filename: string; data: string }[] = [];
    vi.stubGlobal('window', {
      claude: {
        use: async (name: string) =>
          name === 'downloads'
            ? {
                save: async (request: { filename: string; data: string }) => {
                  saved.push(request);
                  return { status: 'saved' };
                },
              }
            : null,
      },
    });
    vi.resetModules();
    const fresh = await import('../projectTransfer');

    const result = await fresh.exportProjectFile('Back garden', DESIGN);

    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toBe('back-garden.json');
    // The bytes handed to the host are the same file the loader can read back.
    expect(JSON.parse(saved[0].data)).toMatchObject({ schema: 'garden-designer-project' });
    vi.unstubAllGlobals();
  });

  it('reports a declined save without claiming to have written a file', async () => {
    vi.stubGlobal('window', {
      claude: {
        use: async () => ({
          save: async () => {
            throw { code: 'declined', message: 'no' };
          },
        }),
      },
    });
    vi.resetModules();
    const fresh = await import('../projectTransfer');

    const result = await fresh.exportProjectFile('x', DESIGN);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toMatch(/cancelled/i);
    vi.unstubAllGlobals();
  });
});

describe('importing a file', () => {
  it('round-trips a design written by the exporter', async () => {
    const result = await readProjectFromFile(
      fileOf(serialiseProject('Front bed', DESIGN, new Date())),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.name).toBe('Front bed');
    expect(result.design.plants).toHaveLength(2);
  });

  it('refuses a file that is not JSON at all, without throwing', async () => {
    const result = await readProjectFromFile(fileOf('this is not a garden'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
  });

  it('refuses valid JSON that is not a design', async () => {
    const result = await readProjectFromFile(fileOf(JSON.stringify({ hello: 'world' })));
    expect(result.ok).toBe(false);
  });

  /**
   * An imported file has been off the machine and may have been edited by hand,
   * so it goes through the same guard as a stored design rather than a second,
   * more trusting path.
   */
  it('drops plants that are no longer in the library, and counts them', async () => {
    const tampered: Design = {
      ...DESIGN,
      plants: [
        ...DESIGN.plants,
        { id: 'ghost', speciesId: 'acer-palmatum-osakazuki', x: 2, y: 2, seed: 9, plantedAge: 0 },
      ],
    };
    const result = await readProjectFromFile(fileOf(serialiseProject('x', tampered, new Date())));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toEqual(['acer-palmatum-osakazuki']);
    expect(result.design.plants).toHaveLength(2);
  });

  it('refuses a file written by a newer version', async () => {
    const file: unknown = JSON.parse(serialiseProject('x', DESIGN, new Date()));
    const bumped = { ...(file as Record<string, unknown>), version: CURRENT_VERSION + 1 };
    const result = await readProjectFromFile(fileOf(JSON.stringify(bumped)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('from-the-future');
  });

  it('refuses an implausibly large file instead of trying to parse it', async () => {
    const result = await readProjectFromFile(fileOf('a'.repeat(5_000_001)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed');
    if (result.failure.kind !== 'malformed') return;
    expect(result.failure.detail).toMatch(/large/);
  });

  it('never throws, whatever the file contains', async () => {
    const nasty = ['', '[]', 'null', '{"schema":"garden-designer-project"}', ' '];
    for (const text of nasty) {
      const result = await readProjectFromFile(fileOf(text));
      expect(result.ok).toBe(false);
    }
  });
});
