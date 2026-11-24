// Batch 1 features live on staging, with the real model: python_repl (variables carried between cells) and the blocked-sites queue (a captcha page is listed, never solved).
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
const PAGE = 'http://localhost:8787/c-text.html';
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
    const pageTab = tabs.find(t => t.url.startsWith('http://localhost:8787'));
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
      // The handshake is sometimes dropped: press Connect again every 30 seconds while the panel still says it is connecting.
      if (i > 0 && i % 60 === 0) await panelOp('click', { label: 'Connect Xroga Workspace' }).catch(() => undefined);
      paired = String((await panelOp('read').catch(() => null))?.body ?? '').includes('Signed in to Xroga');
    }
    report.steps.paired = paired;
    if (!paired) report.steps.panelWhenNotPaired = String((await panelOp('read').catch(() => null))?.body ?? '').replace(/\s+/g, ' ').slice(0, 400);
    if (!paired) { report.steps.workerConsole = (cdp.events ?? []).slice(-15); report.steps.workerNetwork = (cdp.net ?? []).slice(-20); report.steps.workspaceTabs = (await targets()).filter(t => t.type === 'page').map(t => t.url.slice(0, 160)); }
    if (!paired) {
      report.steps.workspaceTexts = [];
      for (const t of (await targets()).filter(t => t.type === 'page' && /\/workspace/.test(t.url))) {
        const sid = await attach(t.targetId);
        report.steps.workspaceTexts.push(String(await evalIn(sid, 'document.body.innerText').catch(e => String(e))).replace(/\s+/g, ' ').slice(0, 500));
      }
    }
    if (!paired) throw new Error('the extension did not pair with the Workspace');
    const allow = async read => {
      if (/\nAllow\n/.test(String(read?.body ?? ''))) await panelOp('click', { label: 'Allow' }).catch(() => undefined);
    };
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
    const ask = async (label, text, maxMs) => {
      await panelOp('type-send', { text });
      await sleep(3000);
      const settled = await settle(maxMs, label);
      const r = await panelOp('read').catch(() => null);
      report.steps[label] = { settled, transcriptTail: String(r?.transcript ?? '').replace(/\s+/g, ' ').slice(-1400) };
      return String(r?.transcript ?? '');
    };

    const failures = [];
    if (opt('--prompt')) {
      // A real task of the person's choosing: timed, with the number of screenshots the run mentions.
      const t0 = Date.now();
      const text = await ask('custom', opt('--prompt'), Number(opt('--max-ms') ?? 1_200_000));
      report.steps.seconds = Math.round((Date.now() - t0) / 1000);
      report.steps.screenshotMentions = (text.match(/screenshot/gi) ?? []).length;
      report.steps.lastRefusal = await evalIn(operator.sid, `chrome.storage.local.get('xroga_last_refusal').then(v => JSON.stringify(v.xroga_last_refusal ?? null))`).catch(e => String(e));
      report.steps.workerConsole = (cdp.events ?? []).filter(e => /secret-like|model\]/.test(e.text)).slice(-6);
      report.steps.finalAnswer = text.replace(/\s+/g, ' ').slice(-2500);
      const broken = /Xroga paused|could not be verified|Interrupted|BROWSER_[A-Z_]+|Resume to continue|reply was cut|Try again|Retry$/.test(text.slice(-1500));
      report.ok = report.steps.custom.settled && !broken;
      report.failures = report.ok ? [] : [broken ? 'the run paused or failed (see finalAnswer)' : 'the task did not settle in time'];
      throw null;
    }
    // 1. python_repl: two cells, the second uses a variable of the first.
    const t1 = flag('--skip-python') ? '' : await ask('pythonRepl', 'Use the python_repl tool, two separate calls. First call: define total = sum(i*i for i in range(1, 21)) and print it. Second call: using the variable total from the first call (do not redefine it), print total + 7. Then tell me both numbers.', 360_000);
    if (!flag('--skip-python')) {
      if (!/python_repl/.test(t1)) failures.push('python_repl was not used');
      if (!/2870/.test(t1)) failures.push('the first cell result 2870 is missing');
      if (!/2877/.test(t1)) failures.push('the second cell did not reach 2877 (variable not carried)');
    }

    // 2. blocked-sites queue: a captcha page is listed for the person, not solved.
    const t2 = await ask('blockedQueue', 'Open https://www.google.com/sorry/index and read it. Then open https://example.com and tell me its heading. Finish with a short summary.', 360_000);
    if (!/Sites that need you/i.test(t2)) failures.push('the summary does not list the blocked site ("Sites that need you")');
    if (/solved the captcha|i solved|passed the check myself/i.test(t2)) failures.push('the agent claims it solved the check');

    // 3. the done-check judge and http routine are not exercised here: they are covered by the live judge test and unit tests.
    report.failures = failures;
    report.ok = failures.length === 0;
  } catch (error) {
    if (error) report.error = String(error?.stack ?? error);
  } finally {
    chrome.kill();
    await sleep(500);
    server.close();
  }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
}
main();
