import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  InMemoryProviderHealthStore,
  stillConstraining,
  worthPersisting,
  type PersistedProviderHealth,
} from './providerHealthStore.js';
import {
  getModelRuntimeHealth,
  hydrateProviderHealth,
  recordModelExecution,
  resetModelRuntimeHealth,
  setProviderHealthStore,
  type ModelRuntimeHealth,
} from './providerRuntime.js';

/**
 * Command 3 §15 — provider health that survives a restart.
 *
 * The defect: health lived in a module-scoped Map, so every deploy, scale event and crash
 * reset it. A model whose circuit was opened after repeated authentication failures came
 * back `unknown` and immediately took traffic again. A breaker that resets exactly when a
 * bad deploy lands is not protecting anything — and a bad deploy and a provider outage tend
 * to arrive together.
 */

const NOW = 1_800_000_000_000;

function record(over: Partial<PersistedProviderHealth> = {}): PersistedProviderHealth {
  return {
    modelId: 'kimi_k3',
    status: 'healthy',
    successes: 10,
    failures: 0,
    consecutiveFailures: 0,
    recentFailureRate: 0,
    validationSuccesses: 8,
    validationFailures: 2,
    validationSuccessRate: 0.8,
    averageLatencyMs: 1200,
    ...over,
  } as PersistedProviderHealth;
}

test('an open circuit still inside its cooling period keeps constraining', () => {
  const open = record({
    status: 'circuit_open',
    circuitOpenUntil: new Date(NOW + 30_000).toISOString(),
  });
  assert.equal(stillConstraining(open, NOW), true);
});

test('an expired circuit is not reinstated', () => {
  // Restoring a breaker whose cooling period elapsed while the process was down would hold
  // a recovered model out of rotation for a second full period — durability doing harm.
  const expired = record({
    status: 'circuit_open',
    circuitOpenUntil: new Date(NOW - 1).toISOString(),
  });
  assert.equal(stillConstraining(expired, NOW), false);
});

test('a healthy record is always worth restoring', () => {
  assert.equal(stillConstraining(record(), NOW), true);
  assert.equal(stillConstraining(record({ status: 'degraded' }), NOW), true);
});

test('an unknown first observation is not written', () => {
  // Writing a row that says "nothing has been observed" is a database round-trip to record
  // the absence of information.
  assert.equal(worthPersisting(undefined, record({ status: 'unknown' }) as ModelRuntimeHealth), false);
  assert.equal(worthPersisting(undefined, record({ status: 'healthy' }) as ModelRuntimeHealth), true);
});

test('a status change is written, a counter tick alone is not', () => {
  const before = record({ status: 'healthy', successes: 10 }) as ModelRuntimeHealth;
  const sameStatus = record({ status: 'healthy', successes: 11 }) as ModelRuntimeHealth;
  const changed = record({ status: 'degraded', successes: 10 }) as ModelRuntimeHealth;

  assert.equal(worthPersisting(before, sameStatus), false);
  assert.equal(worthPersisting(before, changed), true);
});

test('a breaker re-arming at a new deadline is written even when the status is unchanged', () => {
  const before = record({
    status: 'circuit_open',
    circuitOpenUntil: new Date(NOW + 10_000).toISOString(),
  }) as ModelRuntimeHealth;
  const rearmed = record({
    status: 'circuit_open',
    circuitOpenUntil: new Date(NOW + 60_000).toISOString(),
  }) as ModelRuntimeHealth;
  assert.equal(worthPersisting(before, rearmed), true);
});

