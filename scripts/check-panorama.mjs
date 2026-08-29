/**
 * Drives the 360° view: turns on the spot, moves the viewpoint, and captures
 * the same garden looking each way. The assertion that matters is that turning
 * actually changes what is in front of you — a panorama that renders but never
 * responds to the heading looks fine in a single screenshot.
 *
 *   node scripts/check-panorama.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3] ?? 'screenshots';
await mkdir(outDir, { recursive: true });

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.gardenStore));

await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.clearPlants();
  for (const [id, x, y] of [
    ['betula-jacquemontii', 3.5, 2.6],
    ['eucalyptus-gunnii', 11.0, 2.2],
    ['magnolia-soulangeana', 7.0, 2.4],
    ['taxus-baccata', 2.0, 5.0],
    ['taxus-baccata', 2.0, 6.2],
    ['hydrangea-limelight', 4.6, 6.4],
    ['stipa-gigantea', 9.4, 6.0],
    ['allium-purple-sensation', 6.4, 6.8],
    ['lavandula-hidcote', 8.0, 7.6],
    ['cornus-midwinter-fire', 12.4, 6.4],
    ['geranium-rozanne', 5.4, 8.0],
  ]) s.addPlant(id, { x, y });
  const st = window.gardenStore.getState();
  st.select(null);
  st.setStageView('panorama');
  st.moveObserver({ x: 7, y: 9.0 });
  st.setHeading(0);
  st.setTime({ doy: 196, hour: 15, year: 10 });
});
await page.waitForTimeout(400);

check(
  await page.evaluate(() => window.gardenStore.getState().stageView === 'panorama'),
  '360° view is on screen',
);

// Turning must change the picture.
const frames = [];
for (const [heading, label] of [[0, 'north'], [90, 'east'], [180, 'south'], [270, 'west']]) {
  await page.evaluate((h) => window.gardenStore.getState().setHeading(h), heading);
  await page.waitForTimeout(220);
  const buf = await page.locator('.panorama-canvas').screenshot();
  frames.push({ label, hash: buf.length + ':' + buf.subarray(0, 4096).toString('base64').slice(0, 64) });
  await page.screenshot({ path: `${outDir}/20-pano-${label}.png` });
  process.stdout.write(`  captured looking ${label}\n`);
}
check(new Set(frames.map((f) => f.hash)).size === frames.length, 'each heading renders a different view');

// Dragging the picture turns the viewer.
await page.evaluate(() => window.gardenStore.getState().setHeading(0));
await page.waitForTimeout(150);
const box = await page.locator('.panorama-canvas').boundingBox();
await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(200);
const afterDrag = await page.evaluate(() => window.gardenStore.getState().observer.heading);
check(afterDrag > 5 && afterDrag < 180, 'dragging left turns the viewer right', `heading=${Math.round(afterDrag)}°`);

// The heading stays a proper bearing however far you spin.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  for (let i = 0; i < 12; i++) s.turnObserver(45);
});
const spun = await page.evaluate(() => window.gardenStore.getState().observer.heading);
check(spun >= 0 && spun < 360, 'heading stays within a full turn', `${Math.round(spun)}°`);

// Tilting must move the picture, and must stop rather than tumble.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.setHeading(0);
  s.setPitch(0);
});
await page.waitForTimeout(150);
const level = await page.locator('.panorama-canvas').screenshot();
await page.evaluate(() => window.gardenStore.getState().setPitch(40));
await page.waitForTimeout(200);
const lookingUp = await page.locator('.panorama-canvas').screenshot();
check(!level.equals(lookingUp), 'looking up changes the picture');
await page.screenshot({ path: `${outDir}/23-pano-looking-up.png` });

await page.evaluate(() => window.gardenStore.getState().setPitch(500));
const clamped = await page.evaluate(() => window.gardenStore.getState().observer.pitch);
check(clamped <= 55 && clamped > 0, 'tilt stops short of straight up', `${clamped}°`);
await page.evaluate(() => window.gardenStore.getState().setPitch(12));

// A viewpoint at the far end looking back should see different plants.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.moveObserver({ x: 7, y: 1.2 });
  s.setHeading(180);
});
await page.waitForTimeout(250);
await page.screenshot({ path: `${outDir}/21-pano-from-far-end.png` });

// And it must still work in winter, at dusk, twenty years on.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.moveObserver({ x: 7, y: 9.0 });
  s.setHeading(0);
  s.setTime({ doy: 20, hour: 15.6, year: 20 });
});
await page.waitForTimeout(250);
await page.screenshot({ path: `${outDir}/22-pano-january-dusk.png` });

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));
await browser.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall panorama checks passed');
