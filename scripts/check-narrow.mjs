/**
 * Does the layout scroll sideways on a narrow screen?
 *
 *   node scripts/check-narrow.mjs [file] [outDir]
 *
 * Same reason as check-singlefile: the output path was one container's scratch
 * directory, so this could not run anywhere else.
 *
 * It used to print "SIDEWAYS SCROLL" and exit zero, which reads fine to a
 * person watching and is invisible to anything else. Now it fails.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? resolve(repo, 'dist/index.html');
const outDir = process.argv[3] ?? 'screenshots';
await mkdir(outDir, { recursive: true });

const failures = [];
const browser = await chromium.launch();
for (const [w, h, label] of [[820, 1180, 'tablet-portrait'], [1440, 900, 'desktop']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto(`file://${file}`);
  await page.waitForFunction(() => Boolean(window.gardenStore), { timeout: 15000 });
  await page.evaluate(() => {
    const s = window.gardenStore.getState();
    for (const [id, x, y] of [['betula-jacquemontii', 4, 3], ['acer-osakazuki', 9, 6.5], ['taxus-baccata', 12, 5], ['lavandula-hidcote', 6, 5]]) s.addPlant(id, { x, y });
    s.select(null);
    s.setTime({ doy: 288, hour: 14, year: 15 });
  });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  await page.screenshot({ path: `${outDir}/narrow-${label}.png`, fullPage: label === 'tablet-portrait' });
  const sideways = m.scrollW > m.clientW;
  if (sideways) failures.push(label);
  console.log(`${label} ${w}x${h}: scrollW=${m.scrollW} clientW=${m.clientW} -> ${sideways ? 'SIDEWAYS SCROLL' : 'ok'}`);
  await page.close();
}
await browser.close();
console.log(
  failures.length === 0
    ? 'no sideways scroll at any width'
    : `sideways scroll at: ${failures.join(', ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
