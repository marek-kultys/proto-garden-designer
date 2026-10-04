/**
 * The self-contained build, opened as a file, must run and must reach nothing.
 *
 *   node scripts/check-singlefile.mjs [file] [outDir]
 *
 * Paths resolve against this script rather than the working directory, because
 * they used to be one container's absolute paths — which meant the check could
 * not run on the machine the app is actually built on.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? resolve(repo, 'dist/index.html');
const outDir = process.argv[3] ?? 'screenshots';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
const requests = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
await page.goto(`file://${file}`);
await page.waitForFunction(() => Boolean(window.gardenStore), { timeout: 15000 });
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.addPlant('betula-jacquemontii', { x: 4, y: 4 });
  s.addPlant('taxus-baccata', { x: 10, y: 6 });
  s.setTime({ doy: 288, hour: 15, year: 12 });
  s.toggle('showOverlay');
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${outDir}/singlefile.png` });
const planted = await page.evaluate(() => window.gardenStore.getState().plants.length);

/**
 * The interface's colours live in `render/chrome.ts` and are handed to the
 * stylesheet at startup, because a canvas cannot read a custom property. If
 * that handover ever stopped happening, every panel would lose its colour while
 * the drawing kept its own — and the canvas comparisons in check-drawing would
 * not notice, because the canvas would be untouched. This is what notices.
 */
const painted = await page.evaluate(() => {
  const root = getComputedStyle(document.documentElement);
  const value = (name) => root.getPropertyValue(name).trim().toLowerCase();
  return {
    paper: value('--paper'),
    accent: value('--accent'),
    body: getComputedStyle(document.body).backgroundColor,
  };
});
const coloured =
  painted.paper === '#f7f4ec' &&
  painted.accent === '#3f80b0' &&
  painted.body === 'rgb(247, 244, 236)';

await browser.close();
console.log('plants placed:', planted);
console.log('off-origin requests:', requests.length ? requests : 'none');
console.log('interface colours applied:', coloured ? 'yes' : `NO — ${JSON.stringify(painted)}`);
console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length || requests.length || !coloured ? 1 : 0);
