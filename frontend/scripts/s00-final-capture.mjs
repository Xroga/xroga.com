// Final S00 screenshot set, taken from the production route against a local dev server
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
  // scene starts on the first pass: saas 1000, qa 6600, clinic 14100, research 19200, platforms 25400, cleanup 31000, growth 36800
  ['01-1440-saas-build', 1440, 900, { at: 5900 }],
  ['02-1440-saas-provider-call-stripe', 1440, 900, { at: 4400, age: 520 }],
  ['03-1440-qa-failure', 1440, 900, { at: 9100 }],
  ['04-1440-qa-corrected-release', 1440, 900, { at: 13900 }],
  ['05-1440-dental-calendar-active', 1440, 900, { at: 16100, age: 520 }],
  ['06-1440-dental-crm-hubspot-active', 1440, 900, { at: 16800, age: 520 }],
  ['07-1440-dental-gmail-active', 1440, 900, { at: 17500, age: 520 }],
  ['08-1440-research-planning', 1440, 900, { at: 20600 }],
  ['09-1440-research-source-x-active', 1440, 900, { at: 21000, age: 450 }],
  ['10-1440-research-ranked-result', 1440, 900, { at: 25200 }],
  ['11-1440-cross-platform', 1440, 900, { at: 30700 }],
  ['12-1440-cleanup-dirty-data', 1440, 900, { at: 33300 }],
  ['13-1440-cleanup-plan', 1440, 900, { at: 34700 }],
  ['14-1440-cleanup-result', 1440, 900, { at: 36600 }],
  ['15-1440-growth', 1440, 900, { at: 42200 }],
  ['16-1440-bright-background-provider-readability', 1440, 900, { at: 16200, brightest: true }],
  ['17-1440-focused-command-bar', 1440, 900, { at: 34700, focus: 'Rebuild our onboarding flow and ship it behind a feature flag' }],
  ['18-1150x666', 1150, 666, { at: 25200 }],
  ['19-768x1024', 768, 1024, { at: 34700 }],
  ['20-390x844', 390, 844, { at: 16800 }],
  ['21-1440-reduced-motion', 1440, 900, { reduced: true }],
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
    routes: [...document.querySelectorAll('[data-signal="tool"], [data-signal="source"]')].map((g) => g.dataset.target),
    sources: [...document.querySelectorAll('[data-source][data-active]')].map((e) => e.dataset.source),
    phrase: document.querySelector('h1')?.parentElement?.nextElementSibling?.textContent,
    hscroll: document.documentElement.scrollWidth - innerWidth,
  }));
  console.log(name, JSON.stringify(info));
  await ctx.close();
}
await b.close();
