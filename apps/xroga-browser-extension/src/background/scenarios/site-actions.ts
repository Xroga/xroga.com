// Reviewed site actions against the real browser layer in real Chromium. Verdicts are the page's own state (chosen, clicks), never a receipt.
// Covers: a verified low-risk write that clicks once and confirms the result; a changed application (fingerprint missing) that refuses before any click;
// a wrong postcondition reported as unverified rather than done; a repeat of the same write refused; a consequential action that never touches the page.
import type { Result } from '@src/browser-control';
import { ActionLedger, actionHash, runSiteAction, type VerifiedSiteAction } from '@src/agent/site-actions';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { evaluate, sleep } from '../checks/helpers';
import { defineScenario, outcome } from './registry';

const text = (tabId: number, id: string) => evaluate<string>(tabId, undefined, `document.getElementById('${id}').textContent`);
const source = { origin: 'fixture', reviewedBy: 'Xroga engineering (scenario)', reviewedAt: '2026-11-20' };
const rule = { host: '127.0.0.1', schemes: ['http' as const], pathPrefix: '/stale-and-slow.html' };
const open = (over: Partial<VerifiedSiteAction> = {}): VerifiedSiteAction => ({
  id: 'orders.open', version: '1', name: 'Open an order', description: 'Open one order.', rule, actionClass: 'write_low',
  inputSchema: { required: ['order'], properties: { order: { type: 'string', enum: ['Order 1001', 'Order 1002', 'Order 1003'] } } },
  versionFingerprint: 'Orders', steps: [{ tool: 'click', args: { target: { role: 'button', name: 'Open {{input.order}}' } } }],
  postcondition: 'chosen: {{input.order}}', idempotencyKey: ['order'], source, ...over,
});

defineScenario({
  id: 'SITE-1-verified-site-actions',
  set: 'C',
  title: 'a reviewed site action clicks once and verifies; a changed page refuses; a wrong result is unverified; repeats and consequential actions never run',
  covers: 'runSiteAction through the real layer: verified write, version mismatch before any click, unverified postcondition, duplicate refusal, consequential refusal',
  async run(ctx) {
    const url = `http://127.0.0.1:${new URL(FIXTURE_ORIGIN).port}/stale-and-slow.html?mode=stale`;
    const tabId = await ctx.open(url);
    await sleep(300);
    const call = async (tool: string, input: Record<string, unknown>) => {
      const r = (await ctx.call(tool, input)) as Result;
      return { ok: r.ok, text: JSON.stringify(r).slice(0, 300) };
    };
    const ledger = new ActionLedger();
    const run = async (a: VerifiedSiteAction, input: Record<string, unknown>) => runSiteAction(a, await actionHash(a), input, { call, url, ledger });

    const done = await run(open(), { order: 'Order 1002' });
    await sleep(150);
    const chosen = await text(tabId, 'chosen');
    const count1 = await text(tabId, 'count');

    const dup = await run(open(), { order: 'Order 1002' });
    const count2 = await text(tabId, 'count');

    const changed = await run(open({ versionFingerprint: 'Totally different application' }), { order: 'Order 1001' });
    const count3 = await text(tabId, 'count');

    const wrongPost = await run(open({ id: 'orders.open2', postcondition: 'never shown: {{input.order}}', idempotencyKey: ['order'] }), { order: 'Order 1003' });
    const count4 = await text(tabId, 'count');

    const del = await run(open({ id: 'orders.delete', actionClass: 'write_consequential', steps: [{ tool: 'click', args: { target: { role: 'button', name: 'Open {{input.order}}' } } }] }), { order: 'Order 1001' });
    const count5 = await text(tabId, 'count');

    const pass =
      done.status === 'done' && chosen === 'chosen: Order 1002' && count1 === 'clicks: 1' &&
      dup.status === 'duplicate' && count2 === 'clicks: 1' &&
      changed.status === 'version_mismatch' && count3 === 'clicks: 1' &&
      wrongPost.status === 'unverified' && count4 === 'clicks: 2' &&
      del.status === 'needs_approval' && count5 === 'clicks: 2';
    return outcome(
      'verified write clicks once; repeat refused; changed page refused before any click; wrong postcondition unverified; consequential never touches the page',
      JSON.stringify({ msg: done.message.slice(0, 160), done: done.status, chosen, count1, dup: dup.status, changed: changed.status, wrongPost: wrongPost.status, del: del.status, counts: [count1, count2, count3, count4, count5] }),
      pass,
    );
  },
});
