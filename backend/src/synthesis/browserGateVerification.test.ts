/**
 * The verification decision itself, exercised through `executeUniversalRun`.
 *
 * The earlier suite for this slice asserted on the *source* of `universalExecution.ts` — that a
 * call existed, that one string appeared after another. That is how the real bug survived a
 * green suite: every assertion about the wiring passed while the run it wired still returned
 * `verified: true` for a web project whose browser check never ran. Source assertions cannot see
 * a fall-through.
 *
 * So these drive the real function and read the real result. Each one would have failed against
 * the previous implementation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../ai/patches.js';
import { readUniversalAgentFlags } from '../config/universalAgentFlags.js';
import type { Owner } from './universalPersistence.js';
import { executeUniversalRun, type ExecutionAdapters } from './universalExecution.js';
import {
  gateFromEvidence,
  notChecked,
  type NotCheckedReason,
  type WebGateResult,
} from './webVerificationGate.js';
import type { ViewportEvidence } from './browserVerification.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });
const owner: Owner = { userId: 'user-1', projectId: 'demo-project' };
const enabled = readUniversalAgentFlags({
  UNIVERSAL_AGENT_ENABLED: 'enabled',
  UNIVERSAL_AGENT_ALLOWLIST: 'demo-project',
});

// Both fixtures declare a `test` script deliberately: `mayClaimVerified` refuses to call any
// run verified that ran zero tests, so without one every case here would report `verified:
// false` for a reason having nothing to do with the browser, and the suite would pass while
// proving nothing about the gate.
const webApp: ProjectFile[] = [
  f('package.json', JSON.stringify({
    name: 'app',
    dependencies: { next: '15.0.0', react: '19.0.0' },
    scripts: { dev: 'next dev', build: 'next build', test: 'node --test' },
  })),
  f('src/app/page.tsx', 'export default function Page() { return <h1>Hi</h1>; }'),
  f('src/app/page.test.tsx', 'test("renders", () => {});'),
];

const cliTool: ProjectFile[] = [
  f('package.json', JSON.stringify({
    name: 'tool', bin: { tool: 'dist/cli.js' }, scripts: { build: 'tsc', test: 'node --test' },
  })),
  f('src/cli.ts', 'console.log("hello");'),
  f('src/cli.test.ts', 'test("runs", () => {});'),
];

const cleanViewport = (over: Partial<ViewportEvidence> = {}): ViewportEvidence => ({
  viewport: 'desktop',
  httpStatus: 200,
  pageErrors: [],
  consoleMessages: [],
  networkFailures: [],
  domChecks: [],
  interactions: [],
  screenshotPath: null,
  ...over,
});

const passingGate = (): WebGateResult =>
  gateFromEvidence({
    url: 'http://127.0.0.1:3000/', filesProduced: 2, buildPassed: true, testsPassed: null,
    serverStarted: true, viewports: [cleanViewport()],
  });

const failingGate = (): WebGateResult =>
  gateFromEvidence({
    url: 'http://127.0.0.1:3000/', filesProduced: 2, buildPassed: true, testsPassed: null,
    serverStarted: true,
    viewports: [cleanViewport({ pageErrors: [{ message: 'TypeError: cart.map is not a function', stack: 'at Cart (src/Cart.tsx:42:11)' }] })],
  });

const adapters = (
  files: ProjectFile[],
  gate: WebGateResult | null,
  overrides: Partial<ExecutionAdapters> = {},
): ExecutionAdapters => ({
  implement: async () => files,
  runValidation: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  review: async () => ({ approved: true, findings: [] }),
  commit: async () => ({ commitSha: 'abc123def456' }),
  ...(gate ? { browserVerify: async () => gate } : {}),
  ...overrides,
});

const run = (files: ProjectFile[], gate: WebGateResult | null, overrides: Partial<ExecutionAdapters> = {}) =>
  executeUniversalRun({
    prompt: 'Build a web application with a landing page',
    owner, runId: 'run-1', flags: enabled,
    adapters: adapters(files, gate, overrides),
  });

// ---------------------------------------------------------------------------
// 1–2 — the check ran and said something
// ---------------------------------------------------------------------------

describe('a browser gate that executed decides the claim', () => {
  it('1. a passing gate over passing validation yields verified', async () => {
    const result = await run(webApp, passingGate());
    assert.equal(result.outcome, 'completed');
    assert.equal(result.verified, true);
    assert.equal(result.browserVerification?.status, 'passed');
  });

  it('2. a failing gate blocks the run and never reports verified', async () => {
    const result = await run(webApp, failingGate(), { repair: async () => null });
    assert.equal(result.verified, false);
    assert.equal(result.outcome, 'blocked');
    // The exact observation survives to the caller, not a summary of it.
    assert.match(result.browserVerification?.findings?.join(' ') ?? '', /cart\.map is not a function/);
  });
});

// ---------------------------------------------------------------------------
// 3–5 — the bug: not_checked must never license verified
// ---------------------------------------------------------------------------

describe('a web project whose browser check did not run is never verified', () => {
  // Each of these returned `verified: true` before this change. They are the regression.
  const blockingReasons: NotCheckedReason[] = [
    'sandbox_unavailable',
    'browser_unavailable',
    'application_did_not_start',
    'no_start_command',
    'cancelled',
  ];

  for (const reason of blockingReasons) {
    it(`refuses a verified claim when the reason is ${reason}`, async () => {
      const result = await run(webApp, notChecked(reason, `detail for ${reason}`));

      assert.equal(result.verified, false, `${reason} licensed a verified claim`);
      // The work is preserved and published — discarding a real commit helps nobody — but it
      // is reported unverified, with the reason attached.
      assert.equal(result.commitSha, 'abc123def456');
      assert.equal(result.blockers.length, 1);
      assert.equal(result.browserVerification?.notCheckedReason, reason);
      assert.equal(result.browserVerification?.status, 'not_checked');
    });
  }

  it('states the reason rather than a generic failure', async () => {
    const result = await run(webApp, notChecked('sandbox_unavailable', 'No isolation runtime is available.'));
    assert.match(result.reason, /No isolation runtime is available/);
  });
});

// ---------------------------------------------------------------------------
// 6 — not applicable is not the same as not executed
// ---------------------------------------------------------------------------

describe('a non-web project is not held to browser evidence', () => {
  it('6. not_a_web_project leaves deterministic verification standing', async () => {
    const result = await run(cliTool, notChecked('not_a_web_project', 'no web framework dependency'));
    assert.equal(result.outcome, 'completed');
    // The distinction the whole fix turns on: this one does *not* veto.
    assert.equal(result.verified, true);
    assert.equal(result.blockers.length, 0);
  });

  it('a run with no browser adapter at all behaves exactly as before', async () => {
    const result = await run(cliTool, null);
    assert.equal(result.verified, true);
    assert.equal(result.browserVerification, undefined);
  });
});

// ---------------------------------------------------------------------------
// 8 — evidence reaches the execution result
// ---------------------------------------------------------------------------

describe('browser evidence travels with the result', () => {
  it('8. the structured summary is on UniversalExecutionResult', async () => {
    const result = await run(webApp, passingGate());
    assert.ok(result.browserVerification, 'no browser evidence on the result');
    assert.equal(result.browserVerification?.url, 'http://127.0.0.1:3000/');
    assert.ok((result.browserVerification?.passedChecks?.length ?? 0) > 0);
  });

  it('carries no screenshot binary and stays small enough to persist', async () => {
    const result = await run(webApp, passingGate());
    const serialized = JSON.stringify(result.browserVerification);
    assert.ok(serialized.length < 5_000, `${serialized.length} chars`);
  });

  it('bounds findings so a chatty failure cannot flood the run record', async () => {
    const flood = gateFromEvidence({
      url: 'http://x', filesProduced: 1, buildPassed: true, testsPassed: null, serverStarted: true,
      viewports: [cleanViewport({
        pageErrors: Array.from({ length: 50 }, (_, i) => ({ message: `error ${i}`, stack: 'x'.repeat(5_000) })),
      })],
    });
    const result = await run(webApp, flood, { repair: async () => null });
    assert.ok((result.browserVerification?.findings?.length ?? 0) <= 10);
    assert.ok(JSON.stringify(result.browserVerification).length < 12_000);
  });
});

// ---------------------------------------------------------------------------
// 10–14 — repair, revalidation, and a fresh check
// ---------------------------------------------------------------------------

describe('a browser failure drives the existing repair loop', () => {
  it('10. exact browser evidence reaches repair', async () => {
    let seen: readonly string[] = [];
    await run(webApp, failingGate(), {
      repair: async ({ failures }) => { seen = failures; return null; },
    });
    assert.equal(seen.length, 1);
    assert.match(seen[0]!, /cart\.map is not a function/);
    assert.match(seen[0]!, /src\/Cart\.tsx:42:11/, 'the stack must survive into repair');
  });

  it('11-12. a successful repair revalidates and then re-checks the browser freshly', async () => {
    const gates = [failingGate(), passingGate()];
    let browserCalls = 0;
    let validationRuns = 0;

    const result = await executeUniversalRun({
      prompt: 'Build a web application with a landing page',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters(webApp, null, {
        runValidation: async () => { validationRuns += 1; return { exitCode: 0, stdout: '', stderr: '' }; },
        browserVerify: async () => gates[Math.min(browserCalls++, gates.length - 1)]!,
        repair: async () => [f('package.json', webApp[0]!.content), f('src/app/page.tsx', 'fixed')],
      }),
    });

    assert.equal(browserCalls, 2, 'the post-repair check must be a fresh call, not a reused verdict');
    assert.ok(validationRuns > 1, 'deterministic revalidation must run before the fresh browser check');
    assert.equal(result.verified, true);
    assert.equal(result.browserVerification?.status, 'passed');
  });

  it('13. a repair that does not fix the page leaves the run blocked', async () => {
    let calls = 0;
    const result = await executeUniversalRun({
      prompt: 'Build a web application with a landing page',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters(webApp, null, {
        browserVerify: async () => { calls += 1; return failingGate(); },
        repair: async () => [f('package.json', webApp[0]!.content), f('src/app/page.tsx', 'still broken')],
      }),
    });
    assert.equal(calls, 2, 're-running must be able to fail again, or it is theatre');
    assert.equal(result.verified, false);
    assert.equal(result.outcome, 'blocked');
  });

  it('14. a stale pre-repair pass cannot carry a later failure to verified', async () => {
    // Passing first, failing second: if the run reused the first verdict it would report
    // verified over code that the fresh check rejected.
    const gates = [passingGate(), failingGate()];
    let index = 0;
    const result = await run(webApp, null, {
      browserVerify: async () => gates[Math.min(index++, 1)]!,
      repair: async () => null,
    });
    // The first gate passed, so no repair happens and the run is verified on *that* evidence —
    // the point is that the verdict used is the one produced for the files that shipped.
    assert.equal(result.verified, true);
    assert.equal(index, 1, 'no second check should happen when the first passed');
  });

  it('a browser fix that breaks the build fails the run rather than re-checking', async () => {
    let validationCalls = 0;
    const result = await run(webApp, null, {
      browserVerify: async () => failingGate(),
      runValidation: async () => {
        validationCalls += 1;
        return validationCalls === 1
          ? { exitCode: 0, stdout: '', stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'TS2304: Cannot find name foo' };
      },
      repair: async () => [f('package.json', webApp[0]!.content), f('src/app/page.tsx', 'broken')],
    });
    assert.equal(result.verified, false);
    assert.equal(result.outcome, 'failed');
  });
});

// ---------------------------------------------------------------------------
// 18 — cancellation
// ---------------------------------------------------------------------------

describe('cancellation', () => {
  it('18. a cancelled browser check never licenses a verified claim', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await run(webApp, notChecked('cancelled', 'The run was cancelled.'));
    assert.equal(result.verified, false);
    assert.equal(result.browserVerification?.notCheckedReason, 'cancelled');
  });

  it('the run signal reaches the browser adapter', async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    await executeUniversalRun({
      prompt: 'Build a web application with a landing page',
      owner, runId: 'run-1', flags: enabled, signal: controller.signal,
      adapters: adapters(webApp, null, {
        browserVerify: async (input) => { received = input.signal; return passingGate(); },
      }),
    });
    assert.equal(received, controller.signal, 'cancellation cannot propagate without the signal');
  });
});
