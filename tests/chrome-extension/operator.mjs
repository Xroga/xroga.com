import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] ? resolve(process.argv[2]) : 'playwright');
const chrome = process.argv[3];
// Chrome's IndexedDB files can exceed Windows' path limit under a deeply nested job root.
const root = await realpath(process.argv[4] ?? tmpdir());
const profile = await mkdtemp(join(root, 'xr-op-'));
const dist = fileURLToPath(new URL('../../apps/xroga-browser-extension/dist', import.meta.url));
const site = 'https://operator-fixture.test';
const workspaceOrigin = 'https://xroga.com';
const goal = 'Open the catalog and report the published fixture price.';
const answer = 'The verified fixture price is $39.';
const formGoal = 'Complete and submit the synthetic application after I approve it.';
const formAnswer = 'The fixture confirmed the application.';
const stopGoal = 'Stop this task before its pending model turn can act.';
const runs = new Map();
let browser;

function reply(run, request) {
  const history = JSON.stringify(request.messages);
  const observation = request.messages.findLast(message => message.role === 'tool')?.content ?? '';
  const ref = label => {
    const line = observation.split('\n').find(item => item.includes(label));
    const value = /\[([ae]\d+)\]/.exec(line ?? '')?.[1];
    assert.ok(value, observation.slice(-2500));
    return { ref: value };
  };
  const call = (name, args) => ({
    id: `tool_${request.turn}`, type: 'function', function: { name, arguments: JSON.stringify(args) },
  });
  let tool;
  if (request.turn === 1) tool = call('snapshot', {});
  else if (run.goal === formGoal) {
    if (request.turn === 2) tool = call('fill_form', {
      fields: [{ target: ref('Applicant name'), value: 'Synthetic Applicant' }],
      submit: ref('Submit application'),
    });
    else if (request.turn === 3) tool = call('read', {});
    else if (request.turn === 4) {
      assert.match(history, /Application received: Synthetic Applicant/);
      tool = call('done', { outcome: 'success', summary: formAnswer });
    }
  }
  else if (request.turn === 2) {
    tool = call('click', { target: ref('Browse catalog') });
  } else if (request.turn === 3) tool = call('read', {});
  else if (request.turn === 4) {
    assert.match(history, /Fixture price: \$39/);
    tool = call('done', { outcome: 'success', summary: answer });
  }
  if (!tool) throw new Error('Unexpected extra model request');
  run.turns.push(tool.function.name);
  return { id: `fixture_${request.turn}`, model: 'deepseek_v4_1_flash_1017',
    choice: { finish_reason: 'tool_calls', message: { content: null, tool_calls: [tool] } },
    usage: { prompt_tokens: 150, completion_tokens: 20, total_tokens: 170 } };
}

