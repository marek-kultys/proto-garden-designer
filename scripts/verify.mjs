/**
 * Every device-free check, in one pass.
 *
 *   npm run verify
 *
 * This is the gate to run before committing anything non-trivial. It covers the
 * half of verification that needs no browser and no person: the types compile,
 * the models still agree with their tests, and both of the two build targets
 * still produce a build.
 *
 * What it deliberately does not cover: the Playwright checks in this directory.
 * They need a browser download and a served build, and they catch the things no
 * unit test can see — a plant drawn in the wrong shape, a layout that scrolls
 * sideways, the single-file build reaching off-origin. Those stay a separate,
 * manual step; see the README.
 *
 * Every stage runs even after one fails, rather than stopping at the first. The
 * whole pass takes a few seconds, and when a change breaks two things at once it
 * is much more useful to be told both than to fix one and rerun to find the
 * other.
 *
 * `tsc -b` is run on its own before the builds, even though `npm run build` runs
 * it too. It is not wasted work: `-b` caches to .tsbuildinfo, so the build's copy
 * is a cache hit. What it buys is a type error reported as a type error, rather
 * than as a build that failed for reasons you have to read to discover.
 */
import { spawnSync } from 'node:child_process';

const stages = [
  { label: 'types', command: 'npx tsc -b' },
  { label: 'tests', command: 'npx vitest run' },
  { label: 'build', command: 'npm run build' },
  { label: 'single file', command: 'npm run build', env: { SINGLEFILE: '1' } },
];

const failures = [];
const started = Date.now();

for (const { label, command, env } of stages) {
  const at = Date.now();
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const seconds = ((Date.now() - at) / 1000).toFixed(1);
  const ok = result.status === 0;

  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label} — ${seconds}s`);

  if (!ok) {
    failures.push({ label, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() });
  }
}

const total = ((Date.now() - started) / 1000).toFixed(1);

if (failures.length) {
  for (const { label, output } of failures) {
    console.error(`\n${'─'.repeat(60)}\n${label} failed:\n${'─'.repeat(60)}`);
    console.error(output || '(the command produced no output)');
  }
  console.error(`\n${failures.length} of ${stages.length} stages failed — ${total}s`);
  process.exit(1);
}

console.log(`\nall ${stages.length} stages passed — ${total}s`);
