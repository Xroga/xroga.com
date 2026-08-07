/**
 * Provider-neutral selection of an isolation runtime.
 *
 * The isolation boundary itself already existed; what did not was any way to reach it
 * other than Docker. `getSandboxRuntime()` returned `new DockerSandboxRuntime()`, so a
 * host with Podman, or a hosted isolation service, had no way in short of editing the
 * module. That coupling had two costs: an environment that *could* isolate refused
 * anyway, and — worse — the refusal blamed "no isolation runtime" when the truth was
 * "no Docker".
 *
 * A registry fixes both. Providers are tried in preference order, each is probed before
 * use, and the first genuinely available one wins. When none is available the refusal
 * names every provider tried and why each failed, so the operator learns what to install
 * or configure rather than being told a runtime is missing in the abstract.
 *
 * What this deliberately does not do is invent a fallback. Registering zero working
 * providers means execution is refused. There is no path through this module that runs
 * generated code outside a sandbox — that is the property the whole boundary rests on,
 * and a "temporary" degraded mode is exactly how such boundaries are lost.
 */

import { spawn } from 'child_process';
import { buildSandboxEnvironment } from './sandboxEnvironment.js';
import { remoteSandboxFromEnvironment } from './remoteSandbox.js';
import { flyMachineSandboxFromEnvironment } from './flyMachineSandbox.js';
import {
  SandboxUnavailableError,
  type SandboxAvailability,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  type SandboxRuntime,
} from './sandboxTypes.js';

const MAX_CAPTURE_BYTES = 40_000;

/**
 * Why a provider was not chosen, kept alongside its name.
 *
 * A list of these is the evidence behind a refusal. Reporting only the final "no runtime
 * available" throws away the one piece of information an operator needs.
 */
export interface ProviderProbe {
  provider: string;
  available: boolean;
  detail: string;
}

/**
 * A container CLI that speaks Docker's argument dialect.
 *
 * Podman is CLI-compatible with Docker for every flag used here, so one implementation
 * covers both rather than two near-identical classes drifting apart. The differences that
 * matter are the binary name and, for rootless Podman, that `--user` is already mapped
 * into an unprivileged namespace — the flag stays correct either way.
 */
export class ContainerSandboxRuntime implements SandboxRuntime {
  readonly name: string;
  private readonly binary: string;
  private readonly image: string;

  constructor(options: { name?: string; binary: string; image?: string }) {
    this.binary = options.binary;
    this.name = options.name ?? options.binary;
    this.image = options.image ?? 'node:20-alpine';
  }

  async probe(): Promise<SandboxAvailability> {
    if (process.env.XROGA_SANDBOX_DISABLED === '1') {
      return {
        available: false,
        runtime: this.name,
        reason: 'policy_disabled',
        detail: 'Sandboxing is disabled by XROGA_SANDBOX_DISABLED, so nothing was executed.',
      };
    }
    const ok = await canRun(this.binary, ['version']);
    return ok
      ? // `--network none` in buildContainerArgs is what backs this claim.
        { available: true, runtime: this.name, networkIsolation: true }
      : {
          available: false,
          runtime: this.name,
          reason: 'runtime_unavailable',
          detail: `\`${this.binary} version\` did not succeed, so ${this.name} cannot isolate this work.`,
        };
  }

  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const availability = await this.probe();
    if (!availability.available) throw new SandboxUnavailableError(availability);
    return runIsolated(this.binary, this.image, request);
  }
}

function canRun(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const child = spawn(command, args, {
        stdio: 'ignore',
        // The probe gets the scrubbed environment too — `docker version` has no more
        // business seeing a Supabase key than generated code does.
        env: buildSandboxEnvironment(),
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        done(false);
      }, 5_000);
      child.on('error', () => {
        clearTimeout(timer);
        done(false);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        done(code === 0);
      });
    } catch {
      done(false);
    }
  });
}

/**
 * Builds the container arguments.
 *
 * Exported because these flags *are* the isolation. A test that asserts on them is
 * asserting on the security property itself; asserting only that "a container ran" would
 * pass just as happily against a privileged container with the host network.
 */
