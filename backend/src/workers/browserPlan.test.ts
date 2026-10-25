import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBrowserJob } from './browserJob.js';
import { BrowserPlanError, evaluatePostconditions, parseBrowserPlan } from './browserPlan.js';
import { aiDevtoolsArgs, assertLaunchSafe, buildChromiumLaunch, ChromiumLaunchError, STAGEHAND_EXTENSION_ID } from './chromiumLaunch.js';

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

describe('launch policy: AI mode is the only DevTools exception, and a narrow, matched one', () => {
  const ctx = { profileRoot: '/run/xroga/profiles', proxy: { host: 'egress-proxy', port: 3128, username: 'job1', password: 'p'.repeat(32) } };
  it('the Stagehand runtime extension id is the one Chromium reported for the image path', () => {
    assert.equal(STAGEHAND_EXTENSION_ID, 'pgfpmmndcidciloohojhmoamdjjeifdf');
  });
  it('adds the matched set only when asked: random port, exact bypass, exact extension origin', () => {
    const plain = buildChromiumLaunch(job(), ctx);
    assert.ok(!plain.args.some((a) => a.startsWith('--remote-')));
    assert.equal(plain.proxy.bypass, '<-loopback>');
    assert.equal(plain.ignoreDefaultArgs, undefined);
    const ai = buildChromiumLaunch(job({ maxModelCostMicros: 10 }), ctx, { aiDevtools: true });
    const port = Number(ai.args.find((a) => a.startsWith('--remote-debugging-port='))!.split('=')[1]);
    assert.ok(port >= 20_000 && port <= 59_999);
    assert.equal(ai.proxy.bypass, `<-loopback>,127.0.0.1:${port}`);
    assert.ok(ai.args.includes(`--remote-allow-origins=chrome-extension://${STAGEHAND_EXTENSION_ID}`));
    assert.deepEqual(ai.ignoreDefaultArgs, ['--disable-extensions']);
  });
  it('refuses every mismatch or widening of the set, and the whole set outside AI mode', () => {
    const ai = buildChromiumLaunch(job({ maxModelCostMicros: 10 }), ctx, { aiDevtools: true, devtoolsPort: 31_337 });
    const base = buildChromiumLaunch(job(), ctx);
    const viol = (opts: object, mode: object = { aiDevtools: true }) => { try { assertLaunchSafe(opts, ctx.profileRoot, ['egress-proxy'], mode); return []; } catch (e) { return (e as ChromiumLaunchError).violations; } };
    assert.deepEqual(viol(ai), []);
    const origin = `--remote-allow-origins=chrome-extension://${STAGEHAND_EXTENSION_ID}`;
    const swap = (from: string, to: string) => ({ ...ai, args: ai.args.map((a) => (a === from ? to : a)) });
    assert.ok(viol(swap(origin, '--remote-allow-origins=*')).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol(swap(origin, '--remote-allow-origins=chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol(swap('--remote-debugging-port=31337', '--remote-debugging-port=9222')).length > 0);
    assert.ok(viol({ ...ai, proxy: { ...ai.proxy, bypass: '<-loopback>,127.0.0.1:31338' } }).includes('PROXY_BYPASS'));
    assert.ok(viol({ ...ai, proxy: { ...ai.proxy, bypass: '<-loopback>,127.0.0.1:31337;localhost' } }).includes('PROXY_BYPASS'));
    assert.ok(viol({ ...ai, args: [...ai.args, '--remote-debugging-port=31338'] }).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol({ ...ai, args: [...ai.args, '--remote-debugging-address=0.0.0.0'] }).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol({ ...ai, args: [...ai.args, '--load-extension=/tmp/x'] }).includes('FORBIDDEN_FLAG'));
    assert.ok(viol({ ...ai, args: [...ai.args, '--no-sandbox'] }).includes('FORBIDDEN_FLAG'));
    assert.ok(viol({ ...base, args: [...base.args, ...aiDevtoolsArgs(31_337)] }, {}).includes('DEVTOOLS_NETWORK'));
    assert.ok(viol({ ...base, proxy: { ...base.proxy, bypass: '<-loopback>,127.0.0.1:31337' } }, {}).includes('PROXY_BYPASS'));
    assert.ok(viol({ ...ai, ignoreDefaultArgs: true }).includes('DEFAULT_ARGS_IGNORED'));
    assert.ok(viol({ ...ai, ignoreDefaultArgs: ['--disable-extensions', '--disable-popup-blocking'] }).includes('DEFAULT_ARGS_IGNORED'));
    assert.ok(viol({ ...base, ignoreDefaultArgs: ['--disable-extensions'] }, {}).includes('DEFAULT_ARGS_IGNORED'));
  });
});
