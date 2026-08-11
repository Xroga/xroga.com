/**
 * Provider health that survives a restart.
 *
 * §15 asks for durable provider health, and until now `providerRuntime` held it in a
 * module-scoped `Map`. That works while the process lives and loses everything when it
 * does not — which on Fly is every deploy, every scale event and every crash.
 *
 * The state that matters is the circuit breaker. A model that failed authentication ten
 * times in a row has its circuit opened for a cooling period; after a restart that model
 * came back `unknown` and immediately took traffic again. The breaker was not protecting
 * anything across the boundary where protection matters most — a bad deploy and a provider
 * outage tend to arrive together.
 *
 * Two decisions shape this module.
 *
 * **The hot path stays synchronous and in-memory.** `getModelRuntimeHealth` is consulted
 * before every provider call and inside the fallback loop; making it async would ripple
 * through the pipeline for no benefit. The `Map` remains the source of truth at runtime;
 * this only snapshots it and rehydrates on boot.
 *
 * **Writes are on transition, not on every call.** Persisting each success would put a
 * database write in front of every model call to record that nothing changed. What is worth
 * durable recording is a change of state: a circuit opening, a circuit clearing, a model
 * moving between healthy and degraded. Counters ride along with those writes and are
 * therefore approximate across a restart — which is the honest trade, and is why the
 * rehydrated record carries `restoredAt`.
 */

import { getSupabaseAdmin } from '../config/supabase.js';
import type { ModelId } from './models.js';
import type { ModelRuntimeHealth } from './providerRuntime.js';

/** A health record as it crosses the persistence boundary. */
export interface PersistedProviderHealth extends ModelRuntimeHealth {
  /** When this record was read back from storage, absent for live records. */
  restoredAt?: string;
}

export interface ProviderHealthStore {
  load(): Promise<PersistedProviderHealth[]>;
  save(health: ModelRuntimeHealth): Promise<void>;
}

/**
 * The store used when no service-role key is configured.
 *
 * Returns nothing and accepts everything, so a local run behaves exactly as before rather
 * than failing on a missing table. A no-op store is correct here: the alternative is a
 * developer machine that cannot start because durability is unavailable.
 */
export class InMemoryProviderHealthStore implements ProviderHealthStore {
  private readonly rows = new Map<ModelId, PersistedProviderHealth>();

  async load(): Promise<PersistedProviderHealth[]> {
    return [...this.rows.values()];
  }

  async save(health: ModelRuntimeHealth): Promise<void> {
    this.rows.set(health.modelId, { ...health });
  }
}

export class SupabaseProviderHealthStore implements ProviderHealthStore {
  async load(): Promise<PersistedProviderHealth[]> {
    const { data, error } = await getSupabaseAdmin()
      .from('model_provider_health')
      .select('*');
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      modelId: row.model_id as ModelId,
      status: row.status as ModelRuntimeHealth['status'],
      successes: Number(row.successes ?? 0),
      failures: Number(row.failures ?? 0),
      consecutiveFailures: Number(row.consecutive_failures ?? 0),
      recentFailureRate: Number(row.recent_failure_rate ?? 0),
      validationSuccesses: Number(row.validation_successes ?? 0),
      validationFailures: Number(row.validation_failures ?? 0),
      validationSuccessRate: Number(row.validation_success_rate ?? 0),
      averageLatencyMs: Number(row.average_latency_ms ?? 0),
      ...(row.last_checked_at ? { lastCheckedAt: String(row.last_checked_at) } : {}),
      ...(row.last_success_at ? { lastSuccessAt: String(row.last_success_at) } : {}),
      ...(row.last_failure_at ? { lastFailureAt: String(row.last_failure_at) } : {}),
      ...(row.circuit_open_until ? { circuitOpenUntil: String(row.circuit_open_until) } : {}),
      ...(row.last_failure_kind
        ? { lastFailureKind: row.last_failure_kind as ModelRuntimeHealth['lastFailureKind'] }
        : {}),
      restoredAt: new Date().toISOString(),
    }));
  }

  async save(health: ModelRuntimeHealth): Promise<void> {
    const { error } = await getSupabaseAdmin().from('model_provider_health').upsert(
      {
        model_id: health.modelId,
        status: health.status,
        successes: health.successes,
        failures: health.failures,
        consecutive_failures: health.consecutiveFailures,
        recent_failure_rate: health.recentFailureRate,
        validation_successes: health.validationSuccesses,
        validation_failures: health.validationFailures,
        validation_success_rate: health.validationSuccessRate,
        average_latency_ms: Math.round(health.averageLatencyMs),
        last_checked_at: health.lastCheckedAt ?? null,
        last_success_at: health.lastSuccessAt ?? null,
        last_failure_at: health.lastFailureAt ?? null,
        circuit_open_until: health.circuitOpenUntil ?? null,
        last_failure_kind: health.lastFailureKind ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'model_id' },
    );
    if (error) throw error;
  }
}

export function providerHealthStore(): ProviderHealthStore {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseProviderHealthStore()
    : new InMemoryProviderHealthStore();
}

/**
 * Whether a restored record still constrains routing.
 *
 * An expired circuit is not restored as open. Reinstating a breaker whose cooling period
 * elapsed while the process was down would keep a recovered model out of rotation for a
 * second full period, turning a five-minute provider blip into a much longer outage on the
 * next deploy — the durability would then be doing harm rather than good.
 */
export function stillConstraining(
  record: PersistedProviderHealth,
  now = Date.now(),
): boolean {
  if (record.status !== 'circuit_open') return true;
  if (!record.circuitOpenUntil) return true;
  return new Date(record.circuitOpenUntil).getTime() > now;
}

/**
 * Which state changes are worth a write.
 *
 * Everything else is a counter increment that will be captured by the next transition.
 * Persisting on every call would place a database round-trip in front of every model call
 * to record that nothing changed.
 */
export function worthPersisting(
  previous: ModelRuntimeHealth | undefined,
  next: ModelRuntimeHealth,
): boolean {
  if (!previous) return next.status !== 'unknown';
  if (previous.status !== next.status) return true;
  // A breaker re-arming at a new deadline is a distinct operational event even when the
  // status string is unchanged.
  return previous.circuitOpenUntil !== next.circuitOpenUntil;
}
