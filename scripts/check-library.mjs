/**
 * The library draws a plant's portrait only when its card comes near the
 * screen. Two things can go wrong with that, and neither shows up in a unit
 * test: the lookahead can stop working, so every portrait is drawn on load
 * again and the saving quietly disappears; or the lookahead can be too short,
 * so a fast scroll outruns it and you see empty boxes.
 *
 * This drags the library from top to bottom in sixty frames — about four
 * hundred pixels a frame, faster than any wheel or trackpad — and watches for
 * both.
 *
 *   node scripts/check-library.mjs [url] [cpuSlowdown]
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4173';
const slow = Number(process.argv[3] ?? 1);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

if (slow > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
  console.log(`  cpu throttled ${slow}x`);
}

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.gardenStore));
await page.waitForTimeout(900);

/** A portrait counts as drawn once the app has sized its canvas itself. */
const probe = `
  const SIZE = Math.round(56 * (window.devicePixelRatio || 1));
  const all = () => [...document.querySelectorAll('canvas.thumb')];
  const isDrawn = (c) => c.width === SIZE && c.height === SIZE;
  const onScreen = (c) => { const r = c.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight; };
`;

const atRest = await page.evaluate(`(() => {
  ${probe}
  const cards = all();
  return { total: cards.length, drawn: cards.filter(isDrawn).length };
})()`);

check(atRest.total > 100, 'the whole library is in the list', `${atRest.total} cards`);
check(
  atRest.drawn < atRest.total / 4,
  'only what is near the screen has been drawn',
  `${atRest.drawn} of ${atRest.total}`,
);

const scrolled = await page.evaluate(`(async () => {
  ${probe}
  const box = [...document.querySelectorAll('*')].find(
    (el) => el.scrollHeight > el.clientHeight + 400 && el.querySelector('canvas.thumb'),
  );
  if (!box) return { error: 'nothing scrolls' };
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const steps = 60;
  let blankFrames = 0;
  let worst = 0;
  let run = 0;
  let longestRun = 0;
  for (let i = 1; i <= steps; i += 1) {
    box.scrollTop = (box.scrollHeight - box.clientHeight) * (i / steps);
    await frame();
    const blank = all().filter((c) => onScreen(c) && !isDrawn(c)).length;
    if (blank > 0) {
      blankFrames += 1;
      worst = Math.max(worst, blank);
      run += 1;
      longestRun = Math.max(longestRun, run);
    } else {
      run = 0;
    }
  }
  await frame();
  await frame();
  return {
    steps,
    blankFrames,
    worst,
    longestRun,
    leftBlank: all().filter((c) => onScreen(c) && !isDrawn(c)).length,
    drawn: all().filter(isDrawn).length,
    total: all().length,
  };
})()`);

check(scrolled.error === undefined, 'the library scrolls', scrolled.error ?? '');
/**
 * What is measured is a run, not a count.
 *
 * At this rate the lookahead gives the browser about two frames of warning, and
 * it occasionally spends one of them elsewhere — so a single blank frame, a
 * sixtieth of a second, turns up now and then and nobody could see it. A check
 * that failed on one would cry wolf, and a check that cries wolf gets ignored.
 * Two frames in a row is the point at which something was there to be seen, and
 * also the point at which the lookahead is genuinely too short: at any speed a
 * hand can produce it has five frames of warning or more.
 */
check(
  scrolled.longestRun < 2,
  'a fast scroll never outruns the drawing',
  `${scrolled.blankFrames} of ${scrolled.steps} frames blank, longest run ${scrolled.longestRun}${scrolled.worst ? `, worst ${scrolled.worst} at once` : ''}`,
);
check(scrolled.leftBlank === 0, 'nothing is left undrawn once it stops', `${scrolled.leftBlank}`);
check(
  scrolled.drawn === scrolled.total,
  'scrolling the whole way draws every portrait',
  `${scrolled.drawn} of ${scrolled.total}`,
);

check(errors.length === 0, 'no console or page errors', errors.slice(0, 2).join(' | '));

await browser.close();
console.log(
  failures.length === 0
    ? '\nall library checks passed'
    : `\n${failures.length} failed: ${failures.join(', ')}`,
);
process.exit(failures.length === 0 ? 0 : 1);
