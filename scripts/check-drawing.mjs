/**
 * The drawing itself, compared against pictures of what it should look like.
 *
 *   node scripts/check-drawing.mjs [url] [--update]
 *
 * The fault this exists for: ten plants vanished from the side views every
 * winter for weeks, and it was found by someone happening to look at January.
 * No unit test can see that — the drawing code's output is a canvas, and what
 * is wrong with it is what it looks like.
 *
 * Screenshots could not be compared before because the app gives every plant a
 * random seed when it is planted, so no two runs drew the same sketch. Here the
 * design is written straight into the store with seeds of its own, which makes
 * every scene reproducible to the pixel; the references in `docs/golden/` are
 * then just files, and a drawing regression is a file that stopped matching.
 *
 * When a scene differs the check writes two pictures into `screenshots/`: what
 * it drew, and a diff with every changed pixel picked out in magenta. The diff
 * is made in the browser, which can already decode a PNG — a diff worth looking
 * at is worth more than avoiding thirty lines of canvas work, and it costs no
 * dependency.
 *
 * `--update` accepts what it drew as the new reference. That is a deliberate
 * act: look at the pictures first, and expect to say in the commit why the
 * drawing changed.
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const update = args.includes('--update');
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const goldenDir = resolve(repo, 'docs/golden');
const outDir = resolve(repo, 'screenshots');
await mkdir(goldenDir, { recursive: true });
await mkdir(outDir, { recursive: true });

/**
 * One plant of every shape, at fixed positions with fixed seeds, plus a wall
 * along the back and a raised bed. Between them they exercise every draw
 * function, every trained form, the flat shadow, and a structure's shadow.
 */
const PLANTS = [
  ['betula-jacquemontii', 1.8, 2.0],
  ['amelanchier-lamarckii', 4.6, 2.0],
  ['taxus-baccata', 7.0, 2.0],
  ['lavandula-hidcote', 9.0, 2.0],
  ['calamagrostis-karl-foerster', 10.8, 2.0],
  ['hosta-halcyon', 12.6, 2.0],
  ['verbena-bonariensis', 1.8, 5.2],
  ['allium-sphaerocephalon', 3.6, 5.2],
  ['delphinium-elatum', 5.4, 5.2],
  ['dryopteris-filix-mas', 7.2, 5.2],
  ['dicksonia-antarctica', 9.2, 5.2],
  ['clematis-montana', 11.6, 5.2],
  ['pleached-tree', 2.4, 8.4],
  ['umbrella-tree', 5.4, 8.4],
  ['fan-trained-tree', 8.4, 8.4],
  ['cordon-tree', 11.4, 8.4],
  // Chosen for what they do out of season, which is where the drawing has
  // actually gone wrong: a spire standing bare through winter (the shape that
  // once vanished from October to March), stonecrop holding its seedheads,
  // witch hazel flowering on bare wood in January, and two bulbs that must be
  // drawn in spring and gone by midsummer.
  ['veronicastrum-virginicum', 2.6, 3.7],
  ['hylotelephium-herbstfreude', 5.6, 3.7],
  ['hamamelis-intermedia', 9.0, 3.7],
  ['galanthus-nivalis', 11.8, 3.7],
  ['muscari-armeniacum', 12.4, 6.9],
];

const STRUCTURES = [
  {
    id: 'wall-1',
    kind: 'wall',
    points: [
      { x: 0.6, y: 0.8 },
      { x: 13.4, y: 0.8 },
    ],
    height: 1.8,
    thickness: 0.25,
    seed: 4242,
  },
  {
    id: 'bed-1',
    kind: 'bed',
    points: [
      { x: 1.2, y: 6.6 },
      { x: 5.2, y: 6.6 },
      { x: 5.2, y: 9.4 },
      { x: 1.2, y: 9.4 },
    ],
    height: 0.45,
    thickness: 0.1,
    seed: 99,
  },
];

/** Midsummer afternoon, a January noon, and the eight-year-old garden in both. */
const SCENES = [
  { name: 'plan-summer', canvas: 'plan', time: { doy: 172, hour: 14, year: 8 }, view: 'elevation' },
  {
    name: 'elevation-summer',
    canvas: 'stage',
    time: { doy: 172, hour: 14, year: 8 },
    view: 'elevation',
  },
  // The scene the check exists for: the winter side view, where ten plants once
  // quietly stopped being drawn at all.
  {
    name: 'elevation-winter',
    canvas: 'stage',
    time: { doy: 15, hour: 12, year: 8 },
    view: 'elevation',
  },
  // Two dates are not enough. A plant can be drawn correctly in midsummer and
  // in January and still vanish in between: what fails in the shoulder seasons
  // is the handover — leaves going over while flowers or seedheads still
  // stand. Reintroducing the winter-spire bug on purpose passed both
  // solstices and was caught here, which is why these two scenes exist.
  {
    name: 'elevation-spring',
    canvas: 'stage',
    time: { doy: 105, hour: 12, year: 8 },
    view: 'elevation',
  },
  {
    name: 'elevation-autumn',
    canvas: 'stage',
    time: { doy: 300, hour: 12, year: 8 },
    view: 'elevation',
  },
  { name: 'panorama-summer', canvas: 'stage', time: { doy: 172, hour: 14, year: 8 }, view: 'panorama' },
  {
    name: 'sun-map',
    canvas: 'plan',
    time: { doy: 172, hour: 14, year: 8 },
    view: 'elevation',
    overlay: true,
  },
];

