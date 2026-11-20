// Concurrent human control in real Chromium. Trusted input that the agent did not send (here dispatched through the debugger, which the page cannot tell from a person's)
// holds back the agent's next change to the tab: it waits for the person to stop, refuses when they keep going, and an idle tab is never delayed.
// Verdicts are the page's own click counter and the elapsed time, never a receipt.
import { sendRaw } from '@src/browser-control';
import type { Result } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const text = (tabId: number, id: string) => evaluate<string>(tabId, undefined, `document.getElementById('${id}').textContent`);
const person = (tabId: number) =>
  sendRaw(tabId, undefined, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 3, y: 3, button: 'left', clickCount: 1 })
    .then(() => sendRaw(tabId, undefined, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 3, y: 3, button: 'left', clickCount: 1 }));

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

    await sleep(700);
    await person(tabId);
    t0 = performance.now();
    const waited = await click('Open Order 1002');
    const waitedMs = Math.round(performance.now() - t0);
    await sleep(200);
    const afterWait = await text(tabId, 'count');

    let keep = true;
    const busy = (async () => { while (keep) { await person(tabId).catch(() => undefined); await sleep(400); } })();
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
