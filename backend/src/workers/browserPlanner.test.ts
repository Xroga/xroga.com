import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBrowserJob } from './browserJob.js';
import { BrowserPlannerError, planBrowserTask } from './browserPlanner.js';

const job = (ai = 0) => parseBrowserJob({
  version: 1, tenantId: 't1', userId: 'u1', projectId: 'p1', runId: 'r1', taskId: 'k1', attempt: 1,
  allowedOrigins: ['https://quotes.toscrape.com'], startUrl: 'https://quotes.toscrape.com/',
  limits: { maxDurationMs: 60_000, maxNavigations: 10, maxRedirects: 1, maxPages: 1, maxResponseBytes: 1_000_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: ai },
});
function deps(content: unknown, usage: unknown = { prompt_tokens: 500, completion_tokens: 120 }) {
  const ledger = { reserved: 0, settled: 0, released: 0 }; const bodies: any[] = [];
  return {
    ledger, bodies,
    d: {
      modelId: 'deepseek_v4_flash' as const,
      reserve: async () => { ledger.reserved++; return { id: 'r', reservedMicroUsd: 1_000_000, priceVersion: 't' }; },
      settle: async () => { ledger.settled++; }, release: async () => { ledger.released++; },
      client: () => ({ model: 'm', create: async (b: any) => { bodies.push(b); return { choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage }; } }),
    },
  };
}
const good = { steps: [{ op: 'click', selector: 'li.next > a' }, { op: 'screenshot', name: 'p2.png' }], expect: [{ kind: 'finalUrlPrefix', prefix: 'https://quotes.toscrape.com/page/2' }, { kind: 'artifact', name: 'p2.png' }] };

describe('browser planner (untrusted model output, canonical ledger)', () => {
  it('returns a validated plan, settles measured usage, and sends only the user-given scope', async () => {
    const { d, ledger, bodies } = deps(good);
    const r = await planBrowserTask('go to page two', job(), d);
    assert.equal(r.plan.steps.length, 2); assert.ok(r.costMicros > 0);
    assert.deepEqual(ledger, { reserved: 1, settled: 1, released: 0 });
    assert.deepEqual(JSON.parse(bodies[0].messages[1].content).allowedOrigins, ['https://quotes.toscrape.com']);
  });
  it('a model cannot widen scope, grant itself a write, add AI steps, or skip verification', async () => {
    await assert.rejects(planBrowserTask('x', job(), deps({ ...good, steps: [{ op: 'goto', url: 'https://evil.example/' }] }).d), (e) => e instanceof BrowserPlannerError && e.code === 'PLAN_INVALID');
    const granted = deps({ ...good, writeGrant: { grantId: 'grant-0001', actions: ['submit'] }, steps: [{ op: 'click', selector: 'form button', consequential: true }] });
    await assert.rejects(planBrowserTask('x', job(), granted.d), (e) => e instanceof BrowserPlannerError && /write grant/.test(e.message));
    await assert.rejects(planBrowserTask('x', job(100_000), deps({ ...good, steps: [{ op: 'aiAct', instruction: 'click' }] }).d), /AI steps were not allowed/);
    await assert.rejects(planBrowserTask('x', job(), deps({ steps: good.steps, expect: [] }).d), /verified/);
    await assert.rejects(planBrowserTask('x', job(), deps('not json').d), (e) => e instanceof BrowserPlannerError && e.code === 'PLAN_INVALID');
  });
  it('releases the reservation when the provider fails or reports no usage', async () => {
    const failing = deps(good); failing.d.client = () => ({ model: 'm', create: async () => { throw new Error('503'); } });
    await assert.rejects(planBrowserTask('x', job(), failing.d), (e) => e instanceof BrowserPlannerError && e.code === 'PLAN_UNAVAILABLE');
    assert.equal(failing.ledger.released, 1);
    const unmeasured = deps(good, null);
    await assert.rejects(planBrowserTask('x', job(), unmeasured.d), (e) => e instanceof BrowserPlannerError && e.code === 'PLAN_USAGE_UNMEASURED');
    assert.equal(unmeasured.ledger.released, 1); assert.equal(unmeasured.ledger.settled, 0);
  });
});
