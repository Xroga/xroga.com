/**
 * Tests for the disposable Fly Machine provider.
 *
 * Three properties are worth more than the rest here, so they are asserted directly rather
 * than through the happy path:
 *
 * 1. **A machine cannot leak.** A machine that outlives its execution bills until someone
 *    notices, and this repository has already produced that failure once. The config must
 *    carry its own deadline and the delete must happen on every exit path.
 * 2. **No secret and no shell injection crosses into the guest.** The environment is the
 *    caller's, and command arguments are data, never script text.
 * 3. **An unreadable reply is not a success.** A missing exit code must read as "we do not
 *    know", never as 0.
 *
 * **What a stub cannot tell you.** These run against a recorded fetch, so they pin the
 * request this module *sends*; they cannot confirm Fly accepts it or that the guest behaves.
 * That half was checked separately against real machines in `xroga-sandbox`, each destroyed
 * after, and it found two things no stub would have:
 *
 * - `mkdir -p /work` is required. A bare `cd /work` failed with exit 2 whenever no request
 *   file happened to create that directory. Pinned by "creates /work before entering it".
 * - The egress-denial check needs a control. The first version fetched an IPv4-only host
 *   that was unreachable with *or* without `unshare -n`, so it passed while proving nothing.
 *   Re-run against the npm registry it showed a real difference: reachable without the
 *   wrapper, denied with it. These machines egress over IPv6.
 *
 * Also confirmed live: base64 file injection lands at the requested guest path, the exec
 * reply field really is `exit_code`, and an argument containing `; touch /tmp/PWNED` was
 * echoed as literal text with no such file created.
 */

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  FlyMachineSandboxRuntime,
  buildExecCommand,
  flyMachineSandboxFromEnvironment,
  readExecExitCode,
} from './flyMachineSandbox.js';
import {
  configureFlyMachineSandboxProvider,
  listSandboxProviders,
  setSandboxProvidersForTesting,
} from './sandboxProviders.js';
import { buildSandboxEnvironment } from './sandboxEnvironment.js';
import { DEFAULT_SANDBOX_LIMITS, type SandboxExecutionRequest } from './sandboxTypes.js';

