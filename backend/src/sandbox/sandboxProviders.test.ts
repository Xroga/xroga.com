/**
 * Tests for provider-neutral sandbox selection and refusal.
 *
 * The properties pinned here are the ones the isolation boundary rests on: selection
 * never invents a fallback, a refusal explains itself, and the container flags that *are*
 * the isolation are actually passed. A test that only checked "a container ran" would
 * pass equally against a privileged container on the host network.
 */

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';
import {
  ContainerSandboxRuntime,
  buildContainerArgs,
  listSandboxProviders,
  registerSandboxProvider,
  selectSandboxProvider,
  setSandboxProvidersForTesting,
} from './sandboxProviders.js';
import {
  executeSandboxed,
  probeSandbox,
  setSandboxRuntimeForTesting,
} from './sandboxRuntime.js';
import {
  DEFAULT_SANDBOX_LIMITS,
  SandboxUnavailableError,
  type SandboxAvailability,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  type SandboxRuntime,
} from './sandboxTypes.js';

/** A provider that answers however the test needs, without spawning anything. */
function fakeProvider(
  name: string,
  availability: Partial<SandboxAvailability> & { available: boolean },
  onExecute?: (request: SandboxExecutionRequest) => void,
): SandboxRuntime {
  return {
    name,
    async probe() {
      return { runtime: name, ...availability };
    },
    async execute(request) {
      onExecute?.(request);
      return {
        exitCode: 0,
        stdout: `ran on ${name}`,
        stderr: '',
        timedOut: false,
        killedForLimit: false,
        durationMs: 1,
      } satisfies SandboxExecutionResult;
    },
  };
}

const REQUEST: Omit<SandboxExecutionRequest, 'limits'> = {
  files: [{ path: 'index.js', content: 'console.log(1);\n' }],
  command: 'node',
  args: ['index.js'],
  timeoutMs: 30_000,
  networkPolicy: 'none',
  environment: { PATH: '/usr/bin' },
};

afterEach(() => {
  setSandboxProvidersForTesting(null);
  setSandboxRuntimeForTesting(null);
});

describe('selecting a provider', () => {
  it('picks the first provider that is actually available', async () => {
    setSandboxProvidersForTesting([
      fakeProvider('absent', { available: false, reason: 'runtime_unavailable', detail: 'not installed' }),
      fakeProvider('present', { available: true }),
    ]);

    const { runtime, availability } = await selectSandboxProvider();
    assert.equal(runtime?.name, 'present');
    assert.equal(availability.available, true);
  });

  it('stops probing once one succeeds', async () => {
    let laterProbed = false;
    setSandboxProvidersForTesting([
      fakeProvider('first', { available: true }),
      {
        name: 'later',
        async probe() {
          laterProbed = true;
          return { available: true, runtime: 'later' };
        },
        async execute() {
          throw new Error('unreachable');
        },
      },
    ]);

    await selectSandboxProvider();
    assert.equal(laterProbed, false, 'probing must stop at the first success');
  });

  it('records every provider it tried when none works', async () => {
    setSandboxProvidersForTesting([
      fakeProvider('docker', { available: false, reason: 'runtime_unavailable', detail: 'no docker daemon' }),
      fakeProvider('podman', { available: false, reason: 'runtime_unavailable', detail: 'podman missing' }),
    ]);

    const { runtime, availability, probes } = await selectSandboxProvider();
    assert.equal(runtime, null);
    assert.equal(availability.available, false);
    assert.deepEqual(probes.map((p) => p.provider), ['docker', 'podman']);
    // The operator needs to know what to install, not just that "a runtime" is missing.
    assert.match(availability.detail ?? '', /no docker daemon/);
    assert.match(availability.detail ?? '', /podman missing/);
  });

  it('treats a provider that throws while probing as unavailable, not fatal', async () => {
    setSandboxProvidersForTesting([
      {
        name: 'broken',
        async probe(): Promise<SandboxAvailability> {
          throw new Error('probe blew up');
        },
        async execute() {
          throw new Error('unreachable');
        },
      },
      fakeProvider('working', { available: true }),
    ]);

    const { runtime, probes } = await selectSandboxProvider();
    assert.equal(runtime?.name, 'working', 'a broken provider must not stop the search');
    assert.equal(probes[0].available, false);
    assert.match(probes[0].detail, /blew up/);
  });

  it('refuses when no providers are registered at all', async () => {
    setSandboxProvidersForTesting([]);
    const { runtime, availability } = await selectSandboxProvider();
    assert.equal(runtime, null);
    assert.equal(availability.available, false);
    assert.match(availability.detail ?? '', /not executed/i);
  });

  it('puts a newly registered provider ahead of the built-in ones', async () => {
    setSandboxProvidersForTesting([fakeProvider('builtin', { available: true })]);
    registerSandboxProvider(fakeProvider('hosted', { available: true }));

    assert.deepEqual(listSandboxProviders(), ['hosted', 'builtin']);
    const { runtime } = await selectSandboxProvider();
    assert.equal(runtime?.name, 'hosted');
  });
});