test('an open circuit survives a restart', async () => {
  // The whole point. Everything else in this file supports this one assertion.
  resetModelRuntimeHealth();
  const store = new InMemoryProviderHealthStore();
  setProviderHealthStore(store);

  // Fail past the threshold so the breaker opens.
  for (let i = 0; i < 5; i += 1) {
    recordModelExecution('kimi_k3', {
      ok: false,
      latencyMs: 10,
      error: { message: 'invalid api key', status: 401 },
    });
  }
  assert.equal(getModelRuntimeHealth('kimi_k3').status, 'circuit_open');

  // Simulate the process dying and coming back: the map is gone, the store is not.
  resetModelRuntimeHealth();
  setProviderHealthStore(store);
  assert.equal(getModelRuntimeHealth('kimi_k3').status, 'unknown', 'precondition: memory is empty');

  const restored = await hydrateProviderHealth();
  assert.equal(restored, 1);
  assert.equal(getModelRuntimeHealth('kimi_k3').status, 'circuit_open');

  setProviderHealthStore(null);
  resetModelRuntimeHealth();
});

test('hydration never overwrites what this process already observed', async () => {
  // A stored row describes the provider before the restart. A live entry describes it now,
  // and now wins — otherwise a recovered model would be pushed back into a stale breaker by
  // a late hydration.
  resetModelRuntimeHealth();
  const store = new InMemoryProviderHealthStore();
  await store.save(record({ status: 'circuit_open', circuitOpenUntil: new Date(NOW + 60_000).toISOString() }) as ModelRuntimeHealth);
  setProviderHealthStore(store);

  recordModelExecution('kimi_k3', { ok: true, latencyMs: 100 });
  assert.equal(getModelRuntimeHealth('kimi_k3').status, 'healthy');

  await hydrateProviderHealth(NOW);
  assert.equal(getModelRuntimeHealth('kimi_k3').status, 'healthy', 'a stored row overwrote a live observation');

  setProviderHealthStore(null);
  resetModelRuntimeHealth();
});

test('hydration runs once', async () => {
  resetModelRuntimeHealth();
  const store = new InMemoryProviderHealthStore();
  await store.save(record({ status: 'degraded' }) as ModelRuntimeHealth);
  setProviderHealthStore(store);

  assert.equal(await hydrateProviderHealth(NOW), 1);
  assert.equal(await hydrateProviderHealth(NOW), 0, 'a second hydration re-read storage');

  setProviderHealthStore(null);
  resetModelRuntimeHealth();
});

test('a storage failure does not stop startup', async () => {
  // Durability is an improvement over losing the state entirely. Failing to boot because
  // the table is unreachable would make the process strictly worse than before.
  resetModelRuntimeHealth();
  setProviderHealthStore({
    load: async () => {
      throw new Error('relation "model_provider_health" does not exist');
    },
    save: async () => {},
  });

  assert.equal(await hydrateProviderHealth(NOW), 0);

  setProviderHealthStore(null);
  resetModelRuntimeHealth();
});

test('a persistence failure does not fail the provider call', async () => {
  resetModelRuntimeHealth();
  setProviderHealthStore({
    load: async () => [],
    save: async () => {
      throw new Error('write failed');
    },
  });

  const health = recordModelExecution('kimi_k3', { ok: true, latencyMs: 50 });
  assert.equal(health.status, 'healthy');

  setProviderHealthStore(null);
  resetModelRuntimeHealth();
});

test('the restored average latency is not redefined by the first call after a restart', async () => {
  // `totalLatencyMs` is not persisted — it exists only to derive the average, which is.
  // Rebuilding it from the stored average keeps the mean stable as new samples arrive.
  resetModelRuntimeHealth();
  const store = new InMemoryProviderHealthStore();
  await store.save(record({ status: 'healthy', successes: 10, averageLatencyMs: 1000 }) as ModelRuntimeHealth);
  setProviderHealthStore(store);

  await hydrateProviderHealth(NOW);
  const after = recordModelExecution('kimi_k3', { ok: true, latencyMs: 2000 });

  // 10 samples at 1000 plus one at 2000 averages to about 1091, not to 2000.
  assert.ok(after.averageLatencyMs > 1000 && after.averageLatencyMs < 1200, `got ${after.averageLatencyMs}`);

  setProviderHealthStore(null);
  resetModelRuntimeHealth();
});