/** Records every call and lets a test choose the reply per URL. */
function stubFly(
  reply: (url: string, init: RequestInit) => { status?: number; body?: unknown } = () => ({}),
) {
  const calls: Array<{ url: string; method: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, method: String(init.method ?? 'GET'), init });
    const { status = 200, body } = reply(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body ?? {},
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

/** The reply shape a healthy create → wait → exec sequence produces. */
function happyPath(url: string) {
  if (url.endsWith('/machines') ) return { body: { id: 'mach-1' } };
  if (url.includes('/wait')) return { body: { ok: true } };
  if (url.endsWith('/exec')) {
    return { body: { exit_code: 0, stdout: 'built', stderr: '' } };
  }
  return { body: { ok: true } };
}

function runtime(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) {
  return new FlyMachineSandboxRuntime({
    app: 'xroga-sandbox',
    token: 'fly-token-must-not-leak',
    fetchImpl,
    ...overrides,
  });
}

function request(overrides: Partial<SandboxExecutionRequest> = {}): SandboxExecutionRequest {
  return {
    files: [{ path: 'index.js', content: 'console.log(1)' }],
    command: 'npm',
    args: ['run', 'build'],
    timeoutMs: 60_000,
    networkPolicy: 'none',
    environment: buildSandboxEnvironment(),
    limits: DEFAULT_SANDBOX_LIMITS,
    ...overrides,
  };
}

describe('a sandbox machine cannot outlive its execution', () => {
  it('destroys the machine after a successful run', async () => {
    const { calls, fetchImpl } = stubFly(happyPath);
    await runtime(fetchImpl).execute(request());

    const deleted = calls.find((c) => c.method === 'DELETE');
    assert.ok(deleted, 'a machine that is not deleted bills until someone notices');
    assert.match(deleted.url, /\/machines\/mach-1\?force=true$/);
  });

  it('destroys the machine even when exec fails', async () => {
    const { calls, fetchImpl } = stubFly((url) =>
      url.endsWith('/exec') ? { status: 500 } : happyPath(url),
    );
    const result = await runtime(fetchImpl).execute(request());

    assert.equal(result.exitCode, null);
    assert.ok(calls.some((c) => c.method === 'DELETE'), 'a failed run must still be cleaned up');
  });

  it('destroys the machine when the transport throws mid-execution', async () => {
    const calls: string[] = [];
    let created = false;
    const fetchImpl = (async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input);
      const method = String(init.method ?? 'GET');
      calls.push(`${method} ${url}`);
      if (!created && url.endsWith('/machines') && method === 'POST') {
        created = true;
        return { ok: true, status: 200, json: async () => ({ id: 'mach-1' }) } as Response;
      }
      if (method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
      }
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;

    const result = await runtime(fetchImpl).execute(request());

    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /transport failed/i);
    assert.ok(
      calls.some((c) => c.startsWith('DELETE')),
      'the finally block is the only cleanup that runs on a thrown transport error',
    );
  });

  it('gives the machine its own deadline, so a crashed API still cannot leak it', () => {
    const config = runtime(stubFly().fetchImpl).buildMachineConfig(
      request({ timeoutMs: 60_000 }),
    ) as { config: Record<string, unknown> };

    const init = config.config.init as { exec: string[] };
    assert.equal(init.exec[0], '/bin/sleep');
    // 60s timeout + 60s grace. The number matters less than that it is finite.
    const seconds = Number(init.exec[1]);
    assert.ok(Number.isFinite(seconds), 'an infinite sleep would leak on an API crash');
    assert.ok(seconds > 60 && seconds <= 300, `sleep was ${seconds}s`);
    assert.equal(config.config.auto_destroy, true, 'auto_destroy is what collects it');
  });

  it('never restarts a failed process, which is how the earlier incident billed', () => {
    const config = runtime(stubFly().fetchImpl).buildMachineConfig(request()) as {
      config: { restart: { policy: string } };
    };
    assert.equal(config.config.restart.policy, 'no');
  });

  it('declares no services, so the machine is unreachable for its whole life', () => {
    const config = runtime(stubFly().fetchImpl).buildMachineConfig(request()) as {
      config: Record<string, unknown>;
    };
    assert.equal(config.config.services, undefined);
  });

  it('does not create a machine at all when only probing', async () => {
    const { calls, fetchImpl } = stubFly(() => ({ body: [] }));
    await runtime(fetchImpl).probe();
    assert.ok(
      !calls.some((c) => c.method === 'POST'),
      'a probe that created a machine would bill on every health check',
    );
  });
});

