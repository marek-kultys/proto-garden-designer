/**
 * Repackages the single-file build as a body fragment for publishing as a
 * shareable page, whose host supplies its own <!doctype>/<head>/<body>.
 *
 * Everything is already inlined by then, so this only has to unwrap the
 * document: pull the <style>, <title> and icon out of the head, the app root
 * and inline script out of the body, and concatenate.
 *
 *   SINGLEFILE=1 npm run build && node scripts/make-artifact.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const src = process.argv[2] ?? 'dist/index.html';
const out = process.argv[3] ?? 'dist/artifact.html';

const html = await readFile(src, 'utf8');

const head = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] ?? '';
const body = html.match(/<body>([\s\S]*?)<\/body>/i)?.[1] ?? '';

const pick = (source, re) => source.match(re)?.join('\n') ?? '';
const title = pick(head, /<title>[\s\S]*?<\/title>/gi);
const icon = pick(head, /<link\s+rel="icon"[\s\S]*?\/>/gi);
const styles = pick(head, /<style[\s\S]*?<\/style>/gi);

// The inliner leaves the bundled script in the head. Module scripts are
// deferred, so moving them after the app root changes nothing about execution
// order and keeps the fragment readable.
const scripts = pick(head, /<script[\s\S]*?<\/script>/gi).replace(/\s+crossorigin/g, '');

const fragment = [title, icon, styles, body.trim(), scripts].filter(Boolean).join('\n');

for (const [label, present] of [
  ['title', Boolean(title)],
  ['styles', Boolean(styles)],
  ['app root', /id="root"/.test(fragment)],
  ['inline script', /<script[^>]*>[\s\S]{1000,}<\/script>/.test(fragment)],
]) {
  if (!present) {
    console.error(`missing ${label} — refusing to write a broken page`);
    process.exit(1);
  }
}
if (/(src|href)="(https?:)?\/\//.test(fragment)) {
  console.error('fragment references an external host; a strict CSP would block it');
  process.exit(1);
}

await writeFile(out, fragment);
console.log(`${out} — ${(fragment.length / 1024).toFixed(0)} kB, self-contained`);