export function buildContainerArgs(
  image: string,
  request: SandboxExecutionRequest,
): string[] {
  // Network is denied unless the stage explicitly needs a registry. A typecheck or a
  // production build has no legitimate reason to reach the network, and denying it
  // removes exfiltration as an option even if the environment allowlist were weakened.
  const network = request.networkPolicy === 'none' ? 'none' : 'bridge';

  const args = [
    'run',
    '--rm',
    '--network', network,
    '--user', '1000:1000',
    '--read-only',
    // The only writable surface, and it is memory-backed and destroyed with the
    // container — a disposable workspace, not a directory someone remembers to clean up.
    '--tmpfs', `/work:rw,size=${request.limits.diskMb}m,mode=1777`,
    '--memory', `${request.limits.memoryMb}m`,
    '--memory-swap', `${request.limits.memoryMb}m`,
    '--cpus', String(Math.max(1, Math.floor(request.limits.cpuSeconds / 60))),
    '--pids-limit', String(request.limits.maxProcesses),
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--workdir', '/work',
  ];

  for (const [name, value] of Object.entries(request.environment)) {
    args.push('--env', `${name}=${value}`);
  }

  args.push(image, request.command, ...request.args);
  return args;
}

async function runIsolated(
  binary: string,
  image: string,
  request: SandboxExecutionRequest,
): Promise<SandboxExecutionResult> {
  const started = Date.now();
  const args = buildContainerArgs(image, request);

  return new Promise<SandboxExecutionResult>((resolve) => {
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildSandboxEnvironment(),
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killedForLimit = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, request.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > MAX_CAPTURE_BYTES) {
        stdout = stdout.slice(-MAX_CAPTURE_BYTES);
        killedForLimit = true;
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > MAX_CAPTURE_BYTES) {
        stderr = stderr.slice(-MAX_CAPTURE_BYTES);
        killedForLimit = true;
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        killedForLimit,
        durationMs: Date.now() - started,
      });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout,
        stderr: (error as Error).message,
        timedOut,
        killedForLimit,
        durationMs: Date.now() - started,
      });
    });
  });
}

/**
 * The providers to try, in preference order.
 *
 * Docker first because it is what production is most likely to have; Podman second
 * because it is rootless by default, which is strictly better isolation where present.
 * A hosted provider would be registered here too — see `registerSandboxProvider`.
 */
function defaultProviders(): SandboxRuntime[] {
  return [
    new ContainerSandboxRuntime({ name: 'docker', binary: 'docker' }),
    new ContainerSandboxRuntime({ name: 'podman', binary: 'podman' }),
  ];
}

let registry: SandboxRuntime[] | null = null;

function providers(): SandboxRuntime[] {
  if (!registry) registry = defaultProviders();
  return registry;
}

/**
 * Adds a provider at the front of the preference order.
 *
 * This is the seam a hosted isolation service plugs into: implement `SandboxRuntime`,
 * register it at startup, and every caller reaches it without changing. Nothing here
 * provisions or bills for such a service — registering one is a deployment decision.
 */
export function registerSandboxProvider(runtime: SandboxRuntime): void {
  providers().unshift(runtime);
}

/**
 * Adds a provider at the *back* of the preference order, behind the built-in containers.
 *
 * Needed because "register" means "prefer this", and not every provider deserves that. A
 * container gets `--user 1000:1000`, `--cap-drop ALL`, `--security-opt no-new-privileges`
 * and a read-only root; the Fly Machine provider can offer none of those, since `unshare -n`
 * requires CAP_SYS_ADMIN and the Machines API exposes no per-exec user. It is the better
 * answer only when there is no container runtime at all — which is the production case, and
 * exactly why it exists. Registering it at the front would have quietly downgraded any
 * environment that *did* have Docker.
 */
export function registerFallbackSandboxProvider(runtime: SandboxRuntime): void {
  providers().push(runtime);
}

/** Test seam. Passing `null` restores the real provider list. */
export function setSandboxProvidersForTesting(runtimes: SandboxRuntime[] | null): void {
  registry = runtimes;
}

