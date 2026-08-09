/**
 * Phone checks, aimed squarely at the bug this layout exists to fix.
 *
 * Published as an artifact the page sits inside a sheet in a host app, and a
 * swipe that runs past the end of the document chains up to that host and
 * dismisses it. The page closing under you mid-gesture is indistinguishable
 * from the app crashing. So the assertions here are not about looks: the
 * document must not be scrollable at all, and scroll chaining must be severed.
 *
 *   node scripts/check-mobile.mjs [url] [outDir]
 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:4173';
const outDir = process.argv[3] ?? 'screenshots';
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

for (const name of ['iPhone 13 Mini', 'iPhone 15 Pro Max']) {
  const profile = devices[name];
  console.log(`\n${name} (${profile.viewport.width}×${profile.viewport.height})`);

  const context = await browser.newContext({ ...profile });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.gardenStore));

  await page.evaluate(() => {
    const s = window.gardenStore.getState();
    for (const [id, x, y] of [
      ['eucalyptus-gunnii', 3, 3],
      ['magnolia-soulangeana', 9, 3],
      ['allium-purple-sensation', 6, 5],
      ['cosmos-bipinnatus', 8, 6],
      ['cornus-midwinter-fire', 11, 7],
    ]) s.addPlant(id, { x, y });
    s.select(null);
    s.setTime({ doy: 200, hour: 15, year: 6 });
  });
  await page.waitForTimeout(350);

  const metrics = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    const style = getComputedStyle(document.documentElement);
    return {
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overscroll: style.overscrollBehaviorY,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });

  check(
    metrics.scrollHeight <= metrics.clientHeight + 1,
    'document does not scroll vertically',
    `${metrics.scrollHeight} vs ${metrics.clientHeight}`,
  );
  check(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    'document does not scroll horizontally',
    `${metrics.scrollWidth} vs ${metrics.clientWidth}`,
  );
  check(metrics.overscroll === 'none', 'overscroll chaining is severed', metrics.overscroll);

  // Even if something later makes the document taller, a scroll attempt must
  // not move it.
  const moved = await page.evaluate(() => {
    window.scrollTo(0, 800);
    const y = window.scrollY;
    window.scrollTo(0, 0);
    return y;
  });
  check(moved === 0, 'a scroll attempt moves nothing', `scrollY=${moved}`);

  await page.screenshot({ path: `${outDir}/mobile-${name.replace(/\W+/g, '-')}-canvas.png` });

  // The plants sheet: opens, scrolls inside itself, and places on tap.
  await page.getByRole('button', { name: /^Plants/ }).click();
  await page.waitForTimeout(320);
  const sheetOpen = await page.evaluate(() => {
    const lib = document.querySelector('.library');
    return lib.getBoundingClientRect().top < window.innerHeight - 100;
  });
  check(sheetOpen, 'plants sheet opens over the canvas');
  await page.screenshot({ path: `${outDir}/mobile-${name.replace(/\W+/g, '-')}-plants.png` });

  const contained = await page.evaluate(
    () => getComputedStyle(document.querySelector('.library')).overscrollBehaviorY,
  );
  check(contained === 'contain' || contained === 'none', 'sheet contains its own scrolling', contained);

  const before = await page.evaluate(() => window.gardenStore.getState().plants.length);
  await page.locator('.card').first().tap();
  await page.waitForTimeout(320);
  const after = await page.evaluate(() => window.gardenStore.getState().plants.length);
  const closed = await page.evaluate(() => document.querySelector('.app').dataset.sheet === 'none');
  check(after === before + 1, 'tapping a plant places it', `${before} → ${after}`);
  check(closed, 'placing from the sheet closes it');

  await page.getByRole('button', { name: 'Site' }).click();
  await page.waitForTimeout(320);
  await page.screenshot({ path: `${outDir}/mobile-${name.replace(/\W+/g, '-')}-site.png` });

  check(errors.length === 0, 'no console errors', errors.slice(0, 2).join(' | '));
  await context.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall mobile checks passed');
