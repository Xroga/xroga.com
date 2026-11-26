/**
 * The change workflow's execution port, backed by the remote isolation worker.
 *
 * `runTests` hands the port a staged plan (install stages, then test stages). The whole plan goes to the worker as ONE request with ordered
 * stages, so every stage shares one fresh container and one run directory (an install leaves its packages where the offline test stage finds
 * them). A registry-only stage runs behind the worker's allowlisting proxy and only on a worker that proved that restriction; a worker that
 * cannot is reported as "not run", never as a failure of the project's code and never with an open network.
 * Each worker request is metered to the verified owner and run through the same ledger as every other sandbox call.
 */
import type { SandboxExecutionRequest, SandboxExecutionResult, SandboxRuntime } from './sandboxTypes.js';
import { SandboxUnavailableError } from './sandboxTypes.js';
import { meterRemoteWorkerRun, type MeteredCallDeps, type RemoteRunOwner } from './meteredExecution.js';

type PortRequest = Omit<SandboxExecutionRequest, 'limits'> & { limits?: Partial<SandboxExecutionRequest['limits']> };

const DEFAULT_LIMITS: SandboxExecutionRequest['limits'] = { memoryMb: 1024, cpuSeconds: 240, diskMb: 256, maxProcesses: 128 };
/** The worker image provides python3 and node; a project's plan says "python". */
const COMMAND_ALIASES: Record<string, string> = { python: 'python3' };
/** The worker's service timeout bounds a request; stage budgets are scaled down together to fit. */
const MAX_TOTAL_MS = 800_000;

export interface WorkerPortDeps {
  readonly runtime: () => Promise<SandboxRuntime>;
  readonly owner?: () => Promise<RemoteRunOwner | undefined>;
  /** How many times a request refused before any code ran is tried (default 4), and the base delay between tries. */
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  /** Test seam for the ledger. */
  readonly meterDeps?: Pick<MeteredCallDeps, 'config' | 'meterFor'>;
}

function unavailable(runtime: string, detail: string): SandboxUnavailableError {
  return new SandboxUnavailableError({ available: false, runtime, reason: 'runtime_unavailable', detail: detail.slice(0, 300) });
}

/**
 * The remote runtime reports a worker that could not be reached, refused the request or answered off-contract as a null exit code with an
 * "Isolation worker ..." message. That means the project's code never ran, so it must read as "not run", never as a failing test.
 */
function notRunIsUnavailable(runtime: string, result: SandboxExecutionResult): SandboxExecutionResult {
  if (result.exitCode === null && !result.timedOut && /^Isolation worker/.test(result.stderr)) throw unavailable(runtime, result.stderr);
  return result;
}

/** A refusal that repeating cannot fix (a bad request, no permission) is not retried; a busy, starting or restarting container is. */
const permanent = (error: unknown) => error instanceof SandboxUnavailableError && /HTTP (400|401|403|413)\b/.test(error.message);

/** The worker runs only offline and registry-only stages; anything else (for example a preview) is not run.
 */
function workerPolicy(policy: string): 'none' | 'registry-only' {
  if (policy !== 'none' && policy !== 'registry-only') throw new Error('The execution worker runs only offline and registry-only stages.');
  return policy;
}

export function createWorkerExecutionPort(deps: WorkerPortDeps) {
  return {
    async execute(request: PortRequest): Promise<SandboxExecutionResult> {
      const runtime = await deps.runtime();
      const owner = await deps.owner?.();
      const limits = { ...DEFAULT_LIMITS, ...(request.limits ?? {}) };
      const files = request.files.map((file) => ({ path: file.path, content: file.content }));
      const planned: ReadonlyArray<{ id: string; command: string; args: readonly string[]; networkPolicy: 'none' | 'registry-only'; timeoutMs: number; cwd?: string }> = request.stages?.length
        ? request.stages.map((stage) => {
          // The worker runs only offline and registry-only stages; anything else (for example a preview) is not run.
          if (stage.networkPolicy !== 'none' && stage.networkPolicy !== 'registry-only') throw new Error('The execution worker runs only offline and registry-only stages.');
          return { ...stage, networkPolicy: stage.networkPolicy };
        })
        : [{ id: 'main', command: request.command, args: request.args, networkPolicy: workerPolicy(request.networkPolicy), timeoutMs: request.timeoutMs }];
      const total = planned.reduce((n, s) => n + s.timeoutMs, 0);
      const scale = total > MAX_TOTAL_MS ? MAX_TOTAL_MS / total : 1;
      const stages = planned.map((s) => ({
        id: s.id, command: COMMAND_ALIASES[s.command] ?? s.command, args: [...s.args], networkPolicy: s.networkPolicy,
        timeoutMs: Math.max(1_000, Math.min(600_000, Math.floor(s.timeoutMs * scale))), ...(s.cwd ? { cwd: s.cwd } : {}),
      }));
      const budgetMs = stages.reduce((n, s) => n + s.timeoutMs, 0);
      const wire: SandboxExecutionRequest = {
        files, command: stages[0]!.command, args: stages[0]!.args, timeoutMs: Math.min(600_000, budgetMs),
        networkPolicy: stages.some((s) => s.networkPolicy === 'registry-only') ? 'registry-only' : 'none',
        environment: request.environment, limits, stages, ...(request.signal ? { signal: request.signal } : {}),
      };
      const result = await meterRemoteWorkerRun(owner, { timeoutMs: budgetMs, memoryMb: limits.memoryMb, worker: runtime.name }, async () => {
        // The worker ends its process after every run so the next request gets a fresh container, so a request can land on a container that is
        // still shutting down or just starting. A request that was refused before any code ran is safe to repeat; a run that started never is.
        for (let attempt = 1; ; attempt++) {
          try { return notRunIsUnavailable(runtime.name, await runtime.execute(wire)); }
          catch (error) {
            if (!(error instanceof SandboxUnavailableError) || permanent(error) || attempt >= (deps.attempts ?? 4) || request.signal?.aborted) throw error;
            await new Promise((resolve) => setTimeout(resolve, (deps.retryDelayMs ?? 3_000) * attempt));
          }
        }
      }, deps.meterDeps);
      // A worker that did not return the stages it ran (an older worker that ignores them) has not run this plan, whatever its top-level fields say.
      if (!result.stages) throw unavailable(runtime.name, 'The worker did not report per-stage results, so it cannot run a staged plan.');
      return result;
    },
  };
}
