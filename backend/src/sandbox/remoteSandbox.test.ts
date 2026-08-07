/**
 * Tests for the remote isolation worker provider.
 *
 * Two of these close R2.13's named requirements — a sentinel-secret isolation test and a
 * network-denial test — against a stub worker that records exactly what crossed the wire.
 * A stub is not a substitute for a provisioned worker (R7.6 still needs real
 * infrastructure), but it does verify the half that is ours: that the API sends no secret
 * and never downgrades an unreadable reply into a success.
 */

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  RemoteSandboxRuntime,
  isAcceptableWorkerUrl,
  readWorkerProbe,
  readWorkerResult,
  remoteSandboxFromEnvironment,
} from './remoteSandbox.js';
import {
  configureRemoteSandboxProvider,
  listSandboxProviders,
  selectSandboxProvider,
  setSandboxProvidersForTesting,
} from './sandboxProviders.js';
import { buildSandboxEnvironment } from './sandboxEnvironment.js';
import { DEFAULT_SANDBOX_LIMITS } from './sandboxTypes.js';

/** A stub worker that captures each request and replies with whatever the test wants. */
function stubWorker(reply: (path: string, init: RequestInit) => unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const body = reply(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const OK_RESULT = {
  exitCode: 0,
  stdout: 'built',
  stderr: '',
  timedOut: false,
  killedForLimit: false,
  durationMs: 12,
};

function request(overrides: Record<string, unknown> = {}) {
  return {
    files: [{ path: 'index.js', content: 'console.log(1)' }],
    command: 'npm',
    args: ['run', 'build'],
    timeoutMs: 1_000,
    networkPolicy: 'none' as const,
    environment: buildSandboxEnvironment(),
    limits: DEFAULT_SANDBOX_LIMITS,
    ...overrides,
  };
}

describe('R2.13: no secret crosses the wire to the worker', () => {
  it('sends the caller environment only, never process.env', async () => {
    // The sentinel: a real-shaped secret in the API's own environment.
    process.env.XROGA_SENTINEL_SERVICE_ROLE_KEY = 'sk-sentinel-must-not-travel';
    try {
      const { calls, fetchImpl } = stubWorker(() => OK_RESULT);
      const runtime = new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl });

      await runtime.execute(request());

      const sent = calls.find((c) => c.url.endsWith('/execute'));
      assert.ok(sent, 'the worker should have been called');
      const raw = String(sent.init.body);
      assert.ok(
        !raw.includes('sk-sentinel-must-not-travel'),
        'the sentinel secret value must not appear anywhere in the request',
      );
      assert.ok(
        !raw.includes('XROGA_SENTINEL_SERVICE_ROLE_KEY'),
        'not even the secret name should be sent',
      );
    } finally {
      delete process.env.XROGA_SENTINEL_SERVICE_ROLE_KEY;
    }
  });

  it('puts the token in a header, not the URL or the body', async () => {
    const { calls, fetchImpl } = stubWorker(() => OK_RESULT);
    const runtime = new RemoteSandboxRuntime({
      url: 'https://worker.example',
      token: 'worker-token-abc',
      fetchImpl,
    });

    await runtime.execute(request());

    const sent = calls.find((c) => c.url.endsWith('/execute'));
    assert.ok(sent);
    assert.ok(!sent.url.includes('worker-token-abc'), 'a token in the URL lands in access logs');
    assert.ok(!String(sent.init.body).includes('worker-token-abc'));
    const headers = sent.init.headers as Record<string, string>;
    assert.equal(headers.authorization, 'Bearer worker-token-abc');
  });
});

describe('R2.13: network policy reaches the worker intact', () => {
  it('forwards a network-denied policy rather than silently widening it', async () => {
    const { calls, fetchImpl } = stubWorker(() => OK_RESULT);
    const runtime = new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl });

    await runtime.execute(request({ networkPolicy: 'none' }));

    const body = JSON.parse(String(calls.find((c) => c.url.endsWith('/execute'))!.init.body));
    assert.equal(body.networkPolicy, 'none');
  });

  it('refuses a worker that admits it cannot deny the network', async () => {
    const { fetchImpl } = stubWorker(() => ({ ready: true, networkIsolation: false }));
    const runtime = new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl });

    const availability = await runtime.probe();
    assert.equal(availability.available, false);
    assert.equal(availability.reason, 'policy_disabled');
  });

  it('refuses to send code over plaintext http to a non-loopback host', async () => {
    const runtime = new RemoteSandboxRuntime({ url: 'http://worker.example' });
    const availability = await runtime.probe();
    assert.equal(availability.available, false);
    assert.match(availability.detail ?? '', /plaintext/i);
  });

  it('allows loopback http so the contract can be exercised without a certificate', () => {
    assert.equal(isAcceptableWorkerUrl('http://localhost:8080'), true);
    assert.equal(isAcceptableWorkerUrl('http://127.0.0.1:8080'), true);
    assert.equal(isAcceptableWorkerUrl('https://worker.example'), true);
    assert.equal(isAcceptableWorkerUrl('http://evil.example'), false);
    assert.equal(isAcceptableWorkerUrl('ftp://worker.example'), false);
    assert.equal(isAcceptableWorkerUrl('not a url'), false);
  });

  it('refuses a URL carrying credentials, which would print in error messages', () => {
    // Not stripped and accepted — refused. The URL is interpolated into transport error
    // text, so a failed connection to this would print the password.
    assert.equal(isAcceptableWorkerUrl('https://user:pass@worker.example'), false);
    assert.equal(isAcceptableWorkerUrl('https://token@worker.example'), false);
  });
});

