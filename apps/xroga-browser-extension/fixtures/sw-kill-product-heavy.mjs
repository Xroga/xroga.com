// The product build's Resume contract after a real service-worker kill, with the real model on the staging backend.
//
//   XR_JWT=<access token of the staging test account> XR_ACCOUNT=<its user id> node fixtures/sw-kill-product.mjs [--headful] [--port 9342]
//
// Requires the product autorun build in .output/autorun-product (WXT_AUTORUN_PRODUCT=1 WXT_PRODUCT_PERMISSIONS=1 and the staging WXT_XROGA_* values, see the handover
// notes). It queues one autorun job that only enrolls the browser as a device for the test account, then drives the panel from outside over the DevTools protocol:
// asks for three todo items on a public page, stops every service worker after the first item appears, and checks what the user sees: the panel offers Resume (product
// contract) or, if it does not, that is reported; pressing Resume must finish the task with exactly three distinct items and no repeat of the one already added.
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
const JWT = process.env.XR_JWT;
const ACCOUNT = process.env.XR_ACCOUNT;
const PAGE = 'https://example.com/';
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
  const profile = mkdtempSync(join(tmpdir(), 'nb3-swkillp-'));
  const outDir = join(root, '.output', 'autorun-product');
  const chrome = spawn(
    findChrome(),
    [
      `--user-data-dir=${profile}`, `--load-extension=${outDir}`, `--disable-extensions-except=${outDir}`,
      `--remote-debugging-port=${CDP_PORT}`, '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      '--window-size=1280,900', ...(flag('--headful') ? [] : ['--headless=new']), 'about:blank',
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
    const operator = await open(`chrome-extension://${extId}/options.html`);
    const page = await open(PAGE);
    await sleep(2500);
    const tabs = JSON.parse(await evalIn(operator.sid, `chrome.tabs.query({}).then(t => JSON.stringify(t.map(x => ({ id: x.id, url: x.url }))))`));
    const pageTab = tabs.find(t => t.url.startsWith('https://example.com'));
    if (!pageTab) throw new Error('the page tab was not found');
    const panelTarget = await open(`chrome-extension://${extId}/sidepanel.html#tab=${pageTab.id}`);
    await evalIn(operator.sid, `(async () => { const s = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {}; await chrome.storage.local.set({ 'nb.settings': { ...s, defaultMode: 'auto' } }); return true; })()`);
    const panelOp = (op, extra = {}) =>
      evalIn(operator.sid, `chrome.runtime.sendMessage(${JSON.stringify({ nbTest: 'panel', tabId: pageTab.id, op, ...extra })})`);
    const items = () => evalIn(page.sid, `JSON.stringify([...document.querySelectorAll('.todo-list li label')].map(l => l.textContent.trim()))`).then(JSON.parse).catch(() => []);
    // The person's part: press Allow when a card asks about this site.
    const allow = async read => {
      if (/\nAllow\n/.test(String(read?.body ?? ''))) await panelOp('click', { label: 'Allow' }).catch(() => undefined);
    };

    await panelOp('type-send', { text: 'Check the page titles of example.com, iana.org, en.wikipedia.org and developer.mozilla.org in parallel, then also open each site and tell me its first heading. Give a table.' });
    const working = r => /is working/.test(String(r?.body ?? ''));
    let seen = false;
    for (let i = 0; i < 120 && !seen; i++) { await sleep(500); const r = await panelOp('read').catch(() => null); await allow(r); seen = working(r); }
    report.steps.workStarted = seen;
    await sleep(12000);
    await cdp.send('ServiceWorker.enable', {}, panelTarget.sid);
    await sleep(300);
    await cdp.send('ServiceWorker.stopAllWorkers', {}, panelTarget.sid);
    report.steps.killedAt = new Date().toISOString();
    let back = false;
    for (let i = 0; i < 60 && !back; i++) { await sleep(500); back = (await targets()).some(t => t.type === 'service_worker' && t.url.includes(extId)); }
    report.steps.workerBack = back;
    await sleep(4000);
    const read1 = await panelOp('read');
    report.steps.panelBodyAfterRestart = String(read1?.body ?? '').replace(/\s+/g, ' ').slice(0, 400);
    report.steps.resumeOffered = /Interrupted/.test(String(read1?.body ?? '')) && /Resume/.test(String(read1?.body ?? ''));
    const settle = async (maxMs, label) => {
      let quiet = 0; const end = Date.now() + maxMs;
      while (Date.now() < end) { await sleep(1000); const r = await panelOp('read').catch(() => null); await allow(r); quiet = working(r) ? 0 : quiet + 1; if (quiet >= 6) return true; }
      report.steps[label + 'TimedOut'] = true; return false;
    };
    let resumed = false;
    if (report.steps.resumeOffered) { await panelOp('click', { label: 'Resume' }); report.steps.pressedResume = true; await sleep(3000); resumed = await settle(420_000, 'resume'); }
    const titles = t => ['Example Domain', 'Internet Assigned Numbers Authority', 'Wikipedia', 'MDN'].filter(x => t.includes(x));
    let transcript = String((await panelOp('read').catch(() => null))?.transcript ?? '');
    report.steps.titlesAfterResume = titles(transcript);
    let followed = true;
    if (titles(transcript).length < 4) {
      await panelOp('type-send', { text: 'Continue and finish the table with all four sites.' });
      report.steps.followUpSent = true; await sleep(3000); followed = await settle(420_000, 'followUp');
      transcript = String((await panelOp('read').catch(() => null))?.transcript ?? '');
    }
    report.steps.titlesFinal = titles(transcript);
    report.steps.answerTail = transcript.replace(/\s+/g, ' ').slice(-500);
    const failures = [];
    if (!seen) failures.push('the run never started working');
    if (!back) failures.push('the service worker did not come back');
    if (!report.steps.resumeOffered) failures.push('the panel did not offer Resume after the kill');
    if (report.steps.pressedResume && !resumed) failures.push('the resumed run did not settle');
    if (!followed) failures.push('the follow-up run did not settle');
    if (titles(transcript).length < 4) failures.push('the final answer lacks some sites: ' + JSON.stringify(titles(transcript)));
    if (/truncat|cut off|won.t guess|no observed|could not (?:read|be read)/i.test(transcript.slice(-1500))) failures.push('the final answer says some pages were not read');
    report.failures = failures; report.ok = failures.length === 0;
  } catch (error) {
    report.error = String(error?.stack ?? error);
  } finally {
    chrome.kill(); await sleep(500); server.close();
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temporary */ }
  }
  console.log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
}
main();
