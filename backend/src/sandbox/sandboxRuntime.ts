import { spawn } from 'child_process';
import { buildSandboxEnvironment } from './sandboxEnvironment.js';
import {
  DEFAULT_SANDBOX_LIMITS,
  SandboxUnavailableError,
  type SandboxAvailability,
  type SandboxExecutionRequest,
  type SandboxExecutionResult,
  type SandboxRuntime,
} from './sandboxTypes.js';

/**
 * Picks an isolation runtime, or refuses.
 *
 * Production today is a Fly machine running the API in a container with no nested
 * container runtime, so `probe()` returns unavailable and every validation refuses.
 * That is the intended behaviour, not a gap being papered over: the brief for this
 * change is explicit that a missing runtime must fail safely and mark the build "not
 * locally verified" rather than fall back to running generated code on the API host.
 *
 * The pipeline already models exactly that outcome. `classifyValidation` treats an
 * infrastructure failure as `not_verified` — the code still reaches the user's
 * repository, and Vercel's own install and build become the verification. So refusing
 * here costs a local typecheck, not the user's product.
 */

const MAX_CAPTURE_BYTES = 40_000;

/** Probe result cached briefly — a probe per validation stage is wasteful, but a
 *  runtime can also disappear, so this is short rather than permanent. */
let cachedProbe: { at: number; value: SandboxAvailability } | null = null;
const PROBE_TTL_MS = 30_000;

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
        // The probe itself gets the scrubbed environment too — there is no reason for
        // `docker version` to see a Supabase key either.
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
 * A Docker-backed runtime.
 *
 * Deliberately only reports available when `docker version` actually succeeds — the
 * brief is explicit that isolation must not be claimed unless it really executes.
 */
export class DockerSandboxRuntime implements SandboxRuntime {
  readonly name = 'docker';

  async probe(): Promise<SandboxAvailability> {
    if (process.env.XROGA_SANDBOX_DISABLED === '1') {
      return {
        available: false,
        runtime: this.name,
        reason: 'policy_disabled',
        detail: 'Sandboxed execution is disabled by configuration.',
      };
    }
    const ok = await canRun('docker', ['version', '--format', '{{.Server.Version}}']);
    return ok
      ? { available: true, runtime: this.name }
      : {
          available: false,
          runtime: this.name,
          reason: 'runtime_unavailable',
          detail:
            'No container runtime is reachable from the API host, so generated code was not executed here.',
        };
  }

  async execute(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
    const availability = await this.probe();
    if (!availability.available) throw new SandboxUnavailableError(availability);
    return runIsolated(request);
  }
}

/**
 * Runs the command inside the container runtime.
 *
 * Reached only after a successful probe. Every flag here is a limit the brief requires:
 * no network unless the stage is an install, a read-only root with a disposable
 * writable workspace, a non-root user, and hard memory/CPU/process caps.
 */
async function runIsolated(request: SandboxExecutionRequest): Promise<SandboxExecutionResult> {
  const started = Date.now();
  const network = request.networkPolicy === 'none' ? 'none' : 'bridge';

  const dockerArgs = [
    'run',
    '--rm',
    '--network', network,
    '--user', '1000:1000',
    '--read-only',
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
    dockerArgs.push('--env', `${name}=${value}`);
  }

  dockerArgs.push('node:20-alpine', request.command, ...request.args);

  return new Promise<SandboxExecutionResult>((resolve) => {
    const child = spawn('docker', dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // The docker CLI itself, not the generated code — but still scrubbed.
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

let runtimeOverride: SandboxRuntime | null = null;

/** Test seam. Passing `null` restores the real runtime. */
export function setSandboxRuntimeForTesting(runtime: SandboxRuntime | null): void {
  runtimeOverride = runtime;
  cachedProbe = null;
}

export function getSandboxRuntime(): SandboxRuntime {
  return runtimeOverride ?? new DockerSandboxRuntime();
}

export async function probeSandbox(): Promise<SandboxAvailability> {
  const now = Date.now();
  if (cachedProbe && now - cachedProbe.at < PROBE_TTL_MS) return cachedProbe.value;
  const value = await getSandboxRuntime().probe();
  cachedProbe = { at: now, value };
  return value;
}

/**
 * Runs a command under isolation, or throws `SandboxUnavailableError`.
 *
 * There is intentionally no unsafe fallback path in this module. A caller that wants to
 * degrade gracefully catches the error and reports the build as not locally verified.
 */
export async function executeSandboxed(
  request: Omit<SandboxExecutionRequest, 'limits'> & { limits?: Partial<SandboxExecutionRequest['limits']> },
): Promise<SandboxExecutionResult> {
  const runtime = getSandboxRuntime();
  const availability = await runtime.probe();
  cachedProbe = { at: Date.now(), value: availability };
  if (!availability.available) throw new SandboxUnavailableError(availability);

  return runtime.execute({
    ...request,
    limits: { ...DEFAULT_SANDBOX_LIMITS, ...(request.limits ?? {}) },
  });
}
