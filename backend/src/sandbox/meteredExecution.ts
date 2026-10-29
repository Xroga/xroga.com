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