/**
 * Registers the remote isolation worker if — and only if — one is configured.
 *
 * Called once at startup. With no `XROGA_SANDBOX_WORKER_URL` this does nothing at all and
 * returns null, which is the normal state: the container providers are tried and, failing
 * those, execution is refused. Nothing here provisions or bills for anything; the presence
 * of that variable is an operator's deliberate decision.
 *
 * Registering does not assert the worker works. It goes to the front of the preference
 * order and is still probed before every use, so a configured-but-broken worker refuses
 * rather than executing.
 */
export function configureRemoteSandboxProvider(
  env: NodeJS.ProcessEnv = process.env,
): SandboxRuntime | null {
  const remote = remoteSandboxFromEnvironment(env);
  if (!remote) return null;
  if (providers().some((p) => p.name === remote.name)) return null;
  registerSandboxProvider(remote);
  return remote;
}

/**
 * Registers the Fly Machine provider when one is configured, or does nothing.
 *
 * Separate from `configureRemoteSandboxProvider` because they are different bets: the remote
 * worker is a machine someone keeps running, while this one creates a microVM per execution
 * and destroys it. Both are inert unless their environment variables are set, so a
 * deployment that configures neither behaves exactly as it did before either existed.
 *
 * Registered as a *fallback*, behind the container providers rather than in front of them.
 * A container can drop privileges and mount its root read-only; this cannot. It wins only
 * where there is no container runtime — which is production, and the reason it exists.
 */
export function configureFlyMachineSandboxProvider(
  env: NodeJS.ProcessEnv = process.env,
): SandboxRuntime | null {
  const fly = flyMachineSandboxFromEnvironment(env);
  if (!fly) return null;
  if (providers().some((p) => p.name === fly.name)) return null;
  registerFallbackSandboxProvider(fly);
  return fly;
}

export function listSandboxProviders(): readonly string[] {
  return providers().map((p) => p.name);
}

/**
 * Probes every provider in order and returns the first that can actually isolate.
 *
 * Every probe is recorded even after one succeeds is *not* the behaviour — probing stops
 * at the first success, because a probe can spawn a process and there is no reason to pay
 * for the rest. The probes that did run are returned either way.
 */
export async function selectSandboxProvider(): Promise<{
  runtime: SandboxRuntime | null;
  availability: SandboxAvailability;
  probes: ProviderProbe[];
}> {
  const probes: ProviderProbe[] = [];
  const candidates = providers();

  if (!candidates.length) {
    return {
      runtime: null,
      availability: {
        available: false,
        runtime: 'none',
        reason: 'runtime_unavailable',
        detail: 'No isolation providers are registered, so generated code was not executed.',
      },
      probes,
    };
  }

  for (const candidate of candidates) {
    let availability: SandboxAvailability;
    try {
      availability = await candidate.probe();
    } catch (error) {
      // A provider that throws while probing is unavailable, not fatal. Trying the next
      // one is safe; treating a broken provider as a working one would not be.
      availability = {
        available: false,
        runtime: candidate.name,
        reason: 'runtime_unhealthy',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    probes.push({
      provider: candidate.name,
      available: availability.available,
      detail: availability.detail ?? (availability.available ? 'available' : 'unavailable'),
    });

    if (availability.available) return { runtime: candidate, availability, probes };
  }

  // Policy beats absence in the explanation: if an operator switched sandboxing off, that
  // is the reason worth reporting, not the incidental fact that Docker is also missing.
  const disabled = probes.length && providers().length
    ? process.env.XROGA_SANDBOX_DISABLED === '1'
    : false;

  return {
    runtime: null,
    availability: {
      available: false,
      runtime: 'none',
      reason: disabled ? 'policy_disabled' : 'runtime_unavailable',
      detail: disabled
        ? 'Sandboxing is disabled by XROGA_SANDBOX_DISABLED, so generated code was not executed.'
        : `No isolation provider is available, so generated code was not executed. Tried: ${probes
            .map((p) => `${p.provider} (${p.detail})`)
            .join('; ')}`,
    },
    probes,
  };
}
