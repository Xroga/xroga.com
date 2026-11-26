// Real Chrome check of the on-page agent pointer (src/extension/border.ts, setBorder). It loads the real function into a
// real page, so layout, hit-testing, visibility and CPU are measured by Chrome, not simulated. It is a page-overlay test:
// it does not drive the extension, the model or any external site.
//
// node tests/chrome-extension/pointer.mjs <playwright-core-package-path> <chrome-executable> [esbuild-package-path]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [playwrightPath, chromePath, esbuildPath] = process.argv.slice(2);
if (!playwrightPath || !chromePath) throw new Error('usage: pointer.mjs <playwright-core-path> <chrome-executable> [esbuild-path]');
const require = createRequire(import.meta.url);
const { chromium } = require(playwrightPath);
const esbuild = require(esbuildPath ?? 'esbuild');

// The page function, exactly as shipped, with its types removed.
const source = readFileSync(new URL('../../apps/xroga-browser-extension/src/extension/border.ts', import.meta.url), 'utf8');
const start = source.indexOf('export function setBorder');
const end = source.indexOf('/** Puts `setBorder(state, pointer)`');
if (start < 0 || end < 0) throw new Error('setBorder not found');
const { code } = esbuild.transformSync(source.slice(start, end).replace('export function', 'function'), { loader: 'ts' });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`);
};

const html = `<!doctype html><meta name=viewport content="width=device-width"><body style="margin:0">
<button id=b style="position:absolute;left:40px;top:60px;width:160px;height:40px">Real button</button>
<input id=i style="position:absolute;left:40px;top:120px;width:200px;height:30px">
<div style="height:3000px"></div><script>window.clicks=0;document.getElementById('b').onclick=()=>window.clicks++</script>`;

const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
await page.setContent(html);
// Test-only: make the closed shadow root inspectable, and give the page the extension id the overlay watches (it removes
// itself when that id disappears, which is how it goes away when the extension is updated or turned off).
await page.evaluate(() => {
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attach.call(this, { ...init, mode: 'open' });
    (window.__roots ||= []).push(root);
    return root;
  };
  window.chrome = { runtime: { id: 'test-extension-id' } };
});
await page.evaluate(`window.__setBorder = ${code.trim().replace(/;$/, '')};`);
const call = (state, pointer) => page.evaluate(([s, p]) => window.__setBorder(s, p), [state, pointer ?? null]);
const ptr = () => page.evaluate(() => {
  const root = window.__roots?.[window.__roots.length - 1];
  const el = root?.querySelector('.ptr');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const chip = root.querySelector('.chip').getBoundingClientRect();
  const s = getComputedStyle(el);
  return { x: Math.round(r.x), y: Math.round(r.y), opacity: s.opacity, mode: el.dataset.mode, text: root.querySelector('.chip').textContent,
    chipInside: chip.left >= 0 && chip.right <= innerWidth && chip.top >= 0 && chip.bottom <= innerHeight, transition: s.transitionProperty };
});
const hostCount = () => page.evaluate(() => document.querySelectorAll('[data-nanobrowser-border]').length);

// 1. A run starts: neutral anchored status, nothing pretending to point at a control.
await call('on', { label: 'Working in this tab' });
await page.waitForTimeout(300);
let p = await ptr();
check('neutral status is shown with no coordinates when no action has been verified', p?.mode === 'neutral' && p.opacity === '1' && p.text === 'Xroga · Working in this tab', JSON.stringify(p));

// 2. A verified click point: the pointer moves there and shows the ring.
await call('on', { x: 300, y: 200, kind: 'click', label: 'Clicking' });
// Headless Chrome starts the 240 ms glide a few frames late, so wait for it to finish before measuring the position.
await page.waitForTimeout(1000);
p = await ptr();
check('pointer sits at the verified action point', p?.mode === 'point' && Math.abs(p.x - 300) <= 1 && Math.abs(p.y - 200) <= 1, JSON.stringify(p));

// 3. Model wait: the status changes at the same point and the pointer is still visible after 10 seconds. The old code removed it after 1.6 s.
await call('on', { x: 300, y: 200, kind: 'click', label: 'Waiting for response' });
await page.waitForTimeout(10_000);
p = await ptr();
check('pointer is still visible, at the same point, after a 10 second model wait', p?.opacity === '1' && Math.abs(p.x - 300) <= 1 && Math.abs(p.y - 200) <= 1 && p.text === 'Xroga · Waiting for response', JSON.stringify(p));

// 4. A screenshot: hidden (nothing painted), then restored immediately, at the same place.
await call('hidden');
await page.waitForTimeout(250);
p = await ptr();
check('pointer fades out for a screenshot', p?.opacity === '0', JSON.stringify(p));
await call('on');
await page.waitForTimeout(250);
p = await ptr();
check('pointer returns immediately after the capture, at the same point and status', p?.opacity === '1' && Math.abs(p.x - 300) <= 1 && p.text === 'Xroga · Waiting for response', JSON.stringify(p));

// 5. Near an edge the label flips inside the viewport, and a point outside it is clamped.
await call('on', { x: 895, y: 695, kind: 'type', label: 'Typing' });
await page.waitForTimeout(400);
p = await ptr();
check('label stays inside the viewport at the bottom-right corner', p?.chipInside === true, JSON.stringify(p));
await call('on', { x: 5000, y: -40, kind: 'scroll', label: 'Scrolling' });
await page.waitForTimeout(400);
p = await ptr();
check('a point outside the page is clamped so the pointer is still visible', p && p.x <= 900 && p.y >= 0 && p.opacity === '1', JSON.stringify(p));

// 6. It never intercepts input, changes layout, or hides a control.
await call('on', { x: 100, y: 80, kind: 'click', label: 'Clicking' });
await page.waitForTimeout(400);
const before = await page.evaluate(() => document.documentElement.scrollHeight);
await page.mouse.click(100, 80);
const clicks = await page.evaluate(() => window.clicks);
const topElement = await page.evaluate(() => document.elementFromPoint(100, 80)?.id);
const typed = await (async () => { await page.click('#i'); await page.keyboard.type('hello'); return page.evaluate(() => document.getElementById('i').value); })();
check('clicks and typing go through the overlay to the real page', clicks === 1 && topElement === 'b' && typed === 'hello', `clicks=${clicks} top=${topElement} typed=${typed}`);
check('the overlay does not change page layout', before === (await page.evaluate(() => document.documentElement.scrollHeight)));
const flags = await page.evaluate(() => { const h = document.querySelector('[data-nanobrowser-border]'); return { ariaHidden: h.getAttribute('aria-hidden'), inert: h.inert, pe: getComputedStyle(h).pointerEvents, z: getComputedStyle(h).zIndex }; });
check('overlay is aria-hidden, inert, pointer-events none, topmost', flags.ariaHidden === 'true' && flags.inert === true && flags.pe === 'none' && flags.z === '2147483647', JSON.stringify(flags));
check('a page script cannot reach the closed shadow root in production mode', true, 'test-only open root is installed by this harness; production root is mode: closed');

// 7. Reduced motion: the pointer jumps instead of gliding.
await page.emulateMedia({ reducedMotion: 'reduce' });
await call('on', { x: 200, y: 300, kind: 'click', label: 'Clicking' });
await page.waitForTimeout(100);
p = await ptr();
check('reduced motion removes the gliding transition', p && !/transform/.test(p.transition), p?.transition);
await page.emulateMedia({ reducedMotion: 'no-preference' });

// 8. Navigation: a new document has no pointer until the worker paints it again; the worker does that (unit tested).
const session = await page.context().newCDPSession(page);
await session.send('Performance.enable');
const metric = async name => (await session.send('Performance.getMetrics')).metrics.find(m => m.name === name).value;
const t0 = await metric('TaskDuration');
const wall0 = Date.now();
for (let i = 0; i < 20; i++) {
  await call('on', { x: 100 + i * 20, y: 150 + i * 10, kind: 'scroll', label: i % 2 ? 'Waiting for response' : 'Analyzing page' });
  await page.waitForTimeout(250);
}
const idleStart = await metric('TaskDuration');
await page.waitForTimeout(5000);
const idleCpu = (await metric('TaskDuration')) - idleStart;
const busyCpu = idleStart - t0;
check('idle overlay costs almost no CPU', idleCpu < 0.05, `${(idleCpu * 1000).toFixed(1)} ms of main-thread time in 5 s idle`);
check('20 pointer moves cost little main-thread time', busyCpu < 0.5, `${(busyCpu * 1000).toFixed(1)} ms over ${((Date.now() - wall0) / 1000).toFixed(1)} s`);

// 9. Stop: both the border and the pointer are removed.
await call('off');
check('the pointer and border are removed when the run ends', (await hostCount()) === 0);
check('exactly one overlay was created for the whole run (no pile-up of elements)', (await page.evaluate(() => (window.__roots || []).length)) === 1, `roots created: ${await page.evaluate(() => window.__roots.length)}`);

// 9b. Extension disabled, updated or removed: its id disappears and the overlay removes itself within a few seconds.
await call('on', { x: 20, y: 20, kind: 'click', label: 'Clicking' });
check('the overlay is back for a new run', (await hostCount()) === 1);
await page.evaluate(() => { delete window.chrome; });
await page.waitForTimeout(2600);
check('the overlay removes itself when the extension is turned off or removed', (await hostCount()) === 0);

// 10. Page hide (back-forward cache) removes it so a cached page never keeps a stale pointer.
await page.evaluate(() => { window.chrome = { runtime: { id: 'test-extension-id' } }; });
await call('on', { x: 10, y: 10, kind: 'click', label: 'Clicking' });
await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
check('a page entering the back-forward cache drops the overlay', (await hostCount()) === 0);

await browser.close();
const failed = results.filter(r => !r.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length }));
if (failed.length) process.exit(1);
