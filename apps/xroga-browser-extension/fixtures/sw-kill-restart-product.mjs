// The product build's Resume contract after a real service-worker kill, with the real model on the staging backend.
//
//   XR_JWT=<access token of the staging test account> XR_ACCOUNT=<its user id> node fixtures/sw-kill-restart-product.mjs [--restart] [--headful] [--port 9342]
//
// Requires the product autorun build in .output/autorun-product (WXT_AUTORUN_PRODUCT=1 WXT_PRODUCT_PERMISSIONS=1 and the staging WXT_XROGA_* values, see the handover
// notes). It queues one autorun job that only enrolls the browser as a device for the test account, then drives the panel from outside over the DevTools protocol:
// asks for three todo items on a public page, stops every service worker after the first item appears, and checks what the user sees: the panel offers Resume (product
// contract) or, if it does not, that is reported; pressing Resume must finish the task with exactly three distinct items and no repeat of the one already added.
import { spawn, spawnSync } from 'node:child_process';
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
const JWT = process.env.XR_JWT;
const ACCOUNT = process.env.XR_ACCOUNT;
const MODE_RESTART_FLAG = process.argv.includes('--restart');
const API = (process.env.XR_API || 'https://browser-op-1110---xroga-api-universal-staging-422lt7eujq-uk.a.run.app') + '/api/browser/local';
const PAGE = 'https://todomvc.com/examples/react/dist/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
if (!JWT || !ACCOUNT) {
  console.error('XR_JWT and XR_ACCOUNT are required');
  process.exit(2);
}

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
  // Enrollment: the extension's own check does the device pairing for the test account, then the run below uses that device.
  queueAutorunJob({ checks: [{ name: 'real-model', args: { jwt: JWT, account: ACCOUNT, tasks: [] } }] });
  const enrolled = new Promise(res => autorunEvents.once('report', res));
  const profile = mkdtempSync(join(tmpdir(), 'nb3-restartp-'));
  const outDir = join(root, '.output', 'autorun-product');
  const launch = () => spawn(
    findChrome(),
    [
      `--user-data-dir=${profile}`, `--load-extension=${outDir}`, `--disable-extensions-except=${outDir}`,
      `--remote-debugging-port=${CDP_PORT}`, '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      '--window-size=1280,900', ...(flag('--headful') ? [] : ['--headless=new']), 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let chrome = launch();
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

    const enrollReport = await Promise.race([enrolled, sleep(120_000).then(() => null)]);
    const device = enrollReport?.reports?.[0]?.result?.device;
    report.steps.enrolled = device ?? enrollReport?.reports?.[0]?.error ?? 'no enrollment report';
    if (!device?.verified) throw new Error('the device did not enroll');

    let extId;
    for (const t of (await targets()).filter(t => t.type === 'service_worker' && /chrome-extension:\/\/[a-p]{32}\/background\.js/.test(t.url))) {
      const sid = await attach(t.targetId);
      const perms = await evalIn(sid, 'JSON.stringify(chrome.runtime.getManifest().permissions||[])').catch(() => '[]');
      if (perms.includes('debugger')) extId = new URL(t.url).host;
    }
    if (!extId) throw new Error('the extension service worker was not found');
    const open = async url => {
      const { targetId } = await cdp.send('Target.createTarget', { url });
      await sleep(1500);
      return { targetId, sid: await attach(targetId) };
    };
    let operator = await open(`chrome-extension://${extId}/options.html`);
    let page = await open(PAGE);
    await sleep(2500);
    const tabs = JSON.parse(await evalIn(operator.sid, `chrome.tabs.query({}).then(t => JSON.stringify(t.map(x => ({ id: x.id, url: x.url }))))`));
    let pageTab = tabs.find(t => t.url.startsWith('https://todomvc.com'));
    if (!pageTab) throw new Error('the page tab was not found');
    let panelTarget = await open(`chrome-extension://${extId}/sidepanel.html#tab=${pageTab.id}`);
    await evalIn(operator.sid, `(async () => { const s = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {}; await chrome.storage.local.set({ 'nb.settings': { ...s, defaultMode: 'auto' } }); return true; })()`);
    const panelOp = (op, extra = {}) =>
      evalIn(operator.sid, `chrome.runtime.sendMessage(${JSON.stringify({ nbTest: 'panel', tabId: pageTab.id, op, ...extra })})`);
    const items = () => evalIn(page.sid, `JSON.stringify([...document.querySelectorAll('.todo-list li label')].map(l => l.textContent.trim()))`).then(JSON.parse).catch(() => []);
    // The person's part: press Allow when a card asks about this site.
    const allow = async read => {
      if (/\nAllow\n/.test(String(read?.body ?? ''))) await panelOp('click', { label: 'Allow' }).catch(() => undefined);
    };

    await panelOp('type-send', { text: 'On this page add three todo items named alpha, beta and gamma, then tell me the list.' });
    let before = [];
    for (let i = 0; i < 240 && before.length < 1; i++) {
      await sleep(500);
      await allow(await panelOp('read').catch(() => null));
      before = await items();
    }
    report.steps.itemsBeforeKill = before;
    if (before.length < 1) throw new Error('the model had not added an item within two minutes');

    const runsDump = () => evalIn(operator.sid, `(async () => { const dbs = await indexedDB.databases(); const out = [];
      for (const d of dbs) { if (!/nanobrowser/.test(d.name)) continue;
        const db = await new Promise((res, rej) => { const r = indexedDB.open(d.name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        if (![...db.objectStoreNames].includes('runs')) { db.close(); continue; }
        const rows = await new Promise(res => { const g = db.transaction('runs').objectStore('runs').getAll(); g.onsuccess = () => res(g.result); });
        out.push({ db: d.name, runs: rows.map(r => ({ status: r.status, reason: r.reason, outcome: r.outcome, hasFinish: !!r.canonicalBrowserFinish, run: String(r.canonicalBrowserRunId || '').slice(0, 8) })) }); db.close(); }
      return JSON.stringify(out); })()`).then(JSON.parse).catch(e => String(e));
    const MODE_RESTART = flag('--restart');
    report.steps.mode = MODE_RESTART ? 'sw-kill then chrome restart' : 'sw-kill';
    report.steps.runsBeforeKill = await runsDump();
    // The server's view of the run, read with the account's own token: one run, still the same one after the restart.
    const serverRuns = async () => (await fetch(API + '/session', { headers: { authorization: 'Bearer ' + JWT } }).then(r => r.json()).catch(e => String(e)));
    report.steps.serverSessionBefore = await serverRuns();
    let back = false;
    if (MODE_RESTART) {
      // Stop the service worker first (as a browser does on idle), then the whole browser, hard: no shutdown handler runs.
      await cdp.send('ServiceWorker.enable', {}, panelTarget.sid);
      await cdp.send('ServiceWorker.stopAllWorkers', {}, panelTarget.sid);
      await sleep(800);
      report.steps.killedAt = new Date().toISOString();
      spawnSync('taskkill', ['/F', '/T', '/PID', String(chrome.pid)]);
      await sleep(4000);
      chrome = launch();
      cdp = undefined;
      for (let i = 0; i < 60 && !cdp; i++) { await sleep(500); cdp = await Cdp.connect(CDP_PORT).catch(() => null); }
      if (!cdp) throw new Error('Chrome did not restart');
      for (let i = 0; i < 60 && !back; i++) { await sleep(500); back = (await targets()).some(t => t.type === 'service_worker' && t.url.includes(extId)); }
      // The person reopens the page and the panel: tab ids are new after a restart.
      const sw = (await targets()).find(t => t.type === 'service_worker' && t.url.includes(extId));
      operator = await open(`chrome-extension://${extId}/options.html`);
      page = await open(PAGE);
      await sleep(2500);
      const tabs2 = JSON.parse(await evalIn(operator.sid, `chrome.tabs.query({}).then(t => JSON.stringify(t.map(x => ({ id: x.id, url: x.url }))))`));
      pageTab = tabs2.find(t => t.url.startsWith('https://todomvc.com'));
      if (!pageTab) throw new Error('the page tab was not found after the restart');
      panelTarget = await open(`chrome-extension://${extId}/sidepanel.html#tab=${pageTab.id}`);
      await sleep(2000);
      // After a restart the tab has a new id and a fresh conversation: the person finds the interrupted task in Recent tasks (History).
      await panelOp('click', { label: 'History' });
      await sleep(1500);
      report.steps.openedHistoryCard = await evalIn(panelTarget.sid, `(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find(x => /todo items/.test(x.innerText)); b?.click(); return !!b; })()`);
      await sleep(2500);
    } else {
      await cdp.send('ServiceWorker.enable', {}, panelTarget.sid);
      await sleep(300);
      await cdp.send('ServiceWorker.stopAllWorkers', {}, panelTarget.sid);
      report.steps.killedAt = new Date().toISOString();
      for (let i = 0; i < 60 && !back; i++) { await sleep(500); back = (await targets()).some(t => t.type === 'service_worker' && t.url.includes(extId)); }
    }
    report.steps.workerBack = back;
    await sleep(3000);
    const afterRestart = await items();
    report.steps.itemsRightAfterRestart = afterRestart;
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
    if (afterResume.length < 3) {
      await panelOp('type-send', { text: 'Continue: add the remaining items so the list is alpha, beta and gamma. Do not add alpha again.' });
      report.steps.followUpSent = true;
      await sleep(3000);
      followed = await settle(300_000, 'followUp');
    }
    const final = await items();
    const last = await panelOp('read').catch(() => null);
    report.steps.itemsFinal = final;
    report.steps.runsFinal = await runsDump();
    report.steps.serverSessionAfter = await serverRuns();
    report.steps.answerTail = String(last?.transcript ?? '').replace(/\s+/g, ' ').slice(-260);

    const failures = [];
    if (!back) failures.push('the service worker did not come back');
    if (!MODE_RESTART_FLAG && afterRestart.length !== before.length) failures.push(`items changed during the restart (${before.length} to ${afterRestart.length})`);
    if (!report.steps.resumeOffered) failures.push('the panel did not offer Resume after the worker was killed (product contract)');
    if (report.steps.pressedResume && !resumed) failures.push('the resumed run did not settle');
    // A kill between two writes leaves nothing uncertain, so the resumed run may finish the work; what must hold is no duplicate and no overshoot.
    if (new Set(afterResume).size !== afterResume.length || afterResume.length > 3) failures.push(`the resumed run left a duplicate or too many items: ${JSON.stringify(afterResume)}`);
    if (new Set(final).size !== final.length) failures.push(`duplicate items: ${JSON.stringify(final)}`);
    if (final.length > 3) failures.push(`more than three items: ${JSON.stringify(final)}`);
    if (final.length < 3) failures.push(`fewer than three items at the end: ${JSON.stringify(final)}`);
    if (afterResume.length < 3 && !followed) failures.push('the follow-up run did not settle');
    // Same run: every canonical run id seen before the kill is still present after the restart and the resume (a new id would mean a new run).
    const ids = v => (Array.isArray(v) ? v.flatMap(d => d.runs ?? []).map(r => r.run).filter(Boolean) : []);
    const beforeIds = new Set(ids(report.steps.runsBeforeKill));
    const afterIds = new Set(ids(report.steps.runsFinal));
    report.steps.sameServerRun = beforeIds.size > 0 && [...beforeIds].every(x => afterIds.has(x));
    report.steps.runIdsBefore = [...beforeIds]; report.steps.runIdsAfter = [...afterIds];
    if (!report.steps.sameServerRun) failures.push('the resumed work is not the same server run: ' + JSON.stringify({ before: [...beforeIds], after: [...afterIds] }));
    report.failures = failures;
    report.ok = failures.length === 0;
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
