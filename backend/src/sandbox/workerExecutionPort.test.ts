import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerExecutionPort } from './workerExecutionPort.js';
import { SandboxUnavailableError, type SandboxExecutionRequest, type SandboxExecutionResult, type SandboxRuntime } from './sandboxTypes.js';
import { runTests } from '../existingSource/change/testRunner.js';

const ok = (stdout = ''): SandboxExecutionResult => ({ exitCode: 0, stdout, stderr: '', timedOut: false, killedForLimit: false, durationMs: 10 });

function fakeRuntime(handler: (r: SandboxExecutionRequest) => SandboxExecutionResult) {
  const calls: SandboxExecutionRequest[] = [];
  const runtime = { name: 'remote-worker', probe: async () => ({ available: true, runtime: 'remote-worker' }), execute: async (r: SandboxExecutionRequest) => { calls.push(r); return handler(r); } } as unknown as SandboxRuntime;
  return { runtime, calls };
}

test('a staged offline plan runs one worker request per stage, in the stage directory, offline, with python mapped to python3', async () => {
  const { runtime, calls } = fakeRuntime(() => ok('ran'));
  const port = createWorkerExecutionPort({ runtime: async () => runtime });
  const files = [{ path: 'pkg/test_a.py', content: 'x' }];
  const result = await runTests({ port, files, changedPaths: ['pkg/a.py'], plan: { status: 'planned', runtime: 'python', roots: ['python:pkg'], reason: null, stages: [{ id: 'test:pkg', label: 'unittest (pkg)', command: 'python', args: ['-m', 'unittest', 'discover', '-v'], cwd: 'pkg', networkPolicy: 'none', timeoutMs: 60_000, kind: 'test' }] } });
  assert.equal(result.status, 'passed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].networkPolicy, 'none');
  assert.equal(calls[0].command, 'sh');
  assert.deepEqual(calls[0].args, ['-c', 'cd "$0" && exec "$@"', 'pkg', 'python3', '-m', 'unittest', 'discover', '-v']);
});

test('an install stage is refused as unavailable: nothing runs, and the result is "not run", never a pass', async () => {
  const { runtime, calls } = fakeRuntime(() => ok());
  const port = createWorkerExecutionPort({ runtime: async () => runtime });
  const result = await runTests({ port, files: [{ path: 'package.json', content: '{"scripts":{"test":"x"},"dependencies":{"a":"1"}}' }, { path: 'a.js', content: '' }], changedPaths: ['a.js'] });
  assert.equal(result.status, 'unavailable');
  assert.equal(calls.length, 0, 'no worker request was made for any stage, so no code ran with an open network');
  await assert.rejects(port.execute({ files: [], command: 'pip', args: [], timeoutMs: 1000, networkPolicy: 'registry-only', environment: {} }), SandboxUnavailableError);
});

test('a failing stage ends the run and later stages do not start', async () => {
  const { runtime, calls } = fakeRuntime(() => ({ ...ok(), exitCode: 1, stderr: 'FAILED' }));
  const port = createWorkerExecutionPort({ runtime: async () => runtime });
  const out = await port.execute({ files: [], command: 'node', args: [], timeoutMs: 1000, networkPolicy: 'none', environment: {}, stages: [
    { id: 'a', command: 'node', args: ['a'], networkPolicy: 'none', timeoutMs: 1000 }, { id: 'b', command: 'node', args: ['b'], networkPolicy: 'none', timeoutMs: 1000 }] });
  assert.equal(calls.length, 1);
  assert.deepEqual(out.stages?.map((s) => s.id), ['a']);
  assert.equal(out.exitCode, 1);
});

test('a worker that could not be reached or refused the request reads as "not run", never as a failing test', async () => {
  const { runtime } = fakeRuntime(() => ({ exitCode: null, stdout: '', stderr: 'Isolation worker transport failed: fetch failed', timedOut: false, killedForLimit: false, durationMs: 3 }));
  const port = createWorkerExecutionPort({ runtime: async () => runtime, retryDelayMs: 1 });
  const result = await runTests({ port, files: [{ path: 'a.py', content: '' }, { path: 'pyproject.toml', content: '' }], changedPaths: ['a.py'] });
  assert.equal(result.status, 'unavailable');
});

test('a request refused before any code ran is repeated on a fresh container; one that ran is never repeated', async () => {
  let n = 0;
  const flaky = fakeRuntime(() => (++n < 3 ? { exitCode: null, stdout: '', stderr: 'Isolation worker returned HTTP 503; generated code was not run.', timedOut: false, killedForLimit: false, durationMs: 1 } : ok('fine')));
  const port = createWorkerExecutionPort({ runtime: async () => flaky.runtime, retryDelayMs: 1 });
  assert.equal((await port.execute({ files: [], command: 'node', args: [], timeoutMs: 1000, networkPolicy: 'none', environment: {} })).stdout, 'fine');
  assert.equal(flaky.calls.length, 3);
  const failing = fakeRuntime(() => ({ ...ok(), exitCode: 1, stderr: 'AssertionError' }));
  await createWorkerExecutionPort({ runtime: async () => failing.runtime, retryDelayMs: 1 }).execute({ files: [], command: 'node', args: [], timeoutMs: 1000, networkPolicy: 'none', environment: {} });
  assert.equal(failing.calls.length, 1, 'a failing test run is a result, not a retry');
  const down = fakeRuntime(() => ({ exitCode: null, stdout: '', stderr: 'Isolation worker transport failed: x', timedOut: false, killedForLimit: false, durationMs: 1 }));
  await assert.rejects(createWorkerExecutionPort({ runtime: async () => down.runtime, retryDelayMs: 1, attempts: 2 }).execute({ files: [], command: 'node', args: [], timeoutMs: 1000, networkPolicy: 'none', environment: {} }), SandboxUnavailableError);
  assert.equal(down.calls.length, 2);
});
