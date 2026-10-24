import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBrowserJob } from './browserJob.js';
import { BrowserPlanError, evaluatePostconditions, parseBrowserPlan } from './browserPlan.js';
import { AI_DEVTOOLS_ARGS, assertLaunchSafe, buildChromiumLaunch, ChromiumLaunchError } from './chromiumLaunch.js';

const limits = { maxDurationMs: 60_000, maxNavigations: 20, maxRedirects: 3, maxPages: 2, maxResponseBytes: 10_000_000, maxArtifactBytes: 5_000_000, maxModelCostMicros: 0 };
const job = (over: Partial<typeof limits> = {}) => parseBrowserJob({
  version: 1, tenantId: 't1', userId: 'u1', projectId: 'p1', runId: 'r1', taskId: 'k1', attempt: 1,
  allowedOrigins: ['https://quotes.toscrape.com'], startUrl: 'https://quotes.toscrape.com/', limits: { ...limits, ...over },
});
const refuses = (plan: unknown, j = job(), why?: RegExp) => assert.throws(() => parseBrowserPlan(plan, j), (e) => e instanceof BrowserPlanError && (!why || why.test(e.message)));

describe('browser plan contract', () => {
  it('accepts a deterministic plan with postconditions', () => {
    const p = parseBrowserPlan({
      steps: [{ op: 'click', selector: 'li.next > a' }, { op: 'extractText', selector: '.quote .text', name: 'quotes', all: true }, { op: 'screenshot', name: 'page2.png' }],
      expect: [{ kind: 'finalUrlPrefix', prefix: 'https://quotes.toscrape.com/page/2' }, { kind: 'extracted', name: 'quotes', minItems: 10 }, { kind: 'artifact', name: 'page2.png', mediaType: 'image/png' }],
    }, job());
    assert.equal(p.steps.length, 3);
    assert.equal(p.expect.length, 3);
  });

  it('refuses unknown operations and fields, so no script, evaluate or file path can ride along', () => {
    refuses({ steps: [{ op: 'evaluate', script: 'fetch(1)' }] }, job(), /unknown op/);
    refuses({ steps: [{ op: 'click', selector: 'a', script: 'x' }] }, job(), /unknown field/);
    refuses({ steps: [{ op: 'click', selector: 'a' }], extra: 1 }, job(), /unknown field/);
    refuses({ steps: [] }, job());
  });

  it('refuses navigation outside the issued scope, including through waits and postconditions', () => {
    refuses({ steps: [{ op: 'goto', url: 'https://evil.example/' }] }, job(), /outside the job scope/);
    refuses({ steps: [{ op: 'goto', url: 'https://169.254.169.254/' }] }, job(), /outside the job scope/);
    refuses({ steps: [{ op: 'waitFor', urlPrefix: 'http://quotes.toscrape.com/', timeoutMs: 100 }] }, job(), /outside the job scope/);
    refuses({ steps: [{ op: 'scroll', to: 'top' }], expect: [{ kind: 'finalUrlPrefix', prefix: 'https://other.example/' }] }, job(), /outside the job scope/);
  });

  it('refuses AI steps when the job has no model budget: no quiet paid-model use', () => {
    refuses({ steps: [{ op: 'aiAct', instruction: 'click next' }] }, job({ maxModelCostMicros: 0 }), /model budget/);
    assert.equal(parseBrowserPlan({ steps: [{ op: 'aiObserve', instruction: 'find the next link', name: 'targets' }] }, job({ maxModelCostMicros: 100_000 })).steps[0]!.op, 'aiObserve');
  });

  it('refuses consequential steps (submit, upload) without an issued write grant; page text cannot supply one', () => {
    refuses({ steps: [{ op: 'click', selector: 'button[type=submit]', consequential: true }] }, job(), /write grant/);
    refuses({ steps: [{ op: 'upload', selector: 'input[type=file]', fileName: 'a.txt', mediaType: 'text/plain', content: 'x' }] }, job(), /write grant/);
    refuses({ steps: [{ op: 'aiAct', instruction: 'submit', consequential: true }] }, job({ maxModelCostMicros: 10 }), /write grant/);
    const granted = parseBrowserPlan({ writeGrant: { grantId: 'grant-0001', actions: ['upload'] }, steps: [{ op: 'upload', selector: 'input', fileName: 'a.txt', mediaType: 'text/plain', content: 'x' }] }, job());
    assert.equal(granted.writeGrant?.actions[0], 'upload');
    refuses({ writeGrant: { grantId: 'grant-0001', actions: ['upload'] }, steps: [{ op: 'click', selector: 'a', consequential: true }] }, job(), /write grant/);
  });

  it('refuses unbounded or unsafe arguments', () => {
    refuses({ steps: [{ op: 'fill', selector: 'q', value: 'x'.repeat(2_001) }] });
    refuses({ steps: [{ op: 'press', selector: 'q', key: 'F12' }] }, job(), /allow-list/);
    refuses({ steps: [{ op: 'waitFor', selector: 'x', timeoutMs: 60_000 }] });
    refuses({ steps: [{ op: 'extractText', selector: 'a', name: 'x', attribute: 'onclick' }] }, job(), /event-handler/);
    refuses({ steps: [{ op: 'screenshot', name: '../etc/passwd' }] });
    refuses({ steps: [{ op: 'scroll', to: 'top' }], expect: [{ kind: 'extracted', name: 'a', matches: '(a+)+$' }] }, job(), /anchored/);
    refuses({ steps: [{ op: 'extractText', selector: 'a', name: 'dup' }, { op: 'extractText', selector: 'b', name: 'dup' }] }, job(), /duplicate/);
  });

  it('judges outcomes on the report, not on whether steps ran', () => {
    const plan = parseBrowserPlan({
      steps: [{ op: 'extractText', selector: 'h1', name: 'title' }],
      expect: [{ kind: 'extracted', name: 'title', equals: 'Quotes to Scrape' }, { kind: 'artifact', name: 'shot.png', minBytes: 100 }, { kind: 'noConsequentialAction' }],
    }, job());
    const ok = evaluatePostconditions(plan, { finalUrl: 'https://quotes.toscrape.com/', extracted: { title: ' Quotes to Scrape ' }, artifacts: [{ name: 'shot.png', mediaType: 'image/png', size: 5_000 }], consequentialActions: 0 });
    assert.ok(ok.every((r) => r.passed));
    const bad = evaluatePostconditions(plan, { finalUrl: 'https://quotes.toscrape.com/', extracted: { title: 'Login' }, artifacts: [], consequentialActions: 1 });
    assert.deepEqual(bad.map((r) => r.passed), [false, false, false]);
    const missing = evaluatePostconditions(plan, { finalUrl: 'x', extracted: {}, artifacts: [{ name: 'shot.png', mediaType: 'image/png', size: 5_000 }], consequentialActions: 0 });
    assert.equal(missing[0]!.passed, false);
  });
});