describe('a worker explains itself but does not choose how much it says', () => {
  it('bounds a worker-supplied detail before it reaches a refusal message', () => {
    const availability = readWorkerProbe({ ready: false, detail: 'z'.repeat(5_000) }, 'w');
    assert.equal(availability.available, false);
    assert.ok(
      (availability.detail ?? '').length <= 501,
      `detail was ${availability.detail?.length} chars; an unbounded worker string should not reach a log`,
    );
  });

  it('falls back to its own wording when the worker sends a useless detail', () => {
    assert.match(
      readWorkerProbe({ ready: false, detail: '   ' }, 'w').detail ?? '',
      /did not report ready:true/,
    );
    assert.match(
      readWorkerProbe({ ready: false, detail: 42 }, 'w').detail ?? '',
      /did not report ready:true/,
    );
  });
});

describe('an unreadable worker reply is never a success', () => {
  it('rejects a reply missing the outcome fields', () => {
    assert.equal(readWorkerResult({ exitCode: 0 }), null);
    assert.equal(readWorkerResult({ ok: true }), null);
    assert.equal(readWorkerResult(null), null);
    assert.equal(readWorkerResult('done'), null);
  });

  it('keeps the tail of oversized output, where a build failure prints its reason', () => {
    const parsed = readWorkerResult({
      exitCode: 1,
      stdout: 'x'.repeat(50_000),
      stderr: `${'noise\n'.repeat(20_000)}error TS2345: the line that matters`,
      timedOut: false,
      killedForLimit: false,
      durationMs: 5,
    });
    assert.ok(parsed);
    assert.equal(parsed.stdout.length, 40_000);
    assert.match(parsed.stderr, /error TS2345: the line that matters$/);
  });

  it('accepts a null exitCode, because a signalled process has none', () => {
    const parsed = readWorkerResult({
      exitCode: null,
      timedOut: false,
      killedForLimit: true,
      durationMs: 5,
    });
    assert.ok(parsed);
    assert.equal(parsed.exitCode, null);
    assert.equal(parsed.killedForLimit, true);
  });

  it('reports "not run" rather than exit 0 when the reply does not conform', async () => {
    const { fetchImpl } = stubWorker(() => ({ ok: true }));
    const runtime = new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl });

    const result = await runtime.execute(request());
    assert.equal(result.exitCode, null, 'a malformed reply must not read as success');
    assert.match(result.stderr, /did not match the contract/i);
  });

  it('reports "not run" on an HTTP error rather than inventing an outcome', async () => {
    const { fetchImpl } = stubWorker(() => ({}), 500);
    const runtime = new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl });

    const result = await runtime.execute(request());
    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /HTTP 500/);
  });

  it('treats a transport failure as not run', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const runtime = new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl });

    const result = await runtime.execute(request());
    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /transport failed/i);
  });
});

describe('probing is fail-closed', () => {
  it('accepts only an explicit ready === true', () => {
    assert.equal(readWorkerProbe({ ready: true }, 'w').available, true);
    assert.equal(readWorkerProbe({ ready: 'true' }, 'w').available, false);
    assert.equal(readWorkerProbe({ ready: 1 }, 'w').available, false);
    assert.equal(readWorkerProbe({}, 'w').available, false);
    assert.equal(readWorkerProbe(null, 'w').available, false);
  });

  it('treats an unhealthy HTTP status as unavailable', async () => {
    const { fetchImpl } = stubWorker(() => ({ ready: true }), 503);
    const runtime = new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl });
    const availability = await runtime.probe();
    assert.equal(availability.available, false);
    assert.match(availability.detail ?? '', /503/);
  });
});

describe('configuration is opt-in and costs nothing until set', () => {
  afterEach(() => setSandboxProvidersForTesting(null));

  it('registers nothing when no worker URL is configured', () => {
    assert.equal(remoteSandboxFromEnvironment({}), null);
    setSandboxProvidersForTesting([]);
    assert.equal(configureRemoteSandboxProvider({}), null);
    assert.deepEqual(listSandboxProviders(), []);
  });

  it('registers the worker at the front of the preference order when configured', () => {
    setSandboxProvidersForTesting([]);
    const registered = configureRemoteSandboxProvider({
      XROGA_SANDBOX_WORKER_URL: 'https://worker.example',
    });
    assert.ok(registered);
    assert.equal(listSandboxProviders()[0], 'remote-worker');
  });

  it('does not register the same worker twice across restarts of configuration', () => {
    setSandboxProvidersForTesting([]);
    const env = { XROGA_SANDBOX_WORKER_URL: 'https://worker.example' };
    configureRemoteSandboxProvider(env);
    configureRemoteSandboxProvider(env);
    assert.equal(listSandboxProviders().filter((n) => n === 'remote-worker').length, 1);
  });

  it('still refuses execution when a configured worker is unreachable', async () => {
    const fetchImpl = (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch;
    setSandboxProvidersForTesting([
      new RemoteSandboxRuntime({ url: 'https://worker.example', fetchImpl }),
    ]);

    const selection = await selectSandboxProvider();
    assert.equal(selection.runtime, null, 'a broken worker must not be selected');
    assert.equal(selection.availability.available, false);
  });
});
