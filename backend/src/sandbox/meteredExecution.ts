/**
 * Meters every canonical (Google) sandbox call against the engineering resource ledger.
 *
 * `executeCanonicalSandboxed` is the one seam every canonical caller passes through (compile validation, universal validation, agent commands and
 * browser verification), so metering here covers all of them without each caller doing its own accounting. Browser verification is charged to the
 * browser-session category and everything else to sandbox compute. The owner and run come from the admitted run attempt, never from the request.
 * With metering off (the default) this is a straight call.
 */
import type { SandboxCaller } from './google/executionBinding.js';
import { engineeringMeterFor, meterConfigFromEnv, type MeterConfig, type ResourceMeter } from '../ai/resourceMeter.js';
import type { ResourceCategory } from '../ai/resourceLedger.js';

export interface MeteredCallDeps {
  readonly config: () => MeterConfig;
  readonly attempt: () => Promise<{ userId: string; runId: string } | null>;
  readonly meterFor: (userId: string, config: MeterConfig) => ResourceMeter | null;
}

const defaultDeps: MeteredCallDeps = {
  config: () => meterConfigFromEnv(),
  attempt: async () => {
    const { captureCurrentRunAttempt } = await import('../ai/runStore.js');
    try { const a = captureCurrentRunAttempt(); return { userId: a.userId, runId: a.runId }; } catch { return null; }
  },
  meterFor: (userId, config) => engineeringMeterFor(userId, config),
};

export function categoryFor(caller: SandboxCaller): ResourceCategory {
  return caller === 'browser-verification' ? 'browser_session_seconds' : 'sandbox_compute_seconds';
}

/** Seconds the call is allowed to use: the sum of its stage timeouts when staged, otherwise its own timeout. */
export function estimatedSeconds(request: { timeoutMs: number; stages?: readonly { timeoutMs?: number }[] }): number {
  const staged = request.stages?.reduce((total, stage) => total + (Number.isFinite(stage.timeoutMs) ? Number(stage.timeoutMs) : 0), 0) ?? 0;
  return Math.max(1, Math.ceil((staged > 0 ? staged : request.timeoutMs) / 1000));
}

export async function meterCanonicalSandbox<T>(caller: SandboxCaller, request: { timeoutMs: number; stages?: readonly { timeoutMs?: number }[] }, run: () => Promise<T>, deps: MeteredCallDeps = defaultDeps): Promise<T> {
  const config = deps.config();
  if (!config.enabled) return run();
  const attempt = await deps.attempt();
  if (!attempt) return run();
  const meter = deps.meterFor(attempt.userId, config);
  if (!meter) return run();
  return meter.measure({ category: categoryFor(caller), runId: attempt.runId, estimateUnits: estimatedSeconds(request) }, run);
}

/**
 * Meters one run on the remote isolation worker (the repository runner and the coding path) against the same ledger.
 *
 * Unlike the canonical seam, these callers are not inside an admitted run attempt, so the owner and run are passed explicitly by the route that
 * already verified them (the issued tenant context and the leased run), never read from a request body. The held estimate is the call's own
 * timeout; the settled amount is the worker's measured duration (falling back to the elapsed wall clock when the worker gave none). The memory
 * limit and the worker are recorded in the reservation's provider-resource field so a reviewer can price the seconds.
 */
export interface RemoteRunOwner { readonly userId: string; readonly runId: string }

export function remoteWorkerResourceLabel(worker: string, memoryMb: number): string {
  return `${worker.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 60) || 'worker'};mem=${Math.max(0, Math.floor(memoryMb))}MB`;
}

export async function meterRemoteWorkerRun<T extends { durationMs?: number | null }>(
  owner: RemoteRunOwner | undefined,
  run: { timeoutMs: number; memoryMb: number; worker: string },
  execute: () => Promise<T>,
  deps: Pick<MeteredCallDeps, 'config' | 'meterFor'> = defaultDeps,
): Promise<T> {
  if (!owner) return execute();
  const config = deps.config();
  if (!config.enabled) return execute();
  const meter = deps.meterFor(owner.userId, config);
  if (!meter) return execute();
  const label = remoteWorkerResourceLabel(run.worker, run.memoryMb);
  return meter.measure(
    { category: 'sandbox_compute_seconds', runId: owner.runId, estimateUnits: estimatedSeconds({ timeoutMs: run.timeoutMs }) },
    execute,
    (result, elapsed) => (result && typeof result.durationMs === 'number' && Number.isFinite(result.durationMs) && result.durationMs >= 0 ? result.durationMs / 1000 : elapsed),
    () => label,
  );
}