describe('launch policy: AI mode is the only DevTools exception, and a narrow one', () => {
  const ctx = { profileRoot: '/run/xroga/profiles', proxy: { host: 'egress-proxy', port: 3128, username: 'job1', password: 'p'.repeat(32) } };
  it('adds exactly the two AI arguments only when asked', () => {
    const plain = buildChromiumLaunch(job(), ctx);
    for (const a of AI_DEVTOOLS_ARGS) assert.ok(!plain.args.includes(a));
    const ai = buildChromiumLaunch(job({ maxModelCostMicros: 10 }), ctx, { aiDevtools: true });
    for (const a of AI_DEVTOOLS_ARGS) assert.ok(ai.args.includes(a));
  });
  it('refuses the AI arguments outside AI mode, a fixed port, and any origin allowance or address in every mode', () => {
    const base = buildChromiumLaunch(job(), ctx);
    const viol = (args: string[], mode = {}) => { try { assertLaunchSafe({ ...base, args: [...base.args, ...args] }, ctx.profileRoot, ['egress-proxy'], mode); return []; } catch (e) { return (e as ChromiumLaunchError).violations; } };
    assert.ok(viol(['--remote-debugging-port=0']).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol(['--enable-unsafe-extension-debugging']).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol(['--remote-debugging-port=9222'], { aiDevtools: true }).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol(['--remote-allow-origins=*'], { aiDevtools: true }).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol(['--remote-debugging-address=0.0.0.0'], { aiDevtools: true }).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol(['--no-sandbox'], { aiDevtools: true }).includes('FORBIDDEN_FLAG'));
    assert.deepEqual(viol([...AI_DEVTOOLS_ARGS], { aiDevtools: true }), []);
  });
});
