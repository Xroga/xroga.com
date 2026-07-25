import type { ModelId } from './models.js';

export type ProviderFailureKind =
  | 'authentication'
  | 'rate_limit'
  | 'timeout'
  | 'context_limit'
  | 'invalid_model'
  | 'invalid_request'
  | 'unsupported'
  | 'cancelled'
  | 'transient'
  | 'unknown';

export interface NormalizedProviderError {
  kind: ProviderFailureKind;
  retryable: boolean;
  status?: number;
  code?: string;
  safeMessage: string;
}

export interface ModelRuntimeHealth {
  modelId: ModelId;
  status: 'unknown' | 'healthy' | 'degraded' | 'unavailable' | 'circuit_open';
  successes: number;
  failures: number;
  consecutiveFailures: number;
  recentFailureRate: number;
  validationSuccesses: number;
  validationFailures: number;
  validationSuccessRate: number;
  averageLatencyMs: number;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  circuitOpenUntil?: string;
  lastFailureKind?: ProviderFailureKind;
}

interface MutableHealth extends ModelRuntimeHealth {
  totalLatencyMs: number;
}

const health = new Map<ModelId, MutableHealth>();

function initial(modelId: ModelId): MutableHealth {
  return {
    modelId,
    status: 'unknown',
    successes: 0,
    failures: 0,
    consecutiveFailures: 0,
    recentFailureRate: 0,
    validationSuccesses: 0,
    validationFailures: 0,
    validationSuccessRate: 0,
    averageLatencyMs: 0,
    totalLatencyMs: 0,
  };
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeProviderError(error: unknown): NormalizedProviderError {
  const value = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
    name?: unknown;
  };
  const message = typeof value?.message === 'string' ? value.message : 'Provider request failed';
  const lower = message.toLowerCase();
  const status = numberField(value?.status);
  const code = typeof value?.code === 'string' ? value.code : undefined;
  const namedAbort = value?.name === 'AbortError' || code === 'BUILD_CANCELLED';

  let kind: ProviderFailureKind = 'unknown';
  if (namedAbort) kind = 'cancelled';
  else if (status === 401 || status === 403 || /invalid (?:api )?key|unauthori[sz]ed|authentication/.test(lower)) kind = 'authentication';
  else if (status === 429 || /rate.?limit|too many requests/.test(lower)) kind = 'rate_limit';
  else if (/timeout|timed out|etimedout/.test(lower)) kind = 'timeout';
  else if (/context.{0,20}(?:length|window|limit)|maximum context|too many tokens/.test(lower)) kind = 'context_limit';
  else if (/model.{0,30}(?:not found|invalid|does not exist)|unknown model/.test(lower)) kind = 'invalid_model';
  else if (status === 400 || /malformed|invalid request|validation error/.test(lower)) kind = 'invalid_request';
  else if (status === 404 || /unsupported|not supported/.test(lower)) kind = 'unsupported';
  else if ((status && status >= 500) || /econnreset|econnrefused|temporar|overloaded|service unavailable/.test(lower)) kind = 'transient';

  const retryable = ['rate_limit', 'timeout', 'transient', 'unknown'].includes(kind);
  return {
    kind,
    retryable,
    status,
    code,
    safeMessage: `${kind.replace('_', ' ')} provider failure`,
  };
}

function recompute(entry: MutableHealth): void {
  const executions = entry.successes + entry.failures;
  const validations = entry.validationSuccesses + entry.validationFailures;
  entry.recentFailureRate = executions ? entry.failures / executions : 0;
  entry.validationSuccessRate = validations ? entry.validationSuccesses / validations : 0;
  entry.averageLatencyMs = entry.successes ? Math.round(entry.totalLatencyMs / entry.successes) : 0;
}

