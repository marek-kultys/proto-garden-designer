import { chromium } from 'playwright';
const file = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`file://${file}`);
await page.waitForFunction(() => Boolean(window.gardenStore), { timeout: 15000 });
await page.evaluate(() => {
  const s = window.gardenStore.getState();
  for (const [id, x, y] of [
    ['betula-jacquemontii', 3.5, 3.0], ['amelanchier-lamarckii', 10.5, 2.6],
    ['acer-osakazuki', 7.0, 7.6], ['taxus-baccata', 12.6, 5.2], ['taxus-baccata', 12.6, 6.4],
    ['hydrangea-limelight', 2.2, 6.4], ['lavandula-hidcote', 5.4, 5.1],
    ['calamagrostis-karl-foerster', 8.6, 4.6], ['hosta-halcyon', 4.4, 4.6],
    ['verbena-bonariensis', 6.6, 2.6], ['geranium-rozanne', 9.8, 6.2],
  ]) s.addPlant(id, { x, y });
  s.select(null);
  s.setTime({ doy: 200, hour: 17, year: 8 });
});
await page.waitForTimeout(400);
await page.screenshot({ path: process.argv[3] });
const box = await page.evaluate(() => {
  const el = document.querySelector('.app');
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
});
await browser.close();
console.log('layout:', box);
console.log('horizontal overflow:', box.scrollW > box.clientW ? 'YES — problem' : 'none');
console.log('errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