const failures = [];
const report = (ok, label, detail = '') =>
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);

const browser = await chromium.launch();
// Half scale: the picture is the same drawing at half the pixels, which keeps a
// reference around 60 kB rather than a quarter of a megabyte in the history.
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 0.5 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.gardenStore));

for (const scene of SCENES) {
  await page.evaluate(
    ({ plants, structures, scene }) => {
      const store = window.gardenStore;
      store.getState().clearPlants();
      store.setState({
        plants: plants.map(([speciesId, x, y], i) => ({
          id: `fixed-${i}`,
          speciesId,
          x,
          y,
          seed: 1000 + i * 7919,
          plantedAge: 0,
          facing: (i * 23) % 180,
        })),
        structures,
        selectedId: null,
        selectedStructureId: null,
        stageView: scene.view,
        showOverlay: Boolean(scene.overlay),
        showShadows: true,
        showGrid: true,
        // The widest slice, so the side views hold the whole planting rather
        // than the handful of plants nearest the sight line — a plant that
        // vanishes in January cannot be caught by a picture it is not in.
        sliceDepth: 20,
        observer: { x: 7, y: 9.2, heading: 0, fov: 90, pitch: 12, eyeHeight: 1.6, groundHeight: 0 },
      });
      store.getState().setTime(scene.time);
    },
    { plants: PLANTS, structures: STRUCTURES, scene },
  );
  await page.waitForTimeout(700);

  const selector = scene.canvas === 'plan' ? '.plan-wrap canvas' : '.elevation-wrap canvas';
  const shot = await page.locator(selector).first().screenshot();
  const goldenPath = resolve(goldenDir, `${scene.name}.png`);

  if (update || !existsSync(goldenPath)) {
    await writeFile(goldenPath, shot);
    report(true, scene.name, existsSync(goldenPath) ? 'reference written' : 'reference created');
    continue;
  }

  const golden = await readFile(goldenPath);
  if (golden.equals(shot)) {
    report(true, scene.name, `${(shot.length / 1024).toFixed(0)} kB, unchanged`);
    continue;
  }

  // Different. Say how different, and leave two pictures to look at.
  const diff = await page.evaluate(
    async ([a, b]) => {
      const load = (data) =>
        new Promise((done) => {
          const img = new Image();
          img.onload = () => done(img);
          img.src = `data:image/png;base64,${data}`;
        });
      const [one, two] = await Promise.all([load(a), load(b)]);
      const w = Math.max(one.width, two.width);
      const h = Math.max(one.height, two.height);
      const read = (img) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        return cx.getImageData(0, 0, w, h);
      };
      const first = read(one);
      const second = read(two);
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const octx = out.getContext('2d');
      const image = octx.createImageData(w, h);
      let changed = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        const same =
          first.data[i] === second.data[i] &&
          first.data[i + 1] === second.data[i + 1] &&
          first.data[i + 2] === second.data[i + 2] &&
          first.data[i + 3] === second.data[i + 3];
        if (same) {
          // Keep the old picture underneath, faded, so the change has context.
          const grey = (first.data[i] + first.data[i + 1] + first.data[i + 2]) / 3;
          const pale = 255 - (255 - grey) * 0.25;
          image.data[i] = pale;
          image.data[i + 1] = pale;
          image.data[i + 2] = pale;
          image.data[i + 3] = 255;
        } else {
          changed++;
          image.data[i] = 214;
          image.data[i + 1] = 31;
          image.data[i + 2] = 133;
          image.data[i + 3] = 255;
        }
      }
      octx.putImageData(image, 0, 0);
      return { url: out.toDataURL('image/png'), changed, total: w * h };
    },
    [golden.toString('base64'), shot.toString('base64')],
  );

  const actualPath = resolve(outDir, `${scene.name}.actual.png`);
  const diffPath = resolve(outDir, `${scene.name}.diff.png`);
  await writeFile(actualPath, shot);
  await writeFile(diffPath, Buffer.from(diff.url.split(',')[1], 'base64'));
  const share = ((diff.changed / diff.total) * 100).toFixed(2);
  report(false, scene.name, `${share}% of pixels changed — see screenshots/${scene.name}.diff.png`);
  failures.push(scene.name);
}

report(errors.length === 0, 'no console or page errors', errors.slice(0, 2).join(' · '));
if (errors.length > 0) failures.push('console errors');

await browser.close();

if (failures.length > 0) {
  console.log(`\n${failures.length} scene${failures.length === 1 ? '' : 's'} differ: ${failures.join(', ')}`);
  console.log('Look at the diffs. If the change is meant, rerun with --update and say why in the commit.');
  process.exit(1);
}
console.log('\nevery scene matches its reference');
