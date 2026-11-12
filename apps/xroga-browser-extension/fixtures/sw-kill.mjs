// Real service-worker kill in the middle of a run, driven from outside the extension over the DevTools protocol.
//
//   node fixtures/sw-kill.mjs [--mode kill|offline|tabclose] [--headful] [--port 9341]
//
// Modes: kill (default) stops every service worker; offline takes the extension worker's network away for twelve seconds and gives it back; tabclose closes
// the page the run is working on. Each checks that no completed action was replayed and that the run ends or can be continued, and records what the user sees.
//
// It starts the fixture server and Chrome for Testing with the autorun build (no queued job) and a debugging port, opens a fixture page, the side
// panel and an "operator" extension page, scripts the fake model to add three rows with delays, stops every service worker (ServiceWorker.stopAllWorkers)
// while the third step is still pending, waits for the worker to come back, and checks what the extension did: nothing replayed (the page's row count
// is the same right after the restart as it was just before the kill), the conversation survives, and the run reaches a state the user can act on
// (it finishes, or the panel offers Resume and pressing it finishes the run). Prints a JSON report; exits 1 on a failed assertion.
// Requires the autorun build in .output/autorun (WXT_AUTORUN_URL=http://localhost:8787 pnpm exec wxt build).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PORT, startServer } from './server.mjs';
import { findChrome } from './find-chrome.mjs';

const root = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const opt = n => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
const CDP_PORT = Number(opt('--port') ?? 9341);
const MODE = opt('--mode') ?? 'kill';
const base = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

class Cdp {
  #id = 0;
  #pending = new Map();
  #events = [];
  constructor(ws) {
    this.ws = ws;
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = this.#pending.get(m.id);
        this.#pending.delete(m.id);
        if (m.error) p?.reject(new Error(`${m.error.message}`));
        else p?.resolve(m.result);
      } else this.#events.push(m);
    };
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
  events(name) {
    return this.#events.filter(e => e.method === name);
  }
}

