import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerExecutionPort } from './workerExecutionPort.js';
import { SandboxUnavailableError, type SandboxExecutionRequest, type SandboxExecutionResult, type SandboxRuntime } from './sandboxTypes.js';
import { runTests, type TestPlan } from '../existingSource/change/testRunner.js';

const ok = (stdout = ''): SandboxExecutionResult => ({ exitCode: 0, stdout, stderr: '', timedOut: false, killedForLimit: false, durationMs: 10 });
const notRun = (why: string): SandboxExecutionResult => ({ exitCode: null, stdout: '', stderr: `Isolation worker ${why}; generated code was not run.`, timedOut: false, killedForLimit: false, durationMs: 1 });

/** A worker that runs every stage it is given and reports each one, as the real worker does. A stage's result can be overridden by id. */
function fakeRuntime(over: Record<string, Partial<SandboxExecutionResult>> = {}, handler?: (r: SandboxExecutionRequest) => SandboxExecutionResult) {
  const calls: SandboxExecutionRequest[] = [];
  const runtime = {
    name: 'remote-worker', probe: async () => ({ available: true, runtime: 'remote-worker' }),
    execute: async (r: SandboxExecutionRequest): Promise<SandboxExecutionResult> => {
      calls.push(r);
      if (handler) return handler(r);
      const stages: NonNullable<SandboxExecutionResult['stages']> = [];
      for (const s of r.stages ?? []) { const result = { ...ok(`ran ${s.id}`), ...(over[s.id] ?? {}), id: s.id, networkPolicy: s.networkPolicy }; stages.push(result); if (result.exitCode !== 0) break; }
      return { ...stages[stages.length - 1]!, stages };
    },
  } as unknown as SandboxRuntime;
  return { runtime, calls };
}
const portFor = (runtime: SandboxRuntime, extra: object = {}) => createWorkerExecutionPort({ runtime: async () => runtime, retryDelayMs: 1, ...extra });
const simple = { files: [], command: 'node', args: [], timeoutMs: 1000, networkPolicy: 'none' as const, environment: {} };

const pythonPlan: TestPlan = {
  status: 'planned', runtime: 'python', roots: ['python:pkg'], reason: null,
  stages: [
    { id: 'install:pkg', label: 'pip install -r requirements.txt', command: 'python', args: ['-m', 'pip', 'install', '-r', 'requirements.txt'], cwd: 'pkg', networkPolicy: 'registry-only', timeoutMs: 120_000, kind: 'install' },
    { id: 'test:pkg', label: 'unittest (pkg)', command: 'python', args: ['-m', 'unittest', 'discover', '-v'], cwd: 'pkg', networkPolicy: 'none', timeoutMs: 60_000, kind: 'test' },
  ],
};

test('the whole plan is one worker request: ordered stages in their directories, python mapped to python3, the network only on the install stage', async () => {
  const { runtime, calls } = fakeRuntime();
  const result = await runTests({ port: portFor(runtime), files: [{ path: 'pkg/test_a.py', content: 'x' }], changedPaths: ['pkg/a.py'], plan: pythonPlan });
  assert.equal(result.status, 'passed');
  assert.equal(calls.length, 1, 'one container for install and test, so the installed packages are there for the test');
  assert.equal(calls[0].networkPolicy, 'registry-only');
  assert.deepEqual(calls[0].stages?.map((s) => [s.id, s.command, s.networkPolicy, s.cwd]), [['install:pkg', 'python3', 'registry-only', 'pkg'], ['test:pkg', 'python3', 'none', 'pkg']]);
});

test('an offline-only plan never asks for the network', async () => {
  const { runtime, calls } = fakeRuntime();
  const offline: TestPlan = { ...pythonPlan, stages: [pythonPlan.stages[1]!] };
  assert.equal((await runTests({ port: portFor(runtime), files: [], changedPaths: ['pkg/a.py'], plan: offline })).status, 'passed');
  assert.equal(calls[0].networkPolicy, 'none');
});

test('a failed install stops the run and reads as an environment problem; a failing test reads as a failure', async () => {
  const install = fakeRuntime({ 'install:pkg': { exitCode: 1, stderr: 'no matching distribution' } });
  assert.equal((await runTests({ port: portFor(install.runtime), files: [], changedPaths: ['pkg/a.py'], plan: pythonPlan })).status, 'error');
  const failing = fakeRuntime({ 'test:pkg': { exitCode: 1, stderr: 'FAILED' } });
  assert.equal((await runTests({ port: portFor(failing.runtime), files: [], changedPaths: ['pkg/a.py'], plan: pythonPlan })).status, 'failed');
});

test('a worker that could not run the stage, or could not prove its restriction, reads as "not run", never as a failing test', async () => {
  const down = fakeRuntime({}, () => notRun('transport failed: fetch failed'));
  assert.equal((await runTests({ port: portFor(down.runtime, { attempts: 2 }), files: [], changedPaths: ['pkg/a.py'], plan: pythonPlan })).status, 'unavailable');
  const unverified = fakeRuntime({}, () => notRun('could not verify its restricted-network stage'));
  assert.equal((await runTests({ port: portFor(unverified.runtime, { attempts: 1 }), files: [], changedPaths: ['pkg/a.py'], plan: pythonPlan })).status, 'unavailable');
});

test('a worker that ignores stages (an older one) has not run the plan: not run', async () => {
  const old = fakeRuntime({}, () => ok('only the first command ran'));
  assert.equal((await runTests({ port: portFor(old.runtime), files: [], changedPaths: ['pkg/a.py'], plan: pythonPlan })).status, 'unavailable');
});

test('a request refused before any code ran is repeated on a fresh container; a permanent refusal and a run that happened are not', async () => {
  let n = 0;
  const flaky = fakeRuntime({}, (r) => (++n < 3 ? notRun('returned HTTP 503') : { ...ok(), stages: [{ ...ok(), id: r.stages![0]!.id }] }));
  assert.equal((await portFor(flaky.runtime).execute(simple)).exitCode, 0);
  assert.equal(flaky.calls.length, 3);
  const refused = fakeRuntime({}, () => notRun('returned HTTP 400'));
  await assert.rejects(portFor(refused.runtime).execute(simple), SandboxUnavailableError);
  assert.equal(refused.calls.length, 1, 'a bad request is not repeated');
  const failing = fakeRuntime({ main: { exitCode: 1, stderr: 'AssertionError' } });
  await portFor(failing.runtime).execute(simple);
  assert.equal(failing.calls.length, 1, 'a failing test run is a result, not a retry');
});

test('stage budgets are scaled to fit the worker request limit, and the worker is never given more than its ceiling', async () => {
  const { runtime, calls } = fakeRuntime();
  const big: TestPlan = { ...pythonPlan, stages: pythonPlan.stages.map((s) => ({ ...s, timeoutMs: 600_000 })) };
  await runTests({ port: portFor(runtime), files: [], changedPaths: ['pkg/a.py'], plan: big });
  const sum = calls[0].stages!.reduce((n, s) => n + s.timeoutMs, 0);
  assert.ok(sum <= 800_000 && sum > 700_000, String(sum));
  assert.ok(calls[0].timeoutMs <= 600_000);
});
