/**
 * Captures the handful of images the README shows. Separate from
 * `screenshots.mjs`, which sweeps the whole slider matrix into a gitignored
 * folder for looking at: these few are committed, so they are pinned to a fixed
 * design and captured at 1× to keep the files small enough to live in the repo.
 *
 *   npx vite preview --port 4173
 *   node scripts/readme-images.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseUrl = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3] ?? 'docs/img';

/** Canopy, structure, shrubs and underplanting — enough to read as a garden. */
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

const SHOTS = [
  { name: 'plan-june-year0', doy: 155, hour: 13, year: 0 },
  { name: 'plan-june-year20', doy: 155, hour: 13, year: 20 },
  { name: 'plan-october-year20', doy: 288, hour: 16, year: 20 },
  { name: 'shade-map-june-year20', doy: 155, hour: 13, year: 20, overlay: true },
  // Stand in the far corner looking back across the garden. Anywhere near the
  // middle at twenty years puts the eye inside the maple's canopy.
  { name: 'panorama-june-year20', doy: 155, hour: 17.5, year: 20, panorama: true, eye: { x: 12.6, y: 9.4 }, heading: 310 },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.gardenStore));

await page.evaluate((design) => {
  const s = window.gardenStore.getState();
  s.clearPlants();
  for (const [id, x, y] of design) s.addPlant(id, { x, y });
  window.gardenStore.getState().select(null);
}, DESIGN);

for (const shot of SHOTS) {
  await page.evaluate((s) => {
    const st = window.gardenStore.getState();
    st.setTime({ doy: s.doy, hour: s.hour, year: s.year });
    st.setStageView(s.panorama ? 'panorama' : 'elevation');
    if (s.panorama) {
      st.moveObserver(s.eye);
      st.setHeading(s.heading);
    }
    if (window.gardenStore.getState().showOverlay !== Boolean(s.overlay)) {
      st.toggle('showOverlay');
    }
  }, shot);
  // The shade grid is debounced; give it time to land before capturing.
  await page.waitForTimeout(shot.overlay ? 1200 : 400);
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
