import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemoteSandboxRuntime, readWorkerResult } from './remoteSandbox.js';
import { DEFAULT_SANDBOX_LIMITS } from './sandboxTypes.js';

const request = {
  files: [], command: 'python3', args: [], timeoutMs: 5_000, networkPolicy: 'registry-only' as const, environment: {}, limits: DEFAULT_SANDBOX_LIMITS,
  stages: [{ id: 'install', command: 'python3', args: ['-m', 'pip', 'install', 'x'], networkPolicy: 'registry-only' as const, timeoutMs: 3_000, cwd: 'a' }, { id: 'test', command: 'python3', args: [], networkPolicy: 'none' as const, timeoutMs: 1_000 }],
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function worker(health: unknown) {
  const seen: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    seen.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(input).includes('/health')) return json(health);
    return json({ exitCode: 0, stdout: '', stderr: '', timedOut: false, killedForLimit: false, durationMs: 5, stages: [{ id: 'install', exitCode: 0, stdout: 'ok', stderr: '', timedOut: false, killedForLimit: false, durationMs: 2, networkPolicy: 'registry-only' }] });
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}

test('a restricted-network request is sent only to a worker that proved the restriction, and carries its stages', async () => {
  const w = worker({ ready: true, networkIsolation: true, restrictedNetwork: true });
  const result = await new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl: w.fetchImpl, allowRestricted: true }).execute(request);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(w.seen.map((s) => s.url), ['https://worker.example/health?check=restricted', 'https://worker.example/execute']);
  const stages = w.seen[1].body!.stages as Array<Record<string, unknown>>;
  assert.deepEqual(stages.map((s) => [s.id, s.networkPolicy, s.cwd]), [['install', 'registry-only', 'a'], ['test', 'none', undefined]]);
  assert.equal(result.stages?.[0]?.id, 'install');
});

test('a worker that does not answer restrictedNetwork:true (missing, false, truthy string) gets no code and the result is "not run"', async () => {
  for (const health of [{ ready: true, networkIsolation: true }, { ready: true, networkIsolation: true, restrictedNetwork: false }, { ready: true, networkIsolation: true, restrictedNetwork: 'true' }, { ready: true, networkIsolation: false, restrictedNetwork: true }]) {
    const w = worker(health);
    const result = await new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl: w.fetchImpl, allowRestricted: true }).execute(request);
    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /^Isolation worker could not verify/);
    assert.ok(w.seen.every((s) => !s.url.endsWith('/execute')), 'no execute request was sent');
  }
});

test('a stage (not only the top-level policy) asking for the network is refused unless the option is set', async () => {
  const w = worker({ restrictedNetwork: true });
  await assert.rejects(new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl: w.fetchImpl }).execute({ ...request, networkPolicy: 'none' }), (e: { reason?: string }) => e.reason === 'policy_disabled');
  assert.equal(w.seen.length, 0);
});

test('the per-stage reply is read strictly: a malformed stage makes the whole reply untrusted', () => {
  const base = { exitCode: 0, stdout: '', stderr: '', timedOut: false, killedForLimit: false, durationMs: 1 };
  assert.equal(readWorkerResult({ ...base, stages: [{ id: 'a b', exitCode: 0, timedOut: false, killedForLimit: false, durationMs: 1 }] }), null);
  assert.equal(readWorkerResult({ ...base, stages: [{ id: 'a', exitCode: '0', timedOut: false, killedForLimit: false, durationMs: 1 }] }), null);
  assert.equal(readWorkerResult({ ...base, stages: 'x' }), null);
  assert.equal(readWorkerResult({ ...base, stages: [{ id: 'a', exitCode: 0, timedOut: false, killedForLimit: false, durationMs: 1 }] })?.stages?.length, 1);
});
