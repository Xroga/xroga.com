// Two accounts on one Chrome profile, with the real extension and the staging backend: User A signs in and works, signs out, User B signs in and
// works, signs out, User A signs in again. After every step it reads what each account can see: conversations (the local databases), the
// profile-level extension storage (mode, site rules, workflow hints, timings, worker jobs) and what the server returns for the account
// (connected apps, tool catalogue, permission modes). It reports every value that is the same for both accounts and that one of them set.
//
//   XR_JWT_A / XR_ACCOUNT_A / XR_JWT_B / XR_ACCOUNT_B ... node fixtures/two-accounts-product.mjs [--port 9343] [--headful]
//
// Needs the product autorun build (.output/autorun-product, staging values), like sw-kill-restart-product.mjs.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { autorunEvents, queueAutorunJob, startServer } from './server.mjs';
import { findChrome } from './find-chrome.mjs';

const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const opt = n => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const CDP_PORT = Number(opt('--port') ?? 9343);
const ACCOUNTS = {
  A: { jwt: process.env.XR_JWT_A, id: process.env.XR_ACCOUNT_A, title: 'Open example.com and tell me its heading (account A task)' },
  B: { jwt: process.env.XR_JWT_B, id: process.env.XR_ACCOUNT_B, title: 'Open iana.org and tell me its title (account B task)' },
};
if (!ACCOUNTS.A.jwt || !ACCOUNTS.B.jwt || !ACCOUNTS.A.id || !ACCOUNTS.B.id) {
  console.error('XR_JWT_A, XR_ACCOUNT_A, XR_JWT_B and XR_ACCOUNT_B are required');
  process.exit(2);
}
const log = m => console.error(new Date().toISOString().slice(11, 19), m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Cdp {
  #id = 0;
  #pending = new Map();
  constructor(ws) {
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = this.#pending.get(m.id);
        this.#pending.delete(m.id);
        if (m.error) p?.reject(new Error(m.error.message));
        else p?.resolve(m.result);
      }
    };
    this.ws = ws;
  }
  static async connect(port) {
    const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = rej)));
    return new Cdp(ws);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
  }
}

