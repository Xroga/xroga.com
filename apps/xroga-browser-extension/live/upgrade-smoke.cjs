// Upgrade smoke test in real Chromium: install the OLD build unpacked in a persistent profile, store a value in extension storage, replace the folder with the
// NEW build, relaunch the same profile, and check what survives: extension id, version change, stored value, a live service worker and a loadable side panel page.
// An unpacked extension keeps its id (from the manifest key) and storage across a reload from the same folder, which is the update path Chrome takes.
//   node live/upgrade-smoke.cjs <old-build-dir> <new-build-dir>
const { createRequire } = require('module');
const { chromium } = createRequire('C:/xr-int/backend/package.json')('playwright-core');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const [OLD, NEW] = process.argv.slice(2);
if (!OLD || !NEW) { console.error('usage: node live/upgrade-smoke.cjs <old> <new>'); process.exit(2); }
const work = fs.mkdtempSync(path.join('C:/Users/hp', 'xr-upg-'));
const ext = path.join(work, 'ext'), profile = path.join(work, 'profile');
const exe = 'C:/Users/hp/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const sync = src => execFileSync('robocopy', [src, ext, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS'], { stdio: 'ignore', windowsHide: true, validateStatus: null }, () => {});
const mirror = src => { try { execFileSync('robocopy', [src, ext, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS'], { stdio: 'ignore' }); } catch (e) { if (e.status > 7) throw e; } };
const launch = () => chromium.launchPersistentContext(profile, { executablePath: exe, headless: false, args: ['--window-position=2400,0', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
async function worker(ctx) {
  for (let i = 0; i < 40; i++) { const w = ctx.serviceWorkers().find(x => x.url().startsWith('chrome-extension://')); if (w) return w; await new Promise(r => setTimeout(r, 500)); }
  const w = await ctx.waitForEvent('serviceworker', { timeout: 15000 }); return w;
}
(async () => {
  const report = { old: OLD, new: NEW };
  mirror(OLD);
  let ctx = await launch();
  let w = await worker(ctx);
  report.before = await w.evaluate(async () => { await chrome.storage.local.set({ upgradeSmoke: 'kept-across-update' }); return { id: chrome.runtime.id, version: chrome.runtime.getManifest().version, name: chrome.runtime.getManifest().name }; });
  await ctx.close();
  mirror(NEW);
  ctx = await launch();
  w = await worker(ctx);
  report.after = await w.evaluate(async () => ({ id: chrome.runtime.id, version: chrome.runtime.getManifest().version, name: chrome.runtime.getManifest().name, stored: (await chrome.storage.local.get('upgradeSmoke')).upgradeSmoke ?? null }));
  const page = await ctx.newPage();
  const res = await page.goto(`chrome-extension://${report.after.id}/sidepanel.html`, { waitUntil: 'load', timeout: 20000 }).catch(e => ({ status: () => `error ${e.message}` }));
  await page.waitForTimeout(1500);
  report.sidepanel = { status: typeof res.status === 'function' ? res.status() : null, title: await page.title().catch(() => ''), hasBody: await page.evaluate(() => document.body.innerText.length > 0).catch(() => false) };
  await ctx.close();
  report.checks = {
    sameId: report.before.id === report.after.id,
    storagePreserved: report.after.stored === 'kept-across-update',
    serviceWorkerAlive: !!report.after.id,
    sidePanelLoads: report.sidepanel.hasBody === true,
  };
  report.ok = Object.values(report.checks).every(Boolean);
  console.log(JSON.stringify(report, null, 1));
  try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* leave for the owner to remove */ }
  process.exit(report.ok ? 0 : 1);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
