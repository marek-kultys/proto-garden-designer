/**
 * Every browser check that can decide for itself, in one command.
 *
 *   node scripts/check-browser.mjs [--skip-build] [--port 4173]
 *
 * These checks used to be nine separate invocations, four of which wanted a
 * preview server already running and two of which wanted an absolute path — so
 * the usual way to run them was to run some of them, wrongly, and read the
 * failures as real. One command builds what they need, serves it, runs them
 * all and tears down.
 *
 * Only the checks that assert are here. `screenshots.mjs` and
 * `readme-images.mjs` exist to be looked at by a person and have no opinion
 * about what they find, so they stay separate; a gate cannot use them and
 * neither can this.
 *
 * What is served is the single file, not the ordinary build, because the single
 * file is what is published and what testers are sent. Checking the other one
 * would be checking something nobody receives.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const port = Number(args[args.indexOf('--port') + 1]) || 4173;
const url = `http://localhost:${port}`;

/** Run a command to completion, with its output going straight to the screen. */
function run(command, commandArgs, options = {}) {
  return new Promise((done) => {
    const child = spawn(command, commandArgs, {
      cwd: repo,
      stdio: 'inherit',
      shell: false,
      ...options,
    });
    child.on('close', (code) => done(code ?? 1));
    child.on('error', () => done(1));
  });
}

/** Wait for the preview server to actually answer, rather than guessing at it. */
async function waitForServer(limitMs = 30_000) {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      // Not up yet. The loop below is the timeout.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

if (!skipBuild) {
  console.log('\n— building the single file —\n');
  const built = await run('npm', ['run', 'build'], { env: { ...process.env, SINGLEFILE: '1' } });
  if (built !== 0) {
    console.error('\nthe build failed, so there is nothing to check');
    process.exit(1);
  }
}

// Repacked either way, including after --skip-build: it is a second's work, and
// it has to match whatever is in dist rather than whatever was there last time.
const packed = await run('node', ['scripts/make-artifact.mjs']);
if (packed !== 0) {
  console.error('\nthe artifact could not be packed');
  process.exit(1);
}

console.log(`\n— serving dist/ at ${url} —`);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: repo,
  stdio: 'ignore',
  shell: false,
});
// The server is a child of this process, so it dies with it — but not if this
// process is killed outright, hence the explicit stop at the end and on signals.
const stopServer = () => {
  if (!server.killed) server.kill();
};
process.on('exit', stopServer);
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

if (!(await waitForServer())) {
  stopServer();
  console.error(`\nnothing answered at ${url}; is the port already taken?`);
  process.exit(1);
}

/**
 * The served checks first, then the three that open a file directly. Drawing
 * leads because it is the one that fails most usefully: a picture of what
 * changed, rather than a sentence about it.
 */
const checks = [
  ['check-drawing', [url]],
  ['check-habits', [url, 'screenshots']],
  ['check-editing', [url, 'screenshots']],
  ['check-mobile', [url, 'screenshots']],
  ['check-panorama', [url, 'screenshots']],
  ['check-library', [url]],
  ['check-singlefile', []],
  ['check-narrow', []],
  ['check-artifact', []],
];

const failed = [];
for (const [name, checkArgs] of checks) {
  console.log(`\n————— ${name} —————\n`);
  const code = await run('node', [`scripts/${name}.mjs`, ...checkArgs]);
  if (code !== 0) failed.push(name);
}

stopServer();

console.log('\n' + '='.repeat(60));
if (failed.length === 0) {
  console.log(`all ${checks.length} browser checks passed`);
} else {
  console.log(`${failed.length} of ${checks.length} failed: ${failed.join(', ')}`);
}
process.exit(failed.length === 0 ? 0 : 1);
