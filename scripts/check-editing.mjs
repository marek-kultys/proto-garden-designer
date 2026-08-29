/**
 * Editing on the plan: right-click to duplicate, and the viewpoint height.
 *
 *   node scripts/check-editing.mjs [url] [outDir]
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
  s.addPlant('hosta-halcyon', { x: 5, y: 5 });
  window.gardenStore.getState().setTime({ doy: 196, hour: 13, year: 6 });
});
await page.waitForTimeout(300);

// Right-clicking the plant opens its menu.
const plantAt = await page.evaluate(() => {
  const p = window.gardenStore.getState().plants[0];
  return { x: p.x, y: p.y };
});
const canvas = await page.locator('.plan-canvas').boundingBox();
const toClient = await page.evaluate(({ x, y }) => {
  // Ask the app where that plant is on screen, via the same viewport it draws with.
  const el = document.querySelector('.plan-canvas');
  const r = el.getBoundingClientRect();
  return { r: { left: r.left, top: r.top, width: r.width, height: r.height }, x, y };
}, plantAt);
void canvas;

// Reading the transform back out is fragile; instead sweep for the plant.
let hit = null;
for (let fx = 0.2; fx <= 0.85 && !hit; fx += 0.02) {
  for (let fy = 0.2; fy <= 0.85 && !hit; fy += 0.02) {
    const cx = toClient.r.left + toClient.r.width * fx;
    const cy = toClient.r.top + toClient.r.height * fy;
    await page.mouse.click(cx, cy);
    const selected = await page.evaluate(() => window.gardenStore.getState().selectedId);
    if (selected) hit = { cx, cy };
  }
}
check(Boolean(hit), 'the plant can be selected by clicking the plan');

await page.mouse.click(hit.cx, hit.cy, { button: 'right' });
await page.waitForTimeout(200);
check(await page.locator('.plant-menu').isVisible(), 'right-click opens the plant menu');
await page.screenshot({ path: `${outDir}/24-plant-menu.png` });

const before = await page.evaluate(() => window.gardenStore.getState().plants.length);
await page.getByRole('menuitem', { name: /Add another/ }).click();
await page.waitForTimeout(200);
const after = await page.evaluate(() => window.gardenStore.getState().plants.length);
check(after === before + 1, 'the menu adds another of the same plant', `${before} → ${after}`);

const copies = await page.evaluate(() => {
  const ps = window.gardenStore.getState().plants;
  return { ids: ps.map((p) => p.speciesId), seeds: ps.map((p) => p.seed), xs: ps.map((p) => p.x) };
});
check(new Set(copies.ids).size === 1, 'the copy is the same species');
check(new Set(copies.seeds).size === 2, 'the copy is a different individual, not a clone');
check(copies.xs[0] !== copies.xs[1], 'the copy lands beside the original, not on top of it');
check(
  await page.evaluate(() => window.gardenStore.getState().selectedId === window.gardenStore.getState().plants[1].id),
  'the new copy is selected, ready to drag',
);
check(!(await page.locator('.plant-menu').isVisible()), 'the menu closes after choosing');

// Keyboard shortcut does the same.
const n1 = await page.evaluate(() => window.gardenStore.getState().plants.length);
await page.keyboard.press('Control+d');
await page.waitForTimeout(150);
const n2 = await page.evaluate(() => window.gardenStore.getState().plants.length);
check(n2 === n1 + 1, 'ctrl/cmd-D duplicates the selection', `${n1} → ${n2}`);

// Right-clicking bare ground opens nothing.
await page.mouse.click(toClient.r.left + 20, toClient.r.top + 20, { button: 'right' });
await page.waitForTimeout(150);
check(!(await page.locator('.plant-menu').isVisible()), 'right-clicking bare ground opens nothing');

// Undo, driven through the real buttons and a real pointer drag.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.clearPlants();
  s.addPlant('hosta-halcyon', { x: 5, y: 5 });
  window.gardenStore.getState().select(null);
});
await page.waitForTimeout(200);

const undoBtn = page.getByRole('button', { name: 'Undo' });
const redoBtn = page.getByRole('button', { name: 'Redo' });
check(await undoBtn.isEnabled(), 'undo is offered once there is something to undo');
check(await redoBtn.isDisabled(), 'redo is not offered until something is undone');

// Drag the plant across the plan with the mouse, then undo it in one step.
await page.mouse.click(hit.cx, hit.cy);
const draggedTo = { x: hit.cx + 150, y: hit.cy + 60 };
await page.mouse.move(hit.cx, hit.cy);
await page.mouse.down();
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(hit.cx + (150 * i) / 20, hit.cy + (60 * i) / 20);
}
await page.mouse.up();
await page.waitForTimeout(200);
void draggedTo;

const moved = await page.evaluate(() => window.gardenStore.getState().plants[0].x);
const depth = await page.evaluate(() => window.gardenStore.getState().past.length);
await undoBtn.click();
await page.waitForTimeout(200);
const back = await page.evaluate(() => window.gardenStore.getState().plants[0]?.x);
check(Math.abs(back - moved) > 0.2, 'one undo takes back the whole drag', `${moved.toFixed(2)} → ${back?.toFixed(2)}`);
check(
  await page.evaluate((d) => window.gardenStore.getState().past.length === d - 1, depth),
  'a drag left exactly one entry on the stack',
);

// Clear planting, then get it all back.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.addPlant('lavandula-hidcote', { x: 3, y: 7 });
  s.addPlant('taxus-baccata', { x: 11, y: 4 });
});
const beforeClear = await page.evaluate(() => window.gardenStore.getState().plants.length);
await page.getByRole('button', { name: 'Clear planting' }).click();
await page.waitForTimeout(200);
check(await page.evaluate(() => window.gardenStore.getState().plants.length === 0), 'Clear planting empties the plan');
await page.keyboard.press('Control+z');
await page.waitForTimeout(200);
const restored = await page.evaluate(() => window.gardenStore.getState().plants.length);
check(restored === beforeClear, 'ctrl-Z brings the whole planting back', `${restored} of ${beforeClear}`);
await page.screenshot({ path: `${outDir}/27-undo.png` });

await page.keyboard.press('Control+Shift+z');
await page.waitForTimeout(200);
check(await page.evaluate(() => window.gardenStore.getState().plants.length === 0), 'redo clears it again');
await page.keyboard.press('Control+z');
await page.waitForTimeout(200);

// Eye height changes what you can see over.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.clearPlants();
  s.addPlant('taxus-baccata', { x: 7, y: 6.5 });
  const st = window.gardenStore.getState();
  st.select(null);
  st.setStageView('panorama');
  st.moveObserver({ x: 7, y: 9 });
  st.setHeading(0);
  st.setPitch(0);
  st.setTime({ doy: 196, hour: 13, year: 20 });
});
await page.waitForTimeout(300);

for (const [h, label] of [[1.12, 'child'], [1.78, 'tall-adult']]) {
  await page.evaluate((v) => window.gardenStore.getState().setEyeHeight(v), h);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${outDir}/25-eye-${label}.png` });
}
const child = await page.evaluate(() => { window.gardenStore.getState().setEyeHeight(1.12); return window.gardenStore.getState().observer.eyeHeight; });
await page.waitForTimeout(150);
const lowShot = await page.locator('.panorama-canvas').screenshot();
await page.evaluate(() => window.gardenStore.getState().setEyeHeight(1.78));
await page.waitForTimeout(200);
const highShot = await page.locator('.panorama-canvas').screenshot();
check(!lowShot.equals(highShot), 'eye height changes the picture', `${child} m vs 1.78 m`);

await page.evaluate(() => window.gardenStore.getState().setGroundHeight(2.8));
await page.waitForTimeout(220);
const raised = await page.evaluate(() => {
  const o = window.gardenStore.getState().observer;
  return o.eyeHeight + o.groundHeight;
});
check(Math.abs(raised - 4.58) < 0.01, 'standing on something adds to eye height', `${raised.toFixed(2)} m`);
await page.screenshot({ path: `${outDir}/26-eye-upstairs-window.png` });

check(await page.evaluate(() => window.gardenStore.getState().setEyeHeight(99) || window.gardenStore.getState().observer.eyeHeight === 3), 'eye height is clamped to something human');

// A selected control must stay readable under the cursor. The generic hover
// rule once outranked the selected state and painted accent-on-accent, which
// blanked every active chip and tab the moment the pointer crossed it — and was
// invisible in any screenshot taken with the pointer elsewhere.
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  s.setStageView('elevation');
});
await page.waitForTimeout(150);
const selectedControls = await page.locator('.chip.on, .stage-tabs button.on').all();
let unreadable = 0;
for (const control of selectedControls) {
  await control.hover();
  const same = await control.evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.color === cs.backgroundColor;
  });
  if (same) unreadable += 1;
}
check(
  unreadable === 0,
  'selected controls stay readable while hovered',
  `${selectedControls.length} checked`,
);

check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));
await browser.close();
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall editing checks passed');
