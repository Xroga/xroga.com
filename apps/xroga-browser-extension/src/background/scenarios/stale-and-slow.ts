// Two generated-failure classes. STALE: a list re-renders under the run, so a ref taken before the swap points at a detached node; the call must fail
// with a stale-reference code (never click something else), and the recovery (a fresh snapshot, or role and name) must click the right control exactly once.
// SLOW: the list arrives after 3 s; a short wait must time out without acting, and a wait for the real content must then let the click through.
// Verdicts are the page's own state (chosen, clicks), never a receipt.
import type { Result, SnapshotData } from '@src/browser-control';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const text = (tabId: number, id: string) => evaluate<string>(tabId, undefined, `document.getElementById('${id}').textContent`);
const STALE_CODES = ['NODE_DETACHED', 'REF_NOT_PRESENTED', 'STALE_DOCUMENT', 'TARGET_CHANGED', 'REF_UNKNOWN', 'NO_MATCH'];

defineScenario({
  id: 'STALE-1-rerender-under-the-run',
  set: 'C',
  title: 'a ref that went stale is refused, and role and name recover',
  covers: 'a click on a ref from before a re-render fails with a stale-reference code and changes nothing; a fresh snapshot, then role and name, click the right control exactly once',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/stale-and-slow.html?mode=stale`);
    await sleep(200);
    const first = (await ctx.call('snapshot', { window: 'page' })) as Result<SnapshotData>;
    const line = (first.page?.snapshot ?? '').split(String.fromCharCode(10)).find(l => /Open Order 1002/.test(l));
    const ref = line && /\[(\w+)\]/.exec(line)?.[1];
    // The page replaces every node now, on demand, so the ref is stale at a known moment.
    await evaluate<boolean>(tabId, undefined, 'render(); true');
    await sleep(200);
    let staleCode = 'none';
    let staleOk = true;
    if (ref) {
      const stale = (await ctx.call('click', { target: { ref } })) as Result;
      staleOk = stale.ok;
      staleCode = stale.error?.code ?? 'none';
    }
    const afterStale = await text(tabId, 'count');
    // The recovery the error asks for: a fresh snapshot of the new document, then the control by role and name.
    await ctx.call('snapshot', { window: 'page' });
    const fresh = (await ctx.call('click', { target: { role: 'button', name: 'Open Order 1002' } })) as Result;
    await sleep(150);
    const chosen = await text(tabId, 'chosen');
    const count = await text(tabId, 'count');
    const pass = !!ref && !staleOk && STALE_CODES.includes(staleCode) && afterStale === 'clicks: 0' && fresh.ok && chosen === 'chosen: Order 1002' && count === 'clicks: 1';
    return outcome(
      'the stale ref is refused with a stale-reference code and nothing is clicked; role and name then click Order 1002 once',
      JSON.stringify({ hadRef: !!ref, staleOk, staleCode, afterStale, fresh: fresh.ok, chosen, count }),
      pass,
    );
  },
});

defineScenario({
  id: 'NET-1-slow-content',
  set: 'C',
  title: 'content that arrives after 3 s: a short wait times out without acting, a real wait lets the click through',
  covers: 'wait times out cleanly on slow content (no action taken); wait for the real text then click works; exactly one click',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/stale-and-slow.html?mode=slow`);
    const early = (await ctx.call('wait', { text: 'Order 1001', timeoutMs: 800 })) as Result;
    const countEarly = await text(tabId, 'count');
    const late = (await ctx.call('wait', { text: 'Order 1001', timeoutMs: 8000 })) as Result;
    const click = (await ctx.call('click', { target: { role: 'button', name: 'Open Order 1003' } })) as Result;
    await sleep(150);
    const chosen = await text(tabId, 'chosen');
    const count = await text(tabId, 'count');
    const pass = !early.ok && early.error?.code === 'TIMEOUT' && countEarly === 'clicks: 0' && late.ok && click.ok && chosen === 'chosen: Order 1003' && count === 'clicks: 1';
    return outcome(
      'the short wait times out with TIMEOUT and nothing is clicked; the long wait succeeds; one click on Order 1003',
      JSON.stringify({ early: early.ok, earlyCode: early.error?.code, countEarly, late: late.ok, click: click.ok, chosen, count }),
      pass,
    );
  },
});