async function main() {
  const server = await startServer();
  const profile = mkdtempSync(join(tmpdir(), 'nb3-twoacct-'));
  const outDir = join(root, '.output', 'autorun-product');
  const launch = () => spawn(
    findChrome(),
    [
      `--user-data-dir=${profile}`, `--load-extension=${outDir}`, `--disable-extensions-except=${outDir}`,
      `--remote-debugging-port=${CDP_PORT}`, '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      '--window-size=1280,900', ...(argv.includes('--headful') ? [] : ['--headless=new']), 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let chrome = launch();
  const report = { steps: {}, leaks: [], ok: false };
  try {
    let cdp;
    const connect = async () => { cdp = undefined; for (let i = 0; i < 60 && !cdp; i++) { await sleep(500); cdp = await Cdp.connect(CDP_PORT).catch(() => null); } if (!cdp) throw new Error('Chrome did not open its debugging port'); };
    // A hard restart of the browser on the same profile (a command-line extension does not survive chrome.runtime.reload in headless Chrome).
    const relaunch = async () => { spawnSync('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]); await sleep(6000); chrome = launch(); await connect(); };
    await connect();
    const targets = async () => (await cdp.send('Target.getTargets')).targetInfos;
    const attach = async targetId => (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    const evalIn = async (sid, expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const open = async url => {
      const { targetId } = await cdp.send('Target.createTarget', { url });
      await sleep(1500);
      return { targetId, sid: await attach(targetId) };
    };
    const findExt = async () => {
      for (let i = 0; i < 60; i++) {
        for (const t of (await targets()).filter(t => t.type === 'service_worker' && /chrome-extension:\/\/[a-p]{32}\/background\.js/.test(t.url))) {
          const sid = await attach(t.targetId);
          const perms = await evalIn(sid, 'JSON.stringify(chrome.runtime.getManifest().permissions||[])').catch(() => '[]');
          if (perms.includes('debugger')) return new URL(t.url).host;
        }
        // A reloaded extension's worker sleeps until something needs it: opening one of its pages wakes it.
        if (i % 4 === 3) await cdp.send('Target.createTarget', { url: 'chrome-extension://ogebkgkppocnjeojdbkiokcpeaenonop/options.html' }).catch(() => undefined);
        await sleep(500);
      }
      throw new Error('the extension service worker was not found: ' + JSON.stringify((await targets()).map(t => t.type + ' ' + t.url.slice(0, 70))));
    };
    let extId = await findExt();

    const enroll = async who => {
      queueAutorunJob({ checks: [{ name: 'real-model', args: { jwt: ACCOUNTS[who].jwt, account: ACCOUNTS[who].id, tasks: [] } }] });
      const waiting = new Promise(res => autorunEvents.once('report', res));
      // An autorun job is fetched when the extension's worker starts: restart the browser so that it starts now.
      await relaunch();
      const got = await Promise.race([waiting, sleep(150_000).then(() => null)]);
      extId = await findExt();
      const device = got?.reports?.[0]?.result?.device;
      if (!device?.verified) throw new Error(`the device did not enroll for ${who}: ${JSON.stringify(got?.reports?.[0]?.error ?? got)}`);
    };

    // What an account can see, read from inside the extension: no secrets are dumped (the device key is only named).
    const snapshot = async (label, operator) => {
      const out = await evalIn(operator.sid, `(async () => {
        const all = await chrome.storage.local.get(null);
        const keys = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, JSON.stringify(v ?? null).length]));
        const settings = all['nb.settings'] ?? {};
        const dbs = [];
        for (const d of await indexedDB.databases()) {
          if (!/nanobrowser/.test(d.name)) continue;
          const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
          const titles = db.objectStoreNames.contains('conversations') ? await new Promise(res => { const g = db.transaction('conversations').objectStore('conversations').getAll(); g.onsuccess = () => res(g.result.map(c => c.title)); }) : [];
          dbs.push({ name: d.name, conversations: titles }); db.close();
        }
        const ask = async (m) => { try { return await chrome.runtime.sendMessage(m); } catch (e) { return { error: String(e) }; } };
        const plugins = {
          connected: await ask({ type: 'xroga.browser.plugins.v1', op: 'connected' }),
          permission: await ask({ type: 'xroga.browser.plugins.v1', op: 'permission' }),
          gmail: await ask({ type: 'xroga.browser.plugins.v1', op: 'permission', toolkit: 'gmail' }),
          catalog: await ask({ type: 'xroga.browser.plugins.v1', op: 'catalog', search: 'mail' }),
        };
        const cat = plugins.catalog; plugins.catalog = Array.isArray(cat?.items) ? cat.items.slice(0, 8).map(i => i.slug ?? i.name) : cat;
        return JSON.stringify({ defaultMode: settings.defaultMode, siteRules: all['nb.siteRules'] ?? {}, storageKeys: keys,
          activeDb: (() => { const o = all['xroga-browser-account']; return typeof o !== 'string' ? 'nanobrowser-signed-out' : (!all['xroga-browser-device-profile'] || all['xroga-browser-device-profile'] === o ? 'nanobrowser' : 'nanobrowser-' + o); })(),
          hints: all['xroga_hints_v1'] ?? null, workerJobs: Object.keys(all['xroga_parallel_jobs_v1'] ?? {}), perfEntries: (all['xroga_perf_v1'] ?? []).length, dbs, plugins });
      })()`).then(JSON.parse);
      report.steps['state ' + label] = out;
      report.steps['titles ' + label] = out.dbs.filter(d => d.name === out.activeDb).flatMap(d => d.conversations);
      return out;
    };

    const work = async who => {
      const operator = await open(`chrome-extension://${extId}/options.html`);
      const page = await open('https://example.com/');
      await sleep(2500);
      const tabs = JSON.parse(await evalIn(operator.sid, `chrome.tabs.query({}).then(t => JSON.stringify(t.map(x => ({ id: x.id, url: x.url }))))`));
      const pageTab = tabs.find(t => t.url.startsWith('https://example.com'));
      const panelTarget = await open(`chrome-extension://${extId}/sidepanel.html#tab=${pageTab.id}`);
      const panelOp = (op, extra = {}) => evalIn(operator.sid, `chrome.runtime.sendMessage(${JSON.stringify({ nbTest: 'panel', tabId: pageTab.id, op, ...extra })})`);
      return { operator, page, panelTarget, panelOp };
    };
    const runTask = async (h, text) => {
      await h.panelOp('type-send', { text });
      for (let i = 0, quiet = 0; i < 150 && quiet < 4; i++) {
        await sleep(1000);
        const r = await h.panelOp('read').catch(() => null);
        if (/\nAllow\n/.test(String(r?.body ?? ''))) await h.panelOp('click', { label: 'Allow' }).catch(() => undefined);
        quiet = /is working/.test(String(r?.body ?? '')) ? 0 : quiet + 1;
      }
    };
    const closeAll = async h => { for (const t of [h.panelTarget, h.page, h.operator]) await cdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => undefined); };
    const signOut = async h => {
      report.steps.signOutReply = await evalIn(h.panelTarget.sid, `chrome.runtime.sendMessage({ type: 'xroga.browser.sign-out.v1' })`).catch(e => String(e));
      // The product reloads the extension at sign-out; the browser is restarted so that the check does not depend on that reload surviving.
      await sleep(3000);
      await relaunch();
      extId = await findExt();
    };

    // ---- Account A signs in and works.
    log('enroll A');
    await enroll('A');
    log('A enrolled');
    let h = await work('A');
    await snapshot('A before it did anything', h.panelTarget);
    await evalIn(h.panelTarget.sid, `(async () => { const s = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {};
      await chrome.storage.local.set({ 'nb.settings': { ...s, defaultMode: 'auto' }, 'nb.siteRules': { 'a-only.example': { rule: 'allow', setAt: new Date().toISOString() } } });
      const m = t => chrome.runtime.sendMessage(t);
      await m({ type: 'xroga.browser.plugins.v1', op: 'setPermission', mode: 'full_access' });
      await m({ type: 'xroga.browser.plugins.v1', op: 'setPermission', toolkit: 'gmail', mode: 'read_only' });
      return true; })()`);
    log('A task');
    await runTask(h, ACCOUNTS.A.title);
    log('A task done');
    const a1 = await snapshot('A after working', h.panelTarget);
    log('sign out A');
    await signOut(h);
    log('signed out');
    // ---- Signed out.
    h = await work('none');
    await snapshot('signed out', h.panelTarget);
    await closeAll(h);
    // ---- Account B signs in.
    log('enroll B');
    await enroll('B');
    h = await work('B');
    const b0 = await snapshot('B right after signing in', h.panelTarget);
    await runTask(h, ACCOUNTS.B.title);
    await evalIn(h.panelTarget.sid, `(async () => { await chrome.runtime.sendMessage({ type: 'xroga.browser.plugins.v1', op: 'setPermission', toolkit: 'gmail', mode: 'always_ask' }); return true; })()`);
    const b1 = await snapshot('B after working', h.panelTarget);
    await signOut(h);
    // ---- Account A again.
    log('enroll A again');
    await enroll('A');
    h = await work('A');
    const a2 = await snapshot('A signed in again', h.panelTarget);
    await closeAll(h);

    // ---- Verdicts.
    // Only the account's own database counts: the other account's database exists in the profile but is not opened for this account.
    const titles = s => s.dbs.filter(d => d.name === s.activeDb).flatMap(d => d.conversations);
    const leak = (what, detail) => report.leaks.push({ what, detail });
    if (titles(b0).some(t => /account A/.test(t))) leak('B sees A\'s conversation right after signing in', titles(b0));
    if (titles(b1).some(t => /account A/.test(t))) leak('B sees A\'s conversation after working', titles(b1));
    if (titles(a2).some(t => /account B/.test(t))) leak('A sees B\'s conversation after signing in again', titles(a2));
    if (!titles(a2).some(t => /account A/.test(t))) leak('A lost its own conversation', titles(a2));
    if (b0.defaultMode === 'auto') leak('B starts with the permission mode A chose (auto)', b0.defaultMode);
    if (JSON.stringify(b0.siteRules).includes('a-only.example')) leak('B inherits A\'s site rule', b0.siteRules);
    if (b0.hints && JSON.stringify(b0.hints).length > 2) leak('B inherits workflow hints learned from A\'s work', Object.keys(b0.hints ?? {}));
    if (b0.perfEntries > 0 && a1.perfEntries > 0) leak('B inherits A\'s run timings', b0.perfEntries);
    const perm = s => JSON.stringify(s.plugins.permission);
    if (perm(b0) === perm(a1) && /full_access/.test(perm(a1))) leak('B has the account-wide mode A set (full_access)', perm(b0));
    if (JSON.stringify(b0.plugins.gmail) === JSON.stringify(a1.plugins.gmail) && /read_only/.test(JSON.stringify(a1.plugins.gmail))) leak('B has the Gmail mode A set', b0.plugins.gmail);
    if (JSON.stringify(a2.plugins.gmail) !== JSON.stringify(a1.plugins.gmail)) leak('A\'s Gmail mode changed while B was signed in', { before: a1.plugins.gmail, after: a2.plugins.gmail });
    if (JSON.stringify(a2.plugins.connected) !== JSON.stringify(a1.plugins.connected)) leak('A\'s connected apps changed while B was signed in', {});
    if (JSON.stringify(b1.plugins.connected) !== JSON.stringify(b0.plugins.connected) && JSON.stringify(b1.plugins.connected) === JSON.stringify(a1.plugins.connected)) leak('B shows A\'s connected apps', {});
    report.ok = report.leaks.length === 0;
  } catch (error) {
    report.error = String(error?.stack ?? error);
  } finally {
    chrome.kill();
    spawnSync('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
    await sleep(500);
    server.close();
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temporary */ }
  }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
}
main();
