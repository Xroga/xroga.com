/**
 * The change workflow's execution port, backed by the remote isolation worker.
 *
 * `runTests` hands the port a staged plan (install stages, then test stages). The worker runs one command per request, offline, in a fresh
 * container, so each stage becomes its own worker request over the same files. An install stage needs the restricted-network worker, which does
 * not exist yet: such a stage is refused as unavailable (never skipped, never run with an open network), and the test run reports "not run".
 * Each worker request is metered to the verified owner and run through the same ledger as every other sandbox call.
 */
import type { SandboxExecutionRequest, SandboxExecutionResult, SandboxRuntime } from './sandboxTypes.js';
import { SandboxUnavailableError } from './sandboxTypes.js';
import { meterRemoteWorkerRun, type MeteredCallDeps, type RemoteRunOwner } from './meteredExecution.js';

type PortRequest = Omit<SandboxExecutionRequest, 'limits'> & { limits?: Partial<SandboxExecutionRequest['limits']> };

const DEFAULT_LIMITS: SandboxExecutionRequest['limits'] = { memoryMb: 1024, cpuSeconds: 240, diskMb: 256, maxProcesses: 128 };
/** The worker image provides python3 and node; a project's plan says "python". */
const COMMAND_ALIASES: Record<string, string> = { python: 'python3' };

export interface WorkerPortDeps {
  readonly runtime: () => Promise<SandboxRuntime>;
  readonly owner?: () => Promise<RemoteRunOwner | undefined>;
  /** How many times a request refused before any code ran is tried (default 4), and the base delay between tries. */
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  /** Test seam for the ledger. */
  readonly meterDeps?: Pick<MeteredCallDeps, 'config' | 'meterFor'>;
}

function restricted(runtime: string): SandboxUnavailableError {
  return new SandboxUnavailableError({
    available: false, runtime, reason: 'policy_disabled',
    detail: 'This stage needs network access to a package registry, which requires a verified restricted-network worker that is not available. Nothing was run.',
  });
}

/**
 * The remote runtime reports a worker that could not be reached, refused the request or answered off-contract as a null exit code with an
 * "Isolation worker ..." message. That means the project's code never ran, so it must read as "not run", never as a failing test.
 */
function notRunIsUnavailable(runtime: string, result: SandboxExecutionResult): SandboxExecutionResult {
  if (result.exitCode === null && !result.timedOut && /^Isolation worker/.test(result.stderr)) {
    throw new SandboxUnavailableError({ available: false, runtime, reason: 'runtime_unavailable', detail: result.stderr.slice(0, 300) });
  }
  return result;
}

export function createWorkerExecutionPort(deps: WorkerPortDeps) {
  return {
    async execute(request: PortRequest): Promise<SandboxExecutionResult> {
      const runtime = await deps.runtime();
      const owner = await deps.owner?.();
      const limits = { ...DEFAULT_LIMITS, ...(request.limits ?? {}) };
      const files = request.files.map((file) => ({ path: file.path, content: file.content }));
      const one = (command: string, args: readonly string[], cwd: string | undefined, timeoutMs: number) => {
        const mapped = COMMAND_ALIASES[command] ?? command;
        // a stage's directory is entered by the shell inside the sandbox; the arguments are passed as data, never interpolated into the script
        const wrapped = cwd ? { command: 'sh', args: ['-c', 'cd "$0" && exec "$@"', cwd, mapped, ...args] } : { command: mapped, args: [...args] };
        const request1 = {
          files, command: wrapped.command, args: wrapped.args, timeoutMs: Math.min(300_000, Math.max(1_000, timeoutMs)), networkPolicy: 'none' as const,
          environment: request.environment, limits, ...(request.signal ? { signal: request.signal } : {}),
        };
        return meterRemoteWorkerRun(owner, { timeoutMs, memoryMb: limits.memoryMb, worker: runtime.name }, async () => {
          // The worker ends its process after every run so the next request gets a fresh container, so a request can land on a container that is
          // still shutting down or just starting. A request that was refused before any code ran is safe to repeat; a run that started never is.
          for (let attempt = 1; ; attempt++) {
            try { return notRunIsUnavailable(runtime.name, await runtime.execute(request1)); }
            catch (error) {
              if (!(error instanceof SandboxUnavailableError) || attempt >= (deps.attempts ?? 4) || request.signal?.aborted) throw error;
              await new Promise((resolve) => setTimeout(resolve, (deps.retryDelayMs ?? 3_000) * attempt));
            }
          }
        }, deps.meterDeps);
      };
      if (!request.stages?.length) {
        if (request.networkPolicy !== 'none') throw restricted(runtime.name);
        return one(request.command, request.args, undefined, request.timeoutMs);
      }
      const done: Array<SandboxExecutionResult & { id: string; networkPolicy?: 'none' | 'registry-only' }> = [];
      for (const stage of request.stages) {
        if (request.signal?.aborted) break;
        if (stage.networkPolicy !== 'none') throw restricted(runtime.name);
        const result = await one(stage.command, stage.args, stage.cwd, stage.timeoutMs);
        done.push({ ...result, id: stage.id, networkPolicy: stage.networkPolicy });
        if (result.exitCode !== 0 || result.timedOut) break; // a failed stage ends the run, as the plan expects
      }
      const last = done[done.length - 1];
      return { ...(last ?? { exitCode: null, stdout: '', stderr: '', timedOut: false, killedForLimit: false, durationMs: 0 }), stages: done, durationMs: done.reduce((n, s) => n + s.durationMs, 0) };
    },
  };
}