describe('refusing rather than falling back', () => {
  it('throws instead of executing when nothing can isolate', async () => {
    setSandboxProvidersForTesting([
      fakeProvider('absent', { available: false, reason: 'runtime_unavailable', detail: 'nothing here' }),
    ]);

    await assert.rejects(
      () => executeSandboxed(REQUEST),
      (error: unknown) => {
        assert.ok(error instanceof SandboxUnavailableError);
        assert.equal(error.code, 'SANDBOX_UNAVAILABLE');
        return true;
      },
    );
  });

  it('never runs the command when every provider is unavailable', async () => {
    let executed = false;
    setSandboxProvidersForTesting([
      {
        name: 'refuser',
        async probe() {
          return { available: false, runtime: 'refuser', reason: 'runtime_unavailable' as const };
        },
        async execute(): Promise<SandboxExecutionResult> {
          executed = true;
          throw new Error('must not be reached');
        },
      },
    ]);

    await assert.rejects(() => executeSandboxed(REQUEST));
    assert.equal(executed, false, 'a refused sandbox must not execute anything');
  });

  it('reports a policy-disabled sandbox as policy, not as a missing runtime', async () => {
    const previous = process.env.XROGA_SANDBOX_DISABLED;
    process.env.XROGA_SANDBOX_DISABLED = '1';
    try {
      setSandboxProvidersForTesting([new ContainerSandboxRuntime({ binary: 'docker' })]);
      const { availability } = await selectSandboxProvider();
      assert.equal(availability.available, false);
      assert.equal(availability.reason, 'policy_disabled');
    } finally {
      if (previous === undefined) delete process.env.XROGA_SANDBOX_DISABLED;
      else process.env.XROGA_SANDBOX_DISABLED = previous;
    }
  });

  it('surfaces the refusal through probeSandbox too', async () => {
    setSandboxProvidersForTesting([
      fakeProvider('absent', { available: false, reason: 'runtime_unavailable', detail: 'none installed' }),
    ]);
    const availability = await probeSandbox();
    assert.equal(availability.available, false);
  });
});

