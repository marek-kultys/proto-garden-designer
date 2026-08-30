/**
 * Drives the built app in Chromium and captures the same planted design at a
 * matrix of slider positions. The point is to confirm with your eyes that the
 * three sliders actually change the drawing — a passing model test says the
 * numbers are right, not that anything reached the canvas.
 *
 *   node scripts/screenshots.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3] ?? 'screenshots';

/** A fixed design: a tree canopy, structure, shrubs and underplanting. */
const DESIGN = [
  ['betula-jacquemontii', 3.5, 3.0],
  ['amelanchier-lamarckii', 10.5, 2.6],
  ['acer-osakazuki', 7.0, 7.6],
  ['taxus-baccata', 12.6, 5.2],
  ['taxus-baccata', 12.6, 6.4],
  ['hydrangea-limelight', 2.2, 6.4],
  ['lavandula-hidcote', 5.4, 5.1],
  ['calamagrostis-karl-foerster', 8.6, 4.6],
  ['hosta-halcyon', 4.4, 4.6],
  ['verbena-bonariensis', 6.6, 2.6],
  ['geranium-rozanne', 9.8, 6.2],
];

/**
 * A second planting, made of the species that exercise behaviours the first ten
 * never did — flowering on bare wood, fruit held after leaf fall, coloured
 * winter stems, a bulb that vanishes in high summer, an annual.
 */
const SHOWCASE = [
  ['magnolia-soulangeana', 3.2, 3.0],
  ['malus-evereste', 10.8, 2.8],
  ['eucalyptus-gunnii', 7.0, 7.8],
  ['cornus-midwinter-fire', 2.4, 6.6],
  ['viburnum-tinus', 12.6, 6.6],
  ['allium-purple-sensation', 5.2, 5.0],
  ['allium-purple-sensation', 5.9, 5.4],
  ['cosmos-bipinnatus', 7.4, 4.8],
  ['stipa-gigantea', 9.2, 5.2],
  ['helleborus-hybridus', 3.8, 5.2],
  ['rudbeckia-goldsturm', 10.6, 5.0],
];

const SHOWCASE_SHOTS = [
  { name: '11-showcase-april-magnolia', doy: 96, hour: 13, year: 8 },
  { name: '12-showcase-may-allium', doy: 143, hour: 13, year: 8 },
  { name: '13-showcase-august', doy: 228, hour: 14, year: 8 },
  { name: '14-showcase-november-fruit', doy: 320, hour: 12, year: 8 },
  { name: '15-showcase-january-stems', doy: 20, hour: 12, year: 8 },
];

const SHOTS = [
  { name: '01-june-midday-now', doy: 155, hour: 13, year: 0 },
  { name: '02-june-midday-20y', doy: 155, hour: 13, year: 20 },
  { name: '03-june-early-morning-20y', doy: 155, hour: 6.5, year: 20 },
  { name: '04-june-evening-20y', doy: 155, hour: 19.5, year: 20 },
  { name: '05-april-midday-10y', doy: 105, hour: 13, year: 10 },
  { name: '06-october-midday-20y', doy: 288, hour: 13, year: 20 },
  { name: '07-january-midday-20y', doy: 15, hour: 12, year: 20 },
  { name: '08-january-dusk-20y', doy: 15, hour: 16.6, year: 20 },
  { name: '09-june-shade-map-20y', doy: 155, hour: 13, year: 20, overlay: true },
  { name: '10-january-shade-map-20y', doy: 15, hour: 12, year: 20, overlay: true },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.gardenStore));

await page.evaluate((design) => {
  const store = window.gardenStore.getState();
  store.clearPlants();
  for (const [speciesId, x, y] of design) store.addPlant(speciesId, { x, y });
  window.gardenStore.getState().select(null);
}, DESIGN);

for (const shot of SHOTS) {
  await page.evaluate((s) => {
    const store = window.gardenStore.getState();
    store.setTime({ doy: s.doy, hour: s.hour, year: s.year });
    if (window.gardenStore.getState().showOverlay !== Boolean(s.overlay)) {
      store.toggle('showOverlay');
    }
  }, shot);
  // Let the debounced shade computation land before capturing.
  await page.waitForTimeout(shot.overlay ? 900 : 250);
  await page.screenshot({ path: `${outDir}/${shot.name}.png` });
  process.stdout.write(`captured ${shot.name}\n`);
}

// Second pass: swap the planting and walk the same year.
await page.evaluate((design) => {
  const store = window.gardenStore.getState();
  store.clearPlants();
  for (const [speciesId, x, y] of design) store.addPlant(speciesId, { x, y });
  const s = window.gardenStore.getState();
  s.select(null);
  if (s.showOverlay) s.toggle('showOverlay');
}, SHOWCASE);

for (const shot of SHOWCASE_SHOTS) {
  await page.evaluate((s) => {
    window.gardenStore.getState().setTime({ doy: s.doy, hour: s.hour, year: s.year });
  }, shot);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/${shot.name}.png` });
  process.stdout.write(`captured ${shot.name}\n`);
}

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} console/page error(s):`);
  for (const e of errors.slice(0, 10)) console.error(`  ${e}`);
  process.exit(1);
}
console.log('\nno console errors');
