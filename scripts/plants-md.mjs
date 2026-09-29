/**
 * Write the generated half of `PLANTS.md` from the plant library.
 *
 *   npm run plants:md
 *
 * Run it after adding, renaming or retyping a plant. It rewrites only what sits
 * between the `<!-- generated: … -->` markers — the numbered lists, the counts,
 * the Mediterranean lists — and leaves every hand-written line alone. Running it
 * when nothing has changed writes nothing and says so.
 *
 * The rendering itself lives in `src/model/plants/doc.ts`, in TypeScript, beside
 * the library it reads; this file only loads it and puts the result on disk. So
 * the test and the generator cannot disagree about the format — there is one
 * copy of it, and they both call it.
 *
 * Vite loads that TypeScript rather than Node running it directly: the library
 * is a tree of extensionless `.ts` imports, which is what the app and the tests
 * resolve through Vite, and asking Node to resolve them instead would mean a
 * second module setup that could drift from the one everything else uses.
 */
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(repo, 'PLANTS.md');

const server = await createServer({
  root: repo,
  configFile: false,
  logLevel: 'warn',
  server: { middlewareMode: true },
  appType: 'custom',
});

let renderPlantsDoc;
try {
  ({ renderPlantsDoc } = await server.ssrLoadModule('/src/model/plants/doc.ts'));
} finally {
  await server.close();
}

const before = await readFile(file, 'utf8');
const after = renderPlantsDoc(before);
const name = relative(repo, file);

if (after === before) {
  console.log(`${name} is already up to date`);
} else {
  await writeFile(file, after);
  const was = before.split('\n');
  const now = after.split('\n');
  const changed = now.filter((line, i) => line !== was[i]).length;
  console.log(`${name} rewritten — ${changed} line${changed === 1 ? '' : 's'} differ`);
}
