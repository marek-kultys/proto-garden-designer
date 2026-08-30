import { parseProjectFile, type LoadResult, type ProjectFile } from './projectFile';

/**
 * Where saved designs live: this browser, on this device, and nowhere else.
 *
 * There is no backend and no network call, which is what makes saving work on
 * static hosting — but it also means a gardener's saved designs stay on the
 * machine they made them on. They never come back to you, and they are gone if
 * they switch device or clear site data. PRODUCT.md records the cheap fixes for
 * that (a share link in the URL fragment, or export and import of a JSON file);
 * neither is built here.
 *
 * Every entry point is wrapped, because localStorage is not merely a map:
 * reading it throws outright in Safari's private mode and wherever site data is
 * blocked, and writing it throws on quota. The app is published as an artifact
 * inside a host page, which is exactly the sort of context that blocks it — so
 * "storage is unavailable" is a state to report, not an exception to leak.
 */

const PREFIX = 'garden-designer:project:';

export interface ProjectSummary {
  id: string;
  name: string;
  /** ISO 8601, as written. */
  savedAt: string;
}

export type StorageResult = { ok: true } | { ok: false; detail: string };

/**
 * Read localStorage through one guarded accessor.
 *
 * Feature-detecting once at module load would be wrong: permission can differ
 * per operation and can change during the session, so each access is guarded.
 */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storageAvailable(): boolean {
  const s = storage();
  if (s === null) return false;
  // Presence is not permission — a probe write is the only honest test.
  try {
    const probe = `${PREFIX}__probe__`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function newProjectId(): string {
  const random = Math.floor(Math.random() * 1e9).toString(36);
  return `${Date.now().toString(36)}-${random}`;
}

function keyFor(id: string): string {
  return `${PREFIX}${id}`;
}

/**
 * Every saved design, most recently saved first.
 *
 * The keys in storage are the only record of what exists — deliberately no
 * separate index, which would be a second source of truth for one fact and
 * would drift the first time a write half-failed.
 */
export function listProjects(): ProjectSummary[] {
  const s = storage();
  if (s === null) return [];

  const found: ProjectSummary[] = [];
  try {
    for (let i = 0; i < s.length; i += 1) {
      const key = s.key(i);
      if (key === null || !key.startsWith(PREFIX)) continue;

      const raw = s.getItem(key);
      if (raw === null) continue;

      // Listing must survive one damaged entry: a corrupt design should cost
      // you that design, not the ability to see any of the others.
      let name: string | null = null;
      let savedAt: string | null = null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const record = parsed as Record<string, unknown>;
          name = typeof record.name === 'string' ? record.name : null;
          savedAt = typeof record.savedAt === 'string' ? record.savedAt : null;
        }
      } catch {
        continue;
      }
      if (name === null || savedAt === null) continue;

      found.push({ id: key.slice(PREFIX.length), name, savedAt });
    }
  } catch {
    return [];
  }

  return found.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Null when there is nothing stored under that id; otherwise the parse result. */
export function readProject(id: string): LoadResult | null {
  const s = storage();
  if (s === null) return { ok: false, failure: { kind: 'malformed', detail: 'storage unavailable' } };

  let raw: string | null;
  try {
    raw = s.getItem(keyFor(id));
  } catch {
    return { ok: false, failure: { kind: 'malformed', detail: 'storage unavailable' } };
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, failure: { kind: 'malformed', detail: 'not readable' } };
  }
  return parseProjectFile(parsed);
}

export function writeProject(id: string, file: ProjectFile): StorageResult {
  const s = storage();
  if (s === null) return { ok: false, detail: 'This browser is not allowing saved data.' };
  try {
    s.setItem(keyFor(id), JSON.stringify(file));
    return { ok: true };
  } catch {
    // Overwhelmingly a quota error, and the honest advice is the same either way.
    return { ok: false, detail: 'There was no room to save. Delete a project and try again.' };
  }
}

export function deleteProject(id: string): StorageResult {
  const s = storage();
  if (s === null) return { ok: false, detail: 'This browser is not allowing saved data.' };
  try {
    s.removeItem(keyFor(id));
    return { ok: true };
  } catch {
    return { ok: false, detail: 'That project could not be deleted.' };
  }
}