export function recordModelExecution(
  modelId: ModelId,
  result: { ok: boolean; latencyMs: number; error?: unknown },
  now = Date.now(),
): ModelRuntimeHealth {
  const entry = health.get(modelId) ?? initial(modelId);
  entry.lastCheckedAt = new Date(now).toISOString();
  if (result.ok) {
    entry.successes += 1;
    entry.consecutiveFailures = 0;
    entry.totalLatencyMs += Math.max(0, result.latencyMs);
    entry.lastSuccessAt = entry.lastCheckedAt;
    entry.status = 'healthy';
    entry.circuitOpenUntil = undefined;
    entry.lastFailureKind = undefined;
  } else {
    const normalized = normalizeProviderError(result.error);
    entry.failures += 1;
    entry.consecutiveFailures += 1;
    entry.lastFailureAt = entry.lastCheckedAt;
    entry.lastFailureKind = normalized.kind;
    const threshold = Math.max(1, Number(process.env.XROGA_CIRCUIT_FAILURE_THRESHOLD) || 3);
    if (!normalized.retryable || entry.consecutiveFailures >= threshold) {
      const recoveryMs = Number(process.env.MODEL_CIRCUIT_RECOVERY_MS) || 60_000;
      entry.status = 'circuit_open';
      entry.circuitOpenUntil = new Date(now + recoveryMs).toISOString();
    } else {
      entry.status = 'degraded';
    }
  }
  recompute(entry);
  health.set(modelId, entry);
  return { ...entry };
}

export function recordModelValidation(modelId: ModelId, ok: boolean): ModelRuntimeHealth {
  const entry = health.get(modelId) ?? initial(modelId);
  if (ok) entry.validationSuccesses += 1;
  else entry.validationFailures += 1;
  recompute(entry);
  health.set(modelId, entry);
  return { ...entry };
}

export function getModelRuntimeHealth(
  modelId: ModelId,
  now = Date.now(),
): ModelRuntimeHealth {
  const entry = health.get(modelId) ?? initial(modelId);
  if (
    entry.status === 'circuit_open' &&
    entry.circuitOpenUntil &&
    new Date(entry.circuitOpenUntil).getTime() <= now
  ) {
    entry.status = 'degraded';
    entry.consecutiveFailures = 0;
    entry.circuitOpenUntil = undefined;
    health.set(modelId, entry);
  }
  return { ...entry };
}

export function resetModelRuntimeHealth(): void {
  health.clear();
}

export async function executeWithProviderFallback<T>(input: {
  routes: ModelId[];
  execute: (modelId: ModelId, signal: AbortSignal) => Promise<T>;
  timeoutMs?: number;
  maximumAttemptsPerRoute?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ value: T; modelId: ModelId; failures: NormalizedProviderError[] }> {
  const failures: NormalizedProviderError[] = [];
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (const modelId of [...new Set(input.routes)]) {
    if (getModelRuntimeHealth(modelId).status === 'circuit_open') continue;
    const attempts = Math.max(1, input.maximumAttemptsPerRoute ?? 2);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (input.signal?.aborted) throw Object.assign(new Error('Provider request cancelled'), { name: 'AbortError' });
      const controller = new AbortController();
      const abort = () => controller.abort();
      input.signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
      const started = Date.now();
      try {
        const value = await input.execute(modelId, controller.signal);
        recordModelExecution(modelId, { ok: true, latencyMs: Date.now() - started });
        return { value, modelId, failures };
      } catch (error) {
        const normalized = controller.signal.aborted && !input.signal?.aborted
          ? normalizeProviderError(Object.assign(new Error('Provider request timed out'), { code: 'ETIMEDOUT' }))
          : normalizeProviderError(error);
        failures.push(normalized);
        recordModelExecution(modelId, { ok: false, latencyMs: Date.now() - started, error });
        if (!normalized.retryable || normalized.kind === 'authentication' || normalized.kind === 'invalid_model' || normalized.kind === 'invalid_request' || attempt === attempts - 1) break;
        const delay = Math.min(5_000, 200 * 2 ** attempt) + Math.floor(Math.random() * 100);
        await sleep(delay);
      } finally {
        clearTimeout(timeout);
        input.signal?.removeEventListener('abort', abort);
      }
    }
  }
  const error = new Error('All compatible provider routes failed');
  Object.assign(error, { failures });
  throw error;
}
