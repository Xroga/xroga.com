import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { setSandboxRuntimeForTesting } from '../../sandbox/sandboxRuntime.js';
import type { SandboxRuntime } from '../../sandbox/sandboxTypes.js';
import { ExistingSourceError } from '../types.js';
import { productionExecutionPort } from './production.js';

const runtime = (name: string): SandboxRuntime & { ran: number } => {
  const r = {
    name, ran: 0,
    probe: async () => ({ available: true, runtime: name, networkIsolation: true }),
    execute: async () => { r.ran += 1; return { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false, durationMs: 1 } as never; },
  };
  return r;
};
const request = { files: [{ path: 'package.json', content: '{}' }], command: 'npm', args: ['test'], timeoutMs: 1000, networkPolicy: 'none' } as never;

describe('the production execution port outside Google', () => {
  afterEach(() => { setSandboxRuntimeForTesting(null); delete process.env.XROGA_PROJECT_RUNTIME_PROVIDER; });

  it('refuses a plain container runtime, which would start an empty container and report a missing project as failing tests', async () => {
    for (const name of ['docker', 'podman']) {
      const r = runtime(name);
      setSandboxRuntimeForTesting(r);
      await assert.rejects(() => productionExecutionPort.execute(request), (e) => e instanceof ExistingSourceError && e.code === 'EXECUTION_UNAVAILABLE');
      assert.equal(r.ran, 0);
    }
  });

  it('refuses a staged plan on any non-Google runtime, and runs a plain request on a runtime that carries the files', async () => {
    const remote = runtime('remote');
    setSandboxRuntimeForTesting(remote);
    await assert.rejects(() => productionExecutionPort.execute({ ...(request as object), stages: [{ id: 'test' }] } as never), (e) => e instanceof ExistingSourceError);
    assert.equal(remote.ran, 0);
    const result = await productionExecutionPort.execute(request);
    assert.equal(result.exitCode, 0);
    assert.equal(remote.ran, 1);
  });
});
