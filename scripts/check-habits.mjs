/**
 * Every new habit gets a plant on the plan and one in front of the eye, because
 * a habit that falls through to the wrong draw function still renders — it just
 * renders a clematis as a small tree, which no test can see.
 *
 *   node scripts/check-habits.mjs [url] [outDir]
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
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.gardenStore));

// One representative of each new habit, plus a familiar tree for scale.
const NEW_HABITS = [
  ['clematis-montana', 'climber', 3.0, 1.2],
  ['vitis-coignetiae', 'climber', 11.0, 1.2],
  ['dryopteris-filix-mas', 'fern', 2.2, 5.0],
  ['dicksonia-antarctica', 'treefern', 5.0, 5.0],
  ['delphinium-elatum', 'spire', 7.6, 5.0],
  ['digitalis-purpurea', 'spire', 9.2, 5.2],
  ['betula-jacquemontii', 'round', 12.0, 2.4],
];

await page.evaluate((plants) => {
  const s = window.gardenStore.getState();
  s.clearPlants();
  for (const [id, , x, y] of plants) s.addPlant(id, { x, y });
  const st = window.gardenStore.getState();
  st.select(null);
  st.setTime({ doy: 172, hour: 14, year: 8 });
}, NEW_HABITS);
await page.waitForTimeout(600);

check(
  await page.evaluate((n) => window.gardenStore.getState().plants.length === n, NEW_HABITS.length),
  'every representative plant was placed',
);

// The habits must reach the species data intact.
for (const [id, habit] of NEW_HABITS) {
  const actual = await page.evaluate(
    (pid) => window.gardenStore.getState().plants.find((p) => p.speciesId === pid) && pid,
    id,
  );
  check(Boolean(actual), `${id} (${habit}) is on the plan`);
}

await page.screenshot({ path: `${outDir}/habits-plan.png` });

// Elevation: run the sight line through the whole row so all of them draw.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.setStageView('elevation');
  s.setSightEnd('a', { x: 0.5, y: 3.6 });
  s.setSightEnd('b', { x: 13.5, y: 3.6 });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/habits-elevation.png` });

// The 360 view uses the same elevation draw, so a habit that throws there
// takes the whole panorama down rather than drawing nothing.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.setStageView('panorama');
  s.moveObserver({ x: 7, y: 9.2 });
  s.setHeading(0);
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/habits-panorama.png` });

// Winter: bare climbers, dormant ferns and spires, so the dormant paths run too.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.setStageView('elevation');
  s.setTime({ doy: 20, hour: 12, year: 8 });
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${outDir}/habits-winter.png` });

check(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log('\nall habit checks passed');