async function main() {
  const server = await startServer();
  const profile = mkdtempSync(join(tmpdir(), 'nb3-swkill-'));
  const outDir = join(root, '.output', 'autorun');
  const chrome = spawn(
    findChrome(),
    [
      `--user-data-dir=${profile}`,
      `--load-extension=${outDir}`,
      `--disable-extensions-except=${outDir}`,
      `--remote-debugging-port=${CDP_PORT}`,
      '--use-mock-keychain', '--no-first-run', '--no-default-browser-check', '--lang=en-US', '--window-size=1280,900',
      ...(flag('--headful') ? [] : ['--headless=new']),
      'about:blank',
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
    const evalIn = async (sessionId, expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };

    // Our extension's id: the service worker whose manifest asks for the debugger permission (the others are Chrome's own).
    let extId;
    for (let i = 0; i < 40 && !extId; i++) {
      await sleep(500);
      for (const t of (await targets()).filter(t => t.type === 'service_worker' && /chrome-extension:\/\/[a-p]{32}\/background\.js/.test(t.url))) {
        const sid = await attach(t.targetId);
        const perms = await evalIn(sid, 'JSON.stringify(chrome.runtime.getManifest().permissions||[])').catch(() => '[]');
        if (perms.includes('debugger')) extId = new URL(t.url).host;
      }
    }
    if (!extId) throw new Error('the extension service worker did not start');
    report.steps.extensionId = extId;

    const open = async url => {
      const { targetId } = await cdp.send('Target.createTarget', { url });
      await sleep(800);
      return { targetId, sid: await attach(targetId) };
    };
    const operator = await open(`chrome-extension://${extId}/options.html`);
    const page = await open(`${base}/c-effects.html`);
    await sleep(1000);
    const tabs = JSON.parse(await evalIn(operator.sid, `chrome.tabs.query({}).then(t => JSON.stringify(t.map(x => ({ id: x.id, url: x.url }))))`));
    const pageTab = tabs.find(t => t.url.includes('/c-effects.html'));
    if (!pageTab) throw new Error('the fixture page tab was not found');
    const panelTarget = await open(`chrome-extension://${extId}/sidepanel.html#tab=${pageTab.id}`);

    // The fake model and the settings the checks use.
    await fetch(`${base}/__llm/reset`, { method: 'POST' });
    await evalIn(
      operator.sid,
      `(async () => { const s = (await chrome.storage.local.get('nb.settings'))['nb.settings'] ?? {};
        await chrome.storage.local.set({ 'nb.providers': [{ id: 'fixture', kind: 'openai-compatible', name: 'Fixture model', baseUrl: '${base}/__llm/v1', models: [{ name: 'fixture-model', overrides: { contextWindow: 32768 } }] }],
          'nb.settings': { ...s, defaultMode: 'auto', defaultModel: { providerId: 'fixture', model: 'fixture-model' } } }); return true; })()`,
    );
    const tag = 'SWK-1';
    const click = delayMs => ({ when: tag, delayMs, toolCalls: [{ name: 'click', input: { target: { role: 'button', name: 'Add a row' } } }] });
    await fetch(`${base}/__llm/script`, {
      method: 'POST',
      body: JSON.stringify({
        replies: [
          { when: tag, toolCalls: [{ name: 'snapshot', input: {} }] },
          click(800), click(800), click(9000),
          { when: tag, toolCalls: [{ name: 'done', input: { outcome: 'success', summary: `${tag} finished.` } }] },
        ],
      }),
    });
    const panelOp = (op, extra = {}) =>
      evalIn(operator.sid, `chrome.runtime.sendMessage(${JSON.stringify({ nbTest: 'panel', tabId: pageTab.id, op, ...extra })})`);
    const rows = () => evalIn(page.sid, `document.querySelectorAll('#rows li').length`);

    await panelOp('type-send', { text: `${tag}: add three rows` });
    // Wait for two rows (two clicks done); the third step is still waiting on its delayed model reply.
    let rowsBefore = 0;
    for (let i = 0; i < 120 && rowsBefore < 2; i++) {
      await sleep(250);
      rowsBefore = await rows().catch(() => 0);
    }
    report.steps.rowsBeforeKill = rowsBefore;
    if (rowsBefore < 2) throw new Error(`the run did not reach two rows before the kill (${rowsBefore})`);

    report.steps.mode = MODE;
    if (MODE === 'kill') {
      // Stop every service worker, as Chrome does when it suspends or crashes one.
      await cdp.send('ServiceWorker.enable', {}, panelTarget.sid);
      await sleep(500);
      await cdp.send('ServiceWorker.stopAllWorkers', {}, panelTarget.sid);
      report.steps.killedAt = new Date().toISOString();
      await sleep(500);
      report.steps.workerGoneAfterStop = !(await targets()).some(t => t.type === 'service_worker' && t.url.includes(extId));
    } else if (MODE === 'offline') {
      // The extension worker loses its network while a model reply is pending, then gets it back.
      const sw = (await targets()).find(t => t.type === 'service_worker' && t.url.includes(extId));
      const sid = await attach(sw.targetId);
      await cdp.send('Network.enable', {}, sid);
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sid);
      report.steps.offlineAt = new Date().toISOString();
      await sleep(12_000);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, sid);
      report.steps.networkBack = true;
    } else if (MODE === 'tabclose') {
      // The page the run works on is closed while the third step is pending.
      await cdp.send('Target.closeTarget', { targetId: page.targetId });
      report.steps.tabClosedAt = new Date().toISOString();
    }

    // It comes back when something wakes it; the panel reconnects by itself, and a message from the operator page wakes it too.
    let back = false;
    for (let i = 0; i < 60 && !back; i++) {
      await sleep(500);
      await evalIn(operator.sid, `chrome.runtime.sendMessage({ nbTest: 'ping' }).catch(() => null)`).catch(() => null);
      back = (await targets()).some(t => t.type === 'service_worker' && t.url.includes(extId));
    }
    report.steps.workerBack = back;
    await sleep(2500);
    report.steps.rowsRightAfterRestart = MODE === 'tabclose' ? null : await rows().catch(() => null);
    const read1 = await panelOp('read');
    report.steps.statusAfterRestart = read1?.status;
    report.steps.buttonsAfterRestart = (read1?.buttons ?? []).filter(b => /Resume|Stop|Retry|Send/.test(b));
    report.steps.transcriptAfterRestart = String(read1?.transcript ?? '').slice(-240);

    // Either the run carried on by itself, or it offers Resume: press it. Then it has to finish.
    let finished = String(read1?.transcript ?? '').includes(`${tag} finished.`);
    if (!finished && (read1?.buttons ?? []).includes('Resume')) {
      report.steps.pressedResume = true;
      await panelOp('click', { label: 'Resume' });
    } else if (!finished) {
      // The test build has no Resume button (the product build shows one for an interrupted run): the user's way on is a message.
      report.steps.continuedWithMessage = true;
      await panelOp('type-send', { text: `${tag}: please continue` });
    }
    for (let i = 0; i < 160 && !finished; i++) {
      await sleep(500);
      const r = await panelOp('read').catch(() => null);
      if (String(r?.transcript ?? '').includes(`${tag} finished.`)) finished = true;
    }
    report.steps.finished = finished;
    report.steps.rowsFinal = MODE === 'tabclose' ? null : await rows().catch(() => null);
    const last = await panelOp('read').catch(() => null);
    report.steps.finalStatus = last?.status;

    const failures = [];
    if (!report.steps.workerBack) failures.push('the service worker did not come back');
    if (MODE === 'kill' && report.steps.rowsRightAfterRestart !== rowsBefore) failures.push(`rows changed during the restart (${rowsBefore} to ${report.steps.rowsRightAfterRestart}): an action was replayed`);
    if (MODE === 'tabclose') {
      // The model here is a script, so what it says at the end proves nothing about honesty; what the product controls is that the run does not hang.
      if (!['Done', 'Interrupted', 'Failed', 'Stopped', 'Waiting for you'].includes(String(last?.status))) failures.push(`the run is stuck in "${last?.status}" after the tab was closed`);
      report.steps.activityAfterClose = String(last?.transcript ?? '').split('\n').filter(l => /Clicked|Clicking|failed|Added|closed|gone|tab/i.test(l)).slice(0, 6);
    } else if (!finished) failures.push('the run did not finish after the disruption (with Resume if offered)');
    if (report.steps.rowsFinal !== null && report.steps.rowsFinal > 3) failures.push(`more than the three scripted clicks reached the page (${report.steps.rowsFinal})`);
    report.failures = failures;
    report.ok = failures.length === 0;
  } catch (error) {
    report.error = String(error?.stack ?? error);
  } finally {
    chrome.kill();
    await sleep(500);
    server.close();
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temporary */ }
  }
  log(JSON.stringify(report, null, 1));
  process.exit(report.ok ? 0 : 1);
}
main();
