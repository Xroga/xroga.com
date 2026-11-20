// Concurrent human control in real Chromium. The "person" is input sent straight through chrome.debugger (not through the layer, so the layer's
// own input log does not know it), which the page cannot tell from a real person's. Verdicts are the page's click counters and elapsed time.
// HUM-1: top frame. HUM-2: the person types inside an iframe while the agent works on the page around it; and the agent's own clicks right
// after the person stops are not mistaken for the person (provenance by the layer's input log, not a time window).
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const text = (tabId: number, id: string) => evaluate<string>(tabId, undefined, `document.getElementById('${id}').textContent`);
const raw = (tabId: number, method: string, params: Record<string, unknown>) => chrome.debugger.sendCommand({ tabId }, method, params);
const personClick = async (tabId: number, x: number, y: number) => {
  await raw(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await raw(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const personKey = (tabId: number, key: string) =>
  raw(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key, text: key }).then(() => raw(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key }));

defineScenario({
  id: 'HUM-1-person-using-the-tab',
  set: 'C',
  title: 'the agent waits for a person using the tab, refuses if they keep going, and is not delayed on an idle tab',
  covers: 'human-control guard: idle tab not delayed; one person action delays the next change until quiet, then it runs exactly once; continuous person input refuses with nothing clicked',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/stale-and-slow.html?mode=stale`);
    await sleep(300);
    await ctx.call('snapshot', { window: 'page' });
    const click = (name: string) => ctx.call('click', { target: { role: 'button', name } }) as Promise<Result>;

    let t0 = performance.now();
    const idle = await click('Open Order 1001');
    const idleMs = Math.round(performance.now() - t0);
    await sleep(200);
    const afterIdle = await text(tabId, 'count');

    await personClick(tabId, 3, 3);
    t0 = performance.now();
    const waited = await click('Open Order 1002');
    const waitedMs = Math.round(performance.now() - t0);
    await sleep(200);
    const afterWait = await text(tabId, 'count');

    let keep = true;
    const busy = (async () => { while (keep) { await personClick(tabId, 3, 3).catch(() => undefined); await sleep(400); } })();
    await sleep(500);
    t0 = performance.now();
    const refused = await click('Open Order 1003');
    const refusedMs = Math.round(performance.now() - t0);
    keep = false;
    await busy;
    const afterRefuse = await text(tabId, 'count');

    const pass =
      idle.ok && idleMs < 2000 && afterIdle === 'clicks: 1' &&
      waited.ok && waitedMs >= 1800 && afterWait === 'clicks: 2' &&
      !refused.ok && refused.error?.code === 'MODAL_PENDING' && refusedMs >= 14_000 && afterRefuse === 'clicks: 2';
    return outcome(
      'idle: no delay; after one person action the click waits then runs once; continuous person input refuses after ~15 s with nothing clicked',
      JSON.stringify({ idleOk: idle.ok, idleMs, afterIdle, waitedOk: waited.ok, waitedMs, afterWait, refusedOk: refused.ok, refusedCode: refused.error?.code, refusedMs, afterRefuse }),
      pass,
    );
  },
});

defineScenario({
  id: 'HUM-2-person-in-a-frame',
  set: 'C',
  title: 'a person typing inside an iframe holds the agent back; the agent\'s own rapid clicks are never taken for the person',
  covers: 'per-frame input monitoring; provenance by the layer input log: back-to-back agent clicks are not delayed, a person keying in a frame is',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/human-frames.html`);
    await sleep(400);
    await ctx.call('snapshot', { window: 'page' });
    const save = () => ctx.call('click', { target: { role: 'button', name: 'Save' } }) as Promise<Result>;

    // The agent's own clicks, back to back: each must run at once (its own input is in the layer's log).
    let t0 = performance.now();
    const a1 = await save();
    const a2 = await save();
    const a3 = await save();
    const agentMs = Math.round(performance.now() - t0);
    const afterAgent = await text(tabId, 'count');

    // The person clicks into the frame's text area and types (every event lands in the frame's document).
    await personClick(tabId, 100, 300);
    for (const k of ['h', 'i']) await personKey(tabId, k);
    t0 = performance.now();
    const held = await save();
    const heldMs = Math.round(performance.now() - t0);
    const afterHeld = await text(tabId, 'count');
    const typed = await evaluate<string>(tabId, undefined, `document.getElementById('notes').contentDocument.getElementById('t').value`);

    const pass = a1.ok && a2.ok && a3.ok && agentMs < 3000 && afterAgent === 'clicks: 3' && held.ok && heldMs >= 1800 && afterHeld === 'clicks: 4' && typed === 'hi';
    return outcome(
      'three agent clicks run without delay; after the person types in the frame the next click waits for them to stop, then runs once',
      JSON.stringify({ agentMs, afterAgent, heldOk: held.ok, heldMs, afterHeld, typed }),
      pass,
    );
  },
});