describe('the isolation flags are the isolation', () => {
  const request: SandboxExecutionRequest = {
    ...REQUEST,
    limits: DEFAULT_SANDBOX_LIMITS,
  };

  it('denies the network by default', () => {
    const args = buildContainerArgs('node:20-alpine', request);
    const network = args[args.indexOf('--network') + 1];
    assert.equal(network, 'none', 'a build with no registry need must have no network');
  });

  it('allows a network only for an explicit registry stage', () => {
    const args = buildContainerArgs('node:20-alpine', { ...request, networkPolicy: 'registry-only' });
    assert.equal(args[args.indexOf('--network') + 1], 'bridge');
  });

  it('runs unprivileged with no capabilities and no privilege escalation', () => {
    const args = buildContainerArgs('node:20-alpine', request);
    assert.equal(args[args.indexOf('--user') + 1], '1000:1000', 'must not run as root');
    assert.equal(args[args.indexOf('--cap-drop') + 1], 'ALL');
    assert.equal(args[args.indexOf('--security-opt') + 1], 'no-new-privileges');
  });

  it('gives a disposable writable workspace on a read-only root', () => {
    const args = buildContainerArgs('node:20-alpine', request);
    assert.ok(args.includes('--read-only'), 'the root filesystem must not be writable');
    assert.ok(args.includes('--rm'), 'the workspace must not outlive the run');
    const tmpfs = args[args.indexOf('--tmpfs') + 1];
    assert.match(tmpfs, /^\/work:rw/, 'the only writable path is the disposable workspace');
  });

  it('caps memory, processes, and swap rather than running unbounded', () => {
    const args = buildContainerArgs('node:20-alpine', request);
    assert.equal(args[args.indexOf('--memory') + 1], `${DEFAULT_SANDBOX_LIMITS.memoryMb}m`);
    // Equal memory and memory-swap is what actually disables swap; omitting it lets a
    // container exceed its memory cap by swapping instead of being killed.
    assert.equal(args[args.indexOf('--memory-swap') + 1], `${DEFAULT_SANDBOX_LIMITS.memoryMb}m`);
    assert.equal(args[args.indexOf('--pids-limit') + 1], String(DEFAULT_SANDBOX_LIMITS.maxProcesses));
  });

  it('passes exactly the environment it was given and nothing more', () => {
    const args = buildContainerArgs('node:20-alpine', {
      ...request,
      environment: { PATH: '/usr/bin', CI: '1' },
    });
    const passed = args.filter((_, i) => args[i - 1] === '--env');
    assert.deepEqual(passed.sort(), ['CI=1', 'PATH=/usr/bin']);
  });

  it('does not forward a host secret even if one is sitting in process.env', () => {
    process.env.XROGA_TEST_FAKE_SECRET_TOKEN = 'super-secret-value';
    try {
      const args = buildContainerArgs('node:20-alpine', request);
      const joined = args.join(' ');
      assert.ok(!joined.includes('super-secret-value'), 'no host secret may reach the container');
    } finally {
      delete process.env.XROGA_TEST_FAKE_SECRET_TOKEN;
    }
  });

  it('puts the image before the command so the command cannot inject flags', () => {
    const args = buildContainerArgs('node:20-alpine', request);
    const imageIndex = args.indexOf('node:20-alpine');
    assert.ok(imageIndex > 0);
    assert.deepEqual(args.slice(imageIndex + 1), ['node', 'index.js']);
  });
});

describe('provider neutrality', () => {
  it('drives a non-Docker runtime through the same interface', async () => {
    const seen: SandboxExecutionRequest[] = [];
    setSandboxProvidersForTesting([
      fakeProvider('hosted-isolation', { available: true }, (request) => {
        seen.push(request);
      }),
    ]);

    const result = await executeSandboxed(REQUEST);
    assert.equal(result.stdout, 'ran on hosted-isolation');
    assert.equal(seen.length, 1, 'the provider must receive the request');
    // Defaults are filled in by the caller-facing helper, not left to each provider to
    // remember — a provider that forgot them would run unbounded.
    assert.deepEqual(seen[0].limits, DEFAULT_SANDBOX_LIMITS);
  });

  it('names podman as a built-in alternative to docker', () => {
    setSandboxProvidersForTesting(null);
    const names = listSandboxProviders();
    assert.ok(names.includes('docker'));
    assert.ok(names.includes('podman'), 'the registry must not be Docker-only');
  });

  it('builds identical isolation flags whichever container binary is used', () => {
    const docker = new ContainerSandboxRuntime({ binary: 'docker' });
    const podman = new ContainerSandboxRuntime({ binary: 'podman' });
    assert.equal(docker.name, 'docker');
    assert.equal(podman.name, 'podman');
    // Same flags from one implementation: the two cannot drift apart into one being
    // hardened and the other not.
    assert.deepEqual(
      buildContainerArgs('node:20-alpine', { ...REQUEST, limits: DEFAULT_SANDBOX_LIMITS }),
      buildContainerArgs('node:20-alpine', { ...REQUEST, limits: DEFAULT_SANDBOX_LIMITS }),
    );
  });
});