describe('nothing secret and nothing executable crosses into the guest', () => {
  it('sends the caller environment only, never process.env', async () => {
    process.env.XROGA_SENTINEL_SERVICE_ROLE_KEY = 'sk-sentinel-must-not-travel';
    try {
      const { calls, fetchImpl } = stubFly(happyPath);
      await runtime(fetchImpl).execute(request());

      const created = calls.find((c) => c.method === 'POST' && c.url.endsWith('/machines'));
      const raw = String(created!.init.body);
      assert.ok(!raw.includes('sk-sentinel-must-not-travel'), 'the secret value must not travel');
      assert.ok(!raw.includes('XROGA_SENTINEL_SERVICE_ROLE_KEY'), 'nor its name');
    } finally {
      delete process.env.XROGA_SENTINEL_SERVICE_ROLE_KEY;
    }
  });

  it('keeps the Fly token in a header, out of the URL and the body', async () => {
    const { calls, fetchImpl } = stubFly(happyPath);
    await runtime(fetchImpl).execute(request());

    for (const call of calls) {
      assert.ok(!call.url.includes('fly-token-must-not-leak'), 'a token in a URL lands in logs');
      assert.ok(!String(call.init.body ?? '').includes('fly-token-must-not-leak'));
      const headers = call.init.headers as Record<string, string>;
      assert.equal(headers.authorization, 'Bearer fly-token-must-not-leak');
    }
  });

  it('passes arguments as data, so a metacharacter cannot become a command', () => {
    const argv = buildExecCommand('npm', ['run', 'build; rm -rf /'], 'restricted');

    // The script text is fixed and contains none of the argument.
    assert.equal(argv[0], '/bin/sh');
    assert.equal(argv[1], '-c');
    assert.ok(!argv[2].includes('rm -rf'), 'the injected text must not reach the script');
    // The argument survives intact as its own argv element.
    assert.deepEqual(argv.slice(3), ['npm', 'run', 'build; rm -rf /']);
  });

  it('writes request files under /work as base64, and leaves absolute paths alone', () => {
    const config = runtime(stubFly().fetchImpl).buildMachineConfig(
      request({
        files: [
          { path: 'src/app.ts', content: 'export const a = 1;' },
          { path: '/etc/hosts', content: '127.0.0.1 localhost' },
        ],
      }),
    ) as { config: { files: Array<{ guest_path: string; raw_value: string }> } };

    assert.equal(config.config.files[0].guest_path, '/work/src/app.ts');
    assert.equal(config.config.files[1].guest_path, '/etc/hosts');
    assert.equal(
      Buffer.from(config.config.files[0].raw_value, 'base64').toString('utf8'),
      'export const a = 1;',
    );
  });

  it('refuses to sandbox inside the API app, which would inherit every secret', async () => {
    const withOwnApp = runtime(stubFly(happyPath).fetchImpl, {
      app: 'xroga-api',
      ownApp: 'xroga-api',
    });

    const availability = await withOwnApp.probe();
    assert.equal(availability.available, false);
    assert.equal(availability.reason, 'policy_disabled');

    const result = await withOwnApp.execute(request());
    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /production secrets/i);
  });
});

describe('egress is denied for the steps that should not have it', () => {
  it('runs a network-denied command in a fresh network namespace', () => {
    const argv = buildExecCommand('npm', ['run', 'build'], 'none');
    assert.match(argv[2], /unshare -n/, 'this is what replaces --network none');
  });

  it('leaves the network alone for registry-only, since npm install needs it', () => {
    const argv = buildExecCommand('npm', ['install'], 'registry-only');
    assert.ok(!argv[2].includes('unshare'), 'denying egress here would break installs');
  });

  it('creates /work before entering it, for both policies', () => {
    // Regression. /work only exists if a request file was written into it, so a bare `cd`
    // made a request with no relative-path files fail with exit 2 for a build that never
    // ran. Caught against a real Fly machine; a stub cannot see this.
    for (const policy of ['none', 'registry-only', 'restricted'] as const) {
      assert.match(
        buildExecCommand('npm', ['run', 'build'], policy)[2],
        /^mkdir -p \/work && cd \/work/,
        `${policy} must not assume /work already exists`,
      );
    }
  });

  it('reports that it can deny the network, because it can', async () => {
    const { fetchImpl } = stubFly(() => ({ body: [] }));
    const availability = await runtime(fetchImpl).probe();
    assert.equal(availability.available, true);
    assert.equal(availability.networkIsolation, true);
  });
});