try {
  browser = await chromium.launchPersistentContext(profile, {
    ...(chrome ? { executablePath: chrome } : { channel: 'chromium' }),
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--disable-background-networking', '--disable-background-timer-throttling'],
    timeout: 20_000,
  });
  console.log('Chrome started');
  const tab = browser.pages()[0];
  const cdp = await browser.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: dist });
  console.log('Agent extension loaded');
  await browser.exposeFunction('fixtureBrowserRequest', async ({ op, value }) => {
    if (op === 'start') {
      assert.ok([goal, formGoal, stopGoal].includes(value.goal));
      const runId = globalThis.crypto.randomUUID();
      runs.set(runId, { goal: value.goal, turns: [] });
      return { runId };
    }
    const run = runs.get(value.runId);
    assert.ok(run, 'turns and results use the admitted canonical run identity');
    if (op === 'turn') {
      if (run.goal === stopGoal) {
        run.pending = true;
        await new Promise(resolve => { run.release = resolve; });
      }
      return reply(run, value.body);
    }
    if (op === 'finish') { run.result = value.body; return { status: value.body.status }; }
    throw new Error('Unexpected request');
  });
  await browser.route(/^https?:\/\//, route => {
    const url = new URL(route.request().url());
    if (url.origin === site) {
      const body = url.pathname === '/catalog'
        ? '<title>Catalog</title><main><h1>Catalog</h1><p>Fixture price: $39</p></main>'
        : url.pathname === '/apply'
          ? '<title>Application</title><main><form action="/received"><label>Applicant name<input name="applicant" required></label><button type="submit">Submit application</button></form></main>'
          : url.pathname === '/received' && url.searchParams.get('applicant') === 'Synthetic Applicant'
            ? '<title>Receipt</title><main><p>Application received: Synthetic Applicant</p></main>'
            : '<title>Store</title><main><h1>Store</h1><a href="/catalog">Browse catalog</a></main>';
      return route.fulfill({ contentType: 'text/html', body });
    }
    if (url.origin === workspaceOrigin && url.pathname === '/workspace') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>Workspace bridge fixture</title>
        <div id="state">connecting</div><script>
        const query = new URLSearchParams(location.search);
        const port = chrome.runtime.connect(query.get('browserExtension'), {name:'xroga-browser-v1'});
        window.events = [];
        window.startTask = (goal, startUrl) => port.postMessage({type:'start-task',goal,startUrl});
        port.onMessage.addListener(async m => {
          events.push(m.type === 'activity' ? [m.type,m.tool,m.status] : [m.type,m.runId]);
          if(m.type==='paired') document.querySelector('#state').textContent='paired';
          if(m.type==='request') {
            try { port.postMessage({type:'result',id:m.id,ok:true,value:await fixtureBrowserRequest(m)}); }
            catch (e) { document.querySelector('#state').textContent=e.message; port.postMessage({type:'result',id:m.id,ok:false}); }
          }
        });
        port.postMessage({type:'pair',nonce:query.get('browserPair'),account:'00000000-0000-4000-8000-000000000001'});
        </script>` });
    }
    return route.abort();
  });
  await tab.goto(site);
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const target = targetInfos.find(item => item.url === tab.url());
  assert.ok(target);
  await cdp.send('Extensions.triggerAction', { id, targetId: target.targetId });
  const panel = await browser.newPage();
  await tab.bringToFront();
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.getByRole('button', { name: 'Connect Xroga Workspace' }).evaluate(button => button.click());
  let workspace;
  const deadline = Date.now() + 15_000;
  while (!workspace && Date.now() < deadline) {
    workspace = browser.pages().find(page => page.url().startsWith(`${workspaceOrigin}/workspace?`));
    if (!workspace) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(workspace, `Expected pairing page. Open pages: ${browser.pages().map(page => page.url()).join(', ')}`);
  await workspace.getByText('paired', { exact: true }).waitFor({ timeout: 15_000 }).catch(async error => {
    console.error('Pairing state:', await workspace.locator('body').innerText());
    console.error('Extension panel:', await panel.locator('body').innerText());
    throw error;
  });
  console.log('Workspace fixture paired');
  await panel.getByText('Workspace connected', { exact: true }).waitFor();
  await panel.getByLabel('Website or search').fill(site);
  const input = panel.locator('textarea');
  await input.fill(goal);
  await input.press('Enter');
  console.log('Side-panel task submitted');
  const waitForFinish = async expected => {
    await workspace.waitForFunction(count => window.events.filter(event => event[0] === 'finished').length === count, expected, { timeout: 25_000, polling: 100 })
      .catch(async error => {
        console.error('Workspace fixture:', await workspace.locator('#state').textContent());
        console.error('Events:', await workspace.evaluate(() => window.events));
        console.error('Panel:', (await panel.locator('body').innerText()).slice(-1500));
        throw error;
      });
  };
  await waitForFinish(1);
  console.log('Side-panel task reached a terminal state');
  console.log('First task receipt:', JSON.stringify([...runs.values()]));
  assert.equal([...runs.values()][0]?.result?.status, 'completed', await workspace.locator('#state').textContent());
  assert.ok(browser.pages().some(page => page.url() === `${site}/catalog`));
  await workspace.evaluate(({ goal, site }) => window.startTask(goal, site), { goal, site });
  await waitForFinish(2);
  assert.equal(browser.pages().filter(page => page.url() === `${site}/catalog`).length, 2);
  assert.equal(runs.size, 2);
  for (const run of runs.values()) {
    assert.deepEqual(run.turns, ['snapshot', 'click', 'read', 'done']);
    assert.deepEqual(run.result, { status: 'completed', result: answer, actions: ['snapshot', 'click', 'read'] });
  }
  await panel.getByLabel('Website or search').fill(`${site}/apply`);
  await input.fill(formGoal);
  await input.press('Enter');
  const allow = panel.getByRole('button', { name: 'Allow', exact: true });
  await allow.waitFor({ timeout: 15_000 }).catch(async error => {
    console.error('Form receipt:', [...runs.values()].find(run => run.goal === formGoal));
    console.error('Workspace state:', await workspace.locator('#state').textContent());
    console.error('Form panel:', await panel.locator('body').innerText());
    throw error;
  });
  assert.equal(await panel.getByRole('button', { name: 'Always allow', exact: false }).count(), 0);
  await workspace.waitForFunction(() => window.events.some(event => event[2] === 'approval-required'), undefined, {
    timeout: 5_000,
    polling: 100,
  });
  assert.equal(browser.pages().some(page => page.url().startsWith(`${site}/received`)), false);
  await allow.click();
  await waitForFinish(3);
  assert.ok(browser.pages().some(page => page.url().startsWith(`${site}/received`)));
  const formRun = [...runs.values()].find(run => run.goal === formGoal);
  assert.deepEqual(formRun.result, { status: 'completed', result: formAnswer, actions: ['snapshot', 'fill_form', 'read'] });

  await panel.getByLabel('Website or search').fill(site);
  await input.fill(stopGoal);
  await input.press('Enter');
  const stop = panel.getByRole('button', { name: 'Stop', exact: true });
  await stop.waitFor({ timeout: 15_000 });
  const pendingDeadline = Date.now() + 10_000;
  let stopRun;
  while (!stopRun?.pending && Date.now() < pendingDeadline) {
    stopRun = [...runs.values()].find(run => run.goal === stopGoal);
    if (!stopRun?.pending) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(stopRun?.pending);
  await stop.click();
  try {
    await waitForFinish(4);
    assert.deepEqual(stopRun.result, { status: 'cancelled', actions: [] });
  } finally {
    stopRun.release();
  }
  const { product } = await cdp.send('Browser.getVersion');
  console.log(JSON.stringify({ result: 'PASS', product, localBrowserActions: ['snapshot', 'click', 'read', 'fill_form'], approvedSubmission: true, cancelledPendingTurn: true, entryPoints: ['side panel', 'Workspace fixture'], model: 'deterministic fixture', liveModelCalls: 0 }));
} finally {
  try { await browser?.close(); }
  finally {
    if (dirname(await realpath(profile)) !== root) throw new Error('Chrome profile is outside its owned directory.');
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
