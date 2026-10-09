// Final S00 screenshot set (V12 §36), taken from the production route against a local dev server
// (review parameters such as ?at= only work in development builds and under /lab/).
//   npm run dev:frontend   then   node frontend/scripts/s00-final-capture.mjs [prefix ...]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = new URL('../../docs/homepage-implementation/s00-final', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
// kind 'at': frozen frame; kind 'ev': live clock from `from`, shot `delay` ms after `sel` appears
const SHOTS = [
  ['01-1440-rest', 1440, 900, { at: 32500 }],
  ['02-1440-saas-build', 1440, 900, { at: 6600 }],
  ['03-1440-saas-provider-call-stripe', 1440, 900, { at: 4670, age: 520 }],
  ['04-1440-qa-failure', 1440, 900, { at: 14300 }],
  ['05-1440-qa-repair', 1440, 900, { at: 16350, age: 900 }],
  ['06-1440-dental-calendar-active', 1440, 900, { at: 24370, age: 520 }],
  ['07-1440-dental-crm-hubspot-active', 1440, 900, { at: 25270, age: 520 }],
  ['08-1440-cross-platform', 1440, 900, { at: 45400 }],
  ['09-1440-research-native-first', 1440, 900, { at: 52400 }],
  ['10-1440-growth', 1440, 900, { at: 62600 }],
  ['11-1440-active-rotator', 1440, 900, { at: 10700, age: 250, scope: 'span[data-leg]' }],
  ['12-1440-bright-background-provider-readability', 1440, 900, { at: 42000, brightest: true }],
  ['13-1440-focused-command-bar', 1440, 900, { at: 32500, focus: 'Rebuild our onboarding flow and ship it behind a feature flag' }],
  ['14-1150x666', 1150, 666, { at: 6600 }],
  ['15-768x1024', 768, 1024, { at: 6600 }],
  ['16-390x844', 390, 844, { at: 6600 }],
  ['17-1440-reduced-motion', 1440, 900, { reduced: true }],
];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox', '--ignore-gpu-blocklist'] });
for (const [name, w, h, o] of SHOTS) {
  if (only.length && !only.some((x) => name.startsWith(x))) continue;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: o.reduced ? 'reduce' : 'no-preference', hasTouch: w < 800 });
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const p = await ctx.newPage();
  const q = o.at !== undefined ? `at=${o.at}&bg=gl` : o.from !== undefined ? `from=${o.from}&bg=gl` : 'bg=gl';
  await p.goto(`http://localhost:3000/?${q}`, { timeout: 120000 });
  await p.waitForSelector(o.reduced ? '[data-clock="static"]' : '[data-clock="playing"]', { timeout: 120000 });
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  if (o.sel) { await p.waitForSelector(o.sel, { timeout: 40000 }); await p.waitForTimeout(o.delay); }
  else await p.waitForTimeout(o.wait ?? 3400);
  // freeze the signal (or phrase) animations at an exact age, so event frames are deterministic
  if (o.age !== undefined) {
    await p.evaluate(([age, scope]) => {
      document.querySelectorAll(scope).forEach((el) => el.getAnimations({ subtree: true }).forEach((a) => { a.pause(); a.currentTime = age; }));
    }, [o.age, o.scope ?? '[data-signal]']);
    await p.waitForTimeout(150);
  }
  if (o.brightest) {
    // worst case for readability: the cursor stirs the swell right behind the rack while the field crests
    const r = await p.evaluate(() => { const b = document.querySelector('[data-provider]').closest('[role=list]').getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i <= 24; i++) {
        const y = r[1] - 20 + ((r[3] - r[1] + 40) * i) / 24;
        await p.mouse.move(r[2] + 22 - (i % 2) * 8, y);
        await p.waitForTimeout(16);
      }
      await p.mouse.move((r[0] + r[2]) / 2, r[1] - 26, { steps: 8 });
    }
    await p.mouse.move(r[2] + 30, r[3] + 10, { steps: 4 });
    await p.waitForTimeout(120);
  }
  if (o.focus) { await p.click('#s00-command'); await p.keyboard.type(o.focus, { delay: 8 }); await p.waitForTimeout(400); }
  await p.screenshot({ path: `${OUT}/${name}.png` });
  const info = await p.evaluate(() => ({
    active: [...document.querySelectorAll('[data-provider][data-active]')].map((e) => e.dataset.provider),
    routes: [...document.querySelectorAll('[data-signal="tool"]')].map((g) => g.dataset.tool),
    phrase: document.querySelector('h1')?.parentElement?.nextElementSibling?.textContent,
    hscroll: document.documentElement.scrollWidth - innerWidth,
  }));
  console.log(name, JSON.stringify(info));
  await ctx.close();
}
await b.close();