describe('an unreadable exec reply is never a success', () => {
  it('reads a missing exit code as unknown rather than zero', () => {
    assert.equal(readExecExitCode({ exit_code: 0 }), 0);
    assert.equal(readExecExitCode({ exitCode: 3 }), 3);
    assert.equal(readExecExitCode({}), null);
    assert.equal(readExecExitCode({ exit_code: 'ok' }), null);
    assert.equal(readExecExitCode({ exit_code: null }), null);
  });

  it('does not claim success when Fly returns no exit code', async () => {
    const { fetchImpl } = stubFly((url) =>
      url.endsWith('/exec') ? { body: { stdout: 'looks fine' } } : happyPath(url),
    );
    const result = await runtime(fetchImpl).execute(request());
    assert.equal(result.exitCode, null, 'a missing exit code must not read as 0');
  });

  it('treats a machine that never starts as not run', async () => {
    const { fetchImpl } = stubFly((url) =>
      url.includes('/wait') ? { status: 408 } : happyPath(url),
    );
    const result = await runtime(fetchImpl).execute(request());
    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /started state/i);
  });

  it('treats a create failure as not run, and does not try to delete nothing', async () => {
    const { calls, fetchImpl } = stubFly((url, init) =>
      url.endsWith('/machines') && init.method === 'POST' ? { status: 422 } : happyPath(url),
    );
    const result = await runtime(fetchImpl).execute(request());
    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /HTTP 422/);
    assert.ok(!calls.some((c) => c.method === 'DELETE'));
  });

  it('refuses when Fly returns a machine with no id', async () => {
    const { fetchImpl } = stubFly((url) =>
      url.endsWith('/machines') ? { body: { ok: true } } : happyPath(url),
    );
    const result = await runtime(fetchImpl).execute(request());
    assert.equal(result.exitCode, null);
    assert.match(result.stderr, /machine id/i);
  });

  it('keeps the tail of oversized output, where a build prints its error', async () => {
    const { fetchImpl } = stubFly((url) =>
      url.endsWith('/exec')
        ? {
            body: {
              exit_code: 1,
              stdout: 'x'.repeat(50_000),
              stderr: `${'noise\n'.repeat(9_000)}error TS2345: the line that matters`,
            },
          }
        : happyPath(url),
    );
    const result = await runtime(fetchImpl).execute(request());
    assert.equal(result.stdout.length, 40_000);
    assert.match(result.stderr, /error TS2345: the line that matters$/);
  });

  it('maps an unauthorized probe to policy, not to an outage', async () => {
    const { fetchImpl } = stubFly(() => ({ status: 401 }));
    const availability = await runtime(fetchImpl).probe();
    assert.equal(availability.available, false);
    assert.equal(availability.reason, 'policy_disabled');
  });
});

describe('configuration is opt-in and costs nothing until set', () => {
  afterEach(() => setSandboxProvidersForTesting(null));

  it('builds nothing without both an app and a token', () => {
    assert.equal(flyMachineSandboxFromEnvironment({}), null);
    assert.equal(flyMachineSandboxFromEnvironment({ XROGA_SANDBOX_FLY_APP: 'a' }), null);
    assert.equal(flyMachineSandboxFromEnvironment({ XROGA_SANDBOX_FLY_TOKEN: 't' }), null);
  });

  it('registers nothing when unconfigured', () => {
    setSandboxProvidersForTesting([]);
    assert.equal(configureFlyMachineSandboxProvider({}), null);
    assert.deepEqual(listSandboxProviders(), []);
  });

  it('registers at most once', () => {
    setSandboxProvidersForTesting([]);
    const env = { XROGA_SANDBOX_FLY_APP: 'xroga-sandbox', XROGA_SANDBOX_FLY_TOKEN: 't' };
    assert.ok(configureFlyMachineSandboxProvider(env));
    assert.equal(configureFlyMachineSandboxProvider(env), null, 'must not double-register');
    assert.equal(listSandboxProviders().filter((n) => n === 'fly-machine').length, 1);
  });

  it('registers behind the container providers, never in front of them', () => {
    // The bug this pins: `registerSandboxProvider` unshifts, so registering later put this
    // provider *ahead* of Docker. A container drops privileges and mounts root read-only
    // and this cannot, so preferring it would have silently weakened any machine that had
    // a container runtime available.
    setSandboxProvidersForTesting(null);
    const before = listSandboxProviders();
    configureFlyMachineSandboxProvider({
      XROGA_SANDBOX_FLY_APP: 'xroga-sandbox',
      XROGA_SANDBOX_FLY_TOKEN: 't',
    });
    const after = listSandboxProviders();

    assert.equal(after[after.length - 1], 'fly-machine', 'must be last, not first');
    assert.deepEqual(after.slice(0, before.length), before, 'existing order must be untouched');
  });

  it('rounds memory to a multiple of 256, which Fly requires', () => {
    const config = runtime(stubFly().fetchImpl).buildMachineConfig(
      request({ limits: { ...DEFAULT_SANDBOX_LIMITS, memoryMb: 300 } }),
    ) as { config: { guest: { memory_mb: number } } };
    assert.equal(config.config.guest.memory_mb, 512);
  });
});
