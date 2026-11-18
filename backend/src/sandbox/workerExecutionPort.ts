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
import { meterRemoteWorkerRun, type RemoteRunOwner } from './meteredExecution.js';

type PortRequest = Omit<SandboxExecutionRequest, 'limits'> & { limits?: Partial<SandboxExecutionRequest['limits']> };

const DEFAULT_LIMITS: SandboxExecutionRequest['limits'] = { memoryMb: 1024, cpuSeconds: 240, diskMb: 256, maxProcesses: 128 };
/** The worker image provides python3 and node; a project's plan says "python". */
const COMMAND_ALIASES: Record<string, string> = { python: 'python3' };

export interface WorkerPortDeps {
  readonly runtime: () => Promise<SandboxRuntime>;
  readonly owner?: () => Promise<RemoteRunOwner | undefined>;
}

function restricted(runtime: string): SandboxUnavailableError {
  return new SandboxUnavailableError({
    available: false, runtime, reason: 'policy_disabled',
    detail: 'This stage needs network access to a package registry, which requires a verified restricted-network worker that is not available. Nothing was run.',
  });
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
        return meterRemoteWorkerRun(owner, { timeoutMs, memoryMb: limits.memoryMb, worker: runtime.name }, () => runtime.execute({
          files, command: wrapped.command, args: wrapped.args, timeoutMs: Math.min(300_000, Math.max(1_000, timeoutMs)), networkPolicy: 'none',
          environment: request.environment, limits, ...(request.signal ? { signal: request.signal } : {}),
        }));
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
