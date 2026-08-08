import { chromium } from 'playwright';
const file = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
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
  await page.screenshot({ path: `/tmp/claude-0/-home-user-proto-garden-designer/ef2f318f-8222-51b3-900b-0e787fb0cb36/scratchpad/narrow-${label}.png`, fullPage: label === 'tablet-portrait' });
  console.log(`${label} ${w}x${h}: scrollW=${m.scrollW} clientW=${m.clientW} -> ${m.scrollW > m.clientW ? 'SIDEWAYS SCROLL' : 'ok'}`);
  await page.close();
}
await browser.close();
