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
 * Hand the design to the browser as a download.
 *
 * Note the environment limit: a page published as an artifact runs in a sandbox
 * that blocks downloads a page starts itself, so this is inert there and works
 * on an ordinary web page. Nothing here can detect that, which is why it is
 * written down rather than handled.
 */
export function exportProjectFile(name: string, design: Design): ExportResult {
  const filename = suggestFilename(name);
  try {
    const text = serialiseProject(name, design, new Date());
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
