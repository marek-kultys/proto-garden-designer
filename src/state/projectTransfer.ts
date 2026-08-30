import { makeProjectFile, parseProjectFile, type Design, type LoadResult } from './projectFile';

/**
 * Moving a design between devices, as a file.
 *
 * Saved projects live in one browser on one machine, which is what lets saving
 * work with no backend — and also what stops a design following a designer from
 * laptop to phone, or a tester's garden ever reaching anyone else. A file is the
 * cheapest fix that keeps the no-backend property: it is written and read
 * entirely in the browser, and nothing is uploaded anywhere.
 *
 * An imported file is the first genuinely untrusted input this app accepts. It
 * has been off the machine, may have been edited by hand, and may have been
 * written by a different version of the app. It therefore goes through exactly
 * the same guarded boundary as a stored design — `parseProjectFile` — rather
 * than a second, more trusting path written for the occasion.
 */

/**
 * Refuse implausibly large files rather than parsing them.
 *
 * A whole design is a few kilobytes; a hundred is a few hundred. Anything past
 * this is not a garden, and reading it would freeze the tab before the parser
 * ever got the chance to reject it.
 */
const MAX_BYTES = 5_000_000;

export const FILE_EXTENSION = '.json';

/** A filename that survives every OS: lowercase, hyphenated, nothing exotic. */
export function suggestFilename(projectName: string): string {
  const stem = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${stem.length > 0 ? stem : 'garden'}${FILE_EXTENSION}`;
}

/** The exact bytes written to the file. Pure, so the format can be tested. */
export function serialiseProject(name: string, design: Design, savedAt: Date): string {
  // Indented: a designer who opens the file in a text editor should be able to
  // read it, and the size difference on a few kilobytes is not worth the loss.
  return JSON.stringify(makeProjectFile(name, design, savedAt), null, 2);
}

export type ExportResult = { ok: true; filename: string } | { ok: false; detail: string };

/**
 * Two ways of handing a file to a person, because this app runs in two places.
 *
 * On an ordinary web page — the hosted site, the single file opened from disk —
 * a link with a `download` attribute is the way, and works.
 *
 * Published as an artifact, the page runs framed in a sandbox that never grants
 * a page permission to start its own download: that same link is silently inert,
 * which is worse than failing, because the app would report a file it had not
 * written. There the host offers `claude.use('downloads')`, which asks the
 * viewer to confirm and saves on their behalf.
 *
 * So: prefer the capability where it exists, fall back to the link where it does
 * not, and never claim to have saved anything unless one of them said so.
 */
interface DownloadsCapability {
  save: (request: { filename: string; data: string }) => Promise<{ status: string }>;
}

function looksLikeDownloads(value: unknown): value is DownloadsCapability {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { save?: unknown }).save === 'function'
  );
}

/**
 * Resolved once and reused.
 *
 * Started at module load so the first export does not wait on it, but never
 * read synchronously: the host resolves this after the first run of the script,
 * and in an ordinary browser there is no `claude` at all, so it settles to null
 * immediately rather than after the host's timeout.
 */
let downloads: Promise<DownloadsCapability | null> | null = null;

function downloadsCapability(): Promise<DownloadsCapability | null> {
  if (downloads === null) {
    downloads = (async () => {
      try {
        const host = (window as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
        if (host === undefined || typeof host.use !== 'function') return null;
        const namespace = await host.use('downloads');
        return looksLikeDownloads(namespace) ? namespace : null;
      } catch {
        return null;
      }
    })();
  }
  return downloads;
}

/** Warm it up; the result is memoised and any failure is already swallowed. */
void downloadsCapability();

/** Plain-language wording for why a save did not happen. */
function describeSaveFailure(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'unavailable';

  switch (code) {
    case 'declined':
      // Not a failure of the app. The person was asked and said no.
      return 'Export cancelled.';
    case 'rate_limited':
      return 'A save is already waiting to be confirmed. Try again in a moment.';
    case 'too_large':
      return 'That design is too large to export.';
    default:
      return 'This page is not allowed to save files.';
  }
}

/** The ordinary-web-page route: a link the browser follows. */
function saveViaLink(filename: string, text: string): ExportResult {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Released on the next tick rather than immediately: revoking synchronously
    // can cancel the download the click has only just started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { ok: true, filename };
  } catch {
    return { ok: false, detail: 'This browser would not save the file.' };
  }
}

export async function exportProjectFile(name: string, design: Design): Promise<ExportResult> {
  const filename = suggestFilename(name);
  const text = serialiseProject(name, design, new Date());

  const host = await downloadsCapability();
  if (host !== null) {
    try {
      await host.save({ filename, data: text });
      return { ok: true, filename };
    } catch (error) {
      return { ok: false, detail: describeSaveFailure(error) };
    }
  }

  return saveViaLink(filename, text);
}

/** Read a chosen file and put it through the ordinary guarded load boundary. */
export async function readProjectFromFile(file: File): Promise<LoadResult> {
  if (file.size > MAX_BYTES) {
    return { ok: false, failure: { kind: 'malformed', detail: 'that file is far too large' } };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, failure: { kind: 'malformed', detail: 'the file could not be read' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, failure: { kind: 'malformed', detail: 'it is not a design file' } };
  }

  return parseProjectFile(parsed);
}
