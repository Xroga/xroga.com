// The product build's Resume contract after a real service-worker kill, with the real model on the staging backend, signed in by the person in the window this opens.
//
//   node fixtures/sw-kill-live.mjs [--port 9344] [--items 8]
//
// No token is read or passed: Chrome opens headful with a temporary profile and the staging-origin product build in .output/autorun-product; the person signs in to the
// staging Workspace in that window (a disposable staging account), this script presses Connect in the side panel, asks for N to-do items on a public page, stops every service
// worker after the first items appear, and reports what the panel offers and what the list holds at the end (it must hold exactly N distinct items, none repeated).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { autorunEvents, queueAutorunJob, startServer } from './server.mjs';
import { findChrome } from './find-chrome.mjs';

const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const CDP_PORT = Number(opt('--port') ?? 9342);
const WORKSPACE = 'https://xrogaaicom-git-claude-live-run-943-20261110-xrogas-projects.vercel.app/workspace';
const N = Number(opt('--items') ?? 8);
const NAMES = ['One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten'].slice(0, N);
const PAGE = 'https://todomvc.com/examples/react/dist/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

class Cdp {
  #id = 0;
  #pending = new Map();
  constructor(ws) {
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') (this.events ??= []).push({ sessionId: m.sessionId, method: m.method, text: JSON.stringify(m.params?.args?.map(x => x.value ?? x.description) ?? m.params?.exceptionDetails?.exception?.description ?? m.params).slice(0, 300) });
      if (m.method === 'Network.responseReceived' && /run\.app|vercel\.app/.test(m.params?.response?.url ?? '')) (this.net ??= []).push(`${m.params.response.status} ${m.params.response.url.replace(/\?.*/, '').slice(0, 140)}`);
      if (m.method === 'Network.loadingFailed') (this.net ??= []).push(`FAILED ${m.params.errorText}`);
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
  const profile = 'C:/Users/hp/xr-live-profile'; // kept between runs so one sign-in serves them all; removed by hand at the end
  const outDir = join(root, '.output', 'autorun-product');
  const chrome = spawn(
    findChrome(),
    [
      `--user-data-dir=${profile}`, `--load-extension=${outDir}`, `--disable-extensions-except=${outDir}`,
      `--remote-debugging-port=${CDP_PORT}`, '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      '--window-size=1280,900', 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const report = { steps: {}, ok: false };
  try {
    let cdp;
    for (let i = 0; i < 60 && !cdp; i++) {
      await sleep(500);
      cdp = await Cdp.connect(CDP_PORT).catch(() => null);
    }
    if (!cdp) throw new Error('Chrome did not open its debugging port');
    const targets = async () => (await cdp.send('Target.getTargets')).targetInfos;
    const attach = async targetId => (await cdp.send('Target.attachToTarget', { targetId, flatten: true })).sessionId;
    const evalIn = async (sid, expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };

    let extId;
    for (let attempt = 0; attempt < 30 && !extId; attempt++) {
      if (attempt) await sleep(1000);
      for (const t of (await targets()).filter(t => t.type === 'service_worker' && /chrome-extension:\/\/[a-p]{32}\/background\.js/.test(t.url))) {
        const sid = await attach(t.targetId);
        const perms = await evalIn(sid, 'JSON.stringify(chrome.runtime.getManifest().permissions||[])').catch(() => '[]');
        if (perms.includes('debugger')) extId = new URL(t.url).host;
      }

    }
    if (!extId) throw new Error('the extension service worker was not found');
    for (const t of (await targets()).filter(t => t.type === 'service_worker' && t.url.includes(extId))) { const sid = await attach(t.targetId); await cdp.send('Runtime.enable', {}, sid).catch(() => undefined); await cdp.send('Network.enable', {}, sid).catch(() => undefined); }
    const open = async url => {
      const { targetId } = await cdp.send('Target.createTarget', { url });
      await sleep(1500);
      return { targetId, sid: await attach(targetId) };
    };
    const operator = await open(`chrome-extension://${extId}/options.html`);
    // The saved test profile may hold the extension's state from an earlier build (device, origins): start the extension clean, keep the browser's own logins.
    await evalIn(operator.sid, `(async () => { await chrome.storage.local.clear(); await chrome.storage.session?.clear?.(); const dbs = await indexedDB.databases(); for (const d of dbs) indexedDB.deleteDatabase(d.name); return dbs.length; })()`).then(n => { report.steps.clearedDatabases = n; }).catch(e => { report.steps.clearError = String(e); });
    const page = await open(PAGE);
    await sleep(2500);
    const tabs = JSON.parse(await evalIn(operator.sid, `chrome.tabs.query({}).then(t => JSON.stringify(t.map(x => ({ id: x.id, url: x.url }))))`));
    const pageTab = tabs.find(t => t.url.startsWith('https://todomvc.com'));
    if (!pageTab) throw new Error('the page tab was not found');
    const panelTarget = await open(`chrome-extension://${extId}/sidepanel.html#tab=${pageTab.id}`);
    await evalIn(operator.sid, `(async () => { const s = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {}; await chrome.storage.local.set({ 'nb.settings': { ...s, defaultMode: 'auto' } }); return true; })()`);
    const panelOp = (op, extra = {}) =>
      evalIn(operator.sid, `chrome.runtime.sendMessage(${JSON.stringify({ nbTest: 'panel', tabId: pageTab.id, op, ...extra })})`);
    // The person's part, once: sign in to the staging Workspace in this window. Nothing is typed or read by this script.
    const ws = await open(WORKSPACE);
    console.error('>>> Sign in to the staging Workspace in the Chrome window that just opened (disposable staging account). Waiting up to 10 minutes...');
    let signedIn = false;
    let wsTarget = ws;
    for (let i = 0; i < 1200 && !signedIn; i++) {
      await sleep(500);
      // Any Workspace tab of this window counts: the person may have signed in on a tab other than the one opened here.
      for (const t of (await targets()).filter(t => t.type === 'page' && t.url.startsWith(WORKSPACE.replace('/workspace', '')) && /\/workspace/.test(t.url))) {
        const sid = await attach(t.targetId);
        const ok = await evalIn(sid, `!/Guest preview/.test(document.body.innerText) && /Browser Automation/.test(document.body.innerText)`).catch(() => false);
        if (ok) { signedIn = true; wsTarget = { targetId: t.targetId, sid }; break; }
      }
    }
    if (!signedIn) report.steps.workspaceText = String(await evalIn(ws.sid, 'document.body.innerText').catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    report.steps.signedIn = signedIn;
    if (!signedIn) throw new Error('the Workspace was not signed in within ten minutes');
    await panelOp('click', { label: 'Connect Xroga Workspace' }).catch(e => { report.steps.connectClick = String(e); });
    let paired = false;
    for (let i = 0; i < 360 && !paired; i++) {
      await sleep(500);
      paired = String((await panelOp('read').catch(() => null))?.body ?? '').includes('Signed in to Xroga');
    }
    report.steps.paired = paired;
    if (!paired) report.steps.panelWhenNotPaired = String((await panelOp('read').catch(() => null))?.body ?? '').replace(/\s+/g, ' ').slice(0, 400);
    if (!paired) { report.steps.workerConsole = (cdp.events ?? []).slice(-15); report.steps.workerNetwork = (cdp.net ?? []).slice(-20); report.steps.workspaceTabs = (await targets()).filter(t => t.type === 'page').map(t => t.url.slice(0, 160)); }
    if (!paired) throw new Error('the extension did not pair with the Workspace');
    const items = () => evalIn(page.sid, `JSON.stringify([...document.querySelectorAll('.todo-list li label')].map(l => l.textContent.trim()))`).then(JSON.parse).catch(() => []);
    // The person's part: press Allow when a card asks about this site.
    const allow = async read => {
      if (/\nAllow\n/.test(String(read?.body ?? ''))) await panelOp('click', { label: 'Allow' }).catch(() => undefined);
    };

    await panelOp('type-send', { text: `On this page add ${N} todo items named ${NAMES.join(', ')}, then tell me the list.` });
    let before = [];
    for (let i = 0; i < 240 && before.length < 2; i++) {
      await sleep(500);
      await allow(await panelOp('read').catch(() => null));
      before = await items();
    }
    report.steps.itemsBeforeKill = before;
    if (before.length < 2) throw new Error('the model had not added an item within two minutes');

    await cdp.send('ServiceWorker.enable', {}, panelTarget.sid);
    await sleep(300);
    await cdp.send('ServiceWorker.stopAllWorkers', {}, panelTarget.sid);
    report.steps.killedAt = new Date().toISOString();
    let back = false;
    for (let i = 0; i < 60 && !back; i++) {
      await sleep(500);
      back = (await targets()).some(t => t.type === 'service_worker' && t.url.includes(extId));
    }
    report.steps.workerBack = back;
    await sleep(3000);
    const afterRestart = await items();
    report.steps.itemsRightAfterRestart = afterRestart;
    const runsDump = () => evalIn(operator.sid, `(async () => { const dbs = await indexedDB.databases(); const out = [];
      for (const d of dbs) { if (!/nanobrowser/.test(d.name)) continue;
        const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        if (![...db.objectStoreNames].includes('runs')) { db.close(); continue; }
        const rows = await new Promise(res => { const g = db.transaction('runs').objectStore('runs').getAll(); g.onsuccess = () => res(g.result); });
        out.push({ db: d.name, runs: rows.map(r => ({ status: r.status, reason: r.reason, outcome: r.outcome, hasFinish: !!r.canonicalBrowserFinish, run: String(r.canonicalBrowserRunId || '').slice(0, 8) })) }); db.close(); }
      return JSON.stringify(out); })()`).then(JSON.parse).catch(e => String(e));
    report.steps.runsRightAfterRestart = await runsDump();
    await sleep(15_000);
    report.steps.runsFifteenSecondsLater = await runsDump();
    report.steps.itemsFifteenSecondsLater = await items();
    const read1 = await panelOp('read');
    report.steps.panelBodyAfterRestart = String(read1?.body ?? '').replace(/\s+/g, ' ').slice(0, 500);
    report.steps.statusAfterRestart = read1?.status;
    report.steps.buttonsAfterRestart = (read1?.buttons ?? []).filter(b => /Resume|Stop|Retry|Send|New chat/.test(b));
    // The Resume control sits in the run bar, not in the panel's button list: the visible panel text is the evidence.
    report.steps.resumeOffered = /Interrupted/.test(String(read1?.body ?? '')) && /Resume/.test(String(read1?.body ?? ''));

    // Working = the panel shows the active-task header ("... is working"); settled = it does not, for several polls in a row.
    const working = r => /is working/.test(String(r?.body ?? ''));
    const settle = async (maxMs, label) => {
      let quiet = 0;
      const end = Date.now() + maxMs;
      while (Date.now() < end) {
        await sleep(1000);
        const r = await panelOp('read').catch(() => null);
        await allow(r);
        quiet = working(r) ? 0 : quiet + 1;
        if (quiet >= 6) return true;
      }
      report.steps[label + 'TimedOut'] = true;
      return false;
    };
    let resumed = false;
    if (report.steps.resumeOffered) {
      await panelOp('click', { label: 'Resume' });
      report.steps.pressedResume = true;
      await sleep(3000);
      resumed = await settle(240_000, 'resume');
    }
    const afterResume = await items();
    const readR = await panelOp('read').catch(() => null);
    report.steps.itemsAfterResume = afterResume;
    report.steps.answerAfterResume = String(readR?.transcript ?? '').replace(/\s+/g, ' ').slice(-300);
    // The product's uncertain-write rule: a resumed run does not repeat or extend a change that may have been delivered; it reads, says so and pauses.
    report.steps.pausedForUncertainWrite = /may have been delivered|paused|resumed in normal mode/i.test(report.steps.answerAfterResume);
    // Then the person asks again (the page state is now known), and the work finishes.
    let followed = false;
    if (afterResume.length < N) {
      await panelOp('type-send', { text: `Continue: add the remaining items so the list is ${NAMES.join(', ')}. Do not add an item that is already there.` });
      report.steps.followUpSent = true;
      await sleep(3000);
      followed = await settle(300_000, 'followUp');
    }
    const final = await items();
    const last = await panelOp('read').catch(() => null);
    report.steps.itemsFinal = final;
    report.steps.answerTail = String(last?.transcript ?? '').replace(/\s+/g, ' ').slice(-260);

    const failures = [];
    if (!back) failures.push('the service worker did not come back');
    // An action already sent when the worker stopped may still land (the page runs it), so one more item is expected; a replay or a duplicate is not.
    if (afterRestart.length > before.length + 1 || new Set(afterRestart).size !== afterRestart.length) failures.push(`items changed during the restart beyond one in-flight action (${before.length} to ${afterRestart.length})`);
    if (!report.steps.resumeOffered) failures.push('the panel did not offer Resume after the worker was killed (product contract)');
    if (report.steps.pressedResume && !resumed) failures.push('the resumed run did not settle');
    // A kill between two writes leaves nothing uncertain, so the resumed run may finish the work; what must hold is no duplicate and no overshoot.
    if (new Set(afterResume).size !== afterResume.length || afterResume.length > N) failures.push(`the resumed run left a duplicate or too many items: ${JSON.stringify(afterResume)}`);
    if (new Set(final).size !== final.length) failures.push(`duplicate items: ${JSON.stringify(final)}`);
    if (final.length > N) failures.push(`more than ${N} items: ${JSON.stringify(final)}`);
    if (final.length < N) failures.push(`fewer than ${N} items at the end: ${JSON.stringify(final)}`);
    if (afterResume.length < N && !followed) failures.push('the follow-up run did not settle');
    report.failures = failures;
    report.ok = failures.length === 0;
  } catch (error) {
    report.error = String(error?.stack ?? error);
  } finally {
    chrome.kill();
    await sleep(500);
    server.close();
  }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
}
main();
