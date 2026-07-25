import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  executeWithProviderFallback,
  getModelRuntimeHealth,
  normalizeProviderError,
  recordModelExecution,
  recordModelValidation,
  resetModelRuntimeHealth,
} from './providerRuntime.js';

describe('provider runtime health', () => {
  beforeEach(() => resetModelRuntimeHealth());

  it('does not retry invalid credentials, model IDs, or context overflow', () => {
    assert.equal(normalizeProviderError({ status: 401, message: 'invalid API key' }).retryable, false);
    assert.equal(normalizeProviderError({ status: 404, message: 'model not found' }).kind, 'invalid_model');
    assert.equal(normalizeProviderError(new Error('maximum context length exceeded')).retryable, false);
  });

  it('allows bounded retry for timeout, rate limit, and transient failures', () => {
    assert.equal(normalizeProviderError(new Error('request timed out')).retryable, true);
    assert.equal(normalizeProviderError({ status: 429, message: 'rate limit' }).kind, 'rate_limit');
    assert.equal(normalizeProviderError({ status: 503, message: 'unavailable' }).retryable, true);
  });

  it('opens a circuit after repeated failures and recovers after the window', () => {
    recordModelExecution('glm_5_2', { ok: false, latencyMs: 10, error: new Error('timeout') }, 1);
    recordModelExecution('glm_5_2', { ok: false, latencyMs: 10, error: new Error('timeout') }, 2);
    const opened = recordModelExecution('glm_5_2', { ok: false, latencyMs: 10, error: new Error('timeout') }, 3);
    assert.equal(opened.status, 'circuit_open');
    const recovered = getModelRuntimeHealth(
      'glm_5_2',
      new Date(opened.circuitOpenUntil || 0).getTime() + 1,
    );
    assert.equal(recovered.status, 'degraded');
  });

  it('tracks execution and validation history without prompt or secret content', () => {
    recordModelExecution('kimi_k3', { ok: true, latencyMs: 120 });
    recordModelValidation('kimi_k3', true);
    const value = getModelRuntimeHealth('kimi_k3');
    assert.equal(value.status, 'healthy');
    assert.equal(value.averageLatencyMs, 120);
    assert.equal(value.validationSuccessRate, 1);
    assert.equal('prompt' in value, false);
  });

  it('falls back after rate limits and returns only one successful result', async () => {
    const calls: string[] = [];
    const result = await executeWithProviderFallback({
      routes: ['kimi_k3', 'glm_5_2'], maximumAttemptsPerRoute: 1,
      execute: async (model) => {
        calls.push(model);
        if (model === 'kimi_k3') throw Object.assign(new Error('rate limit'), { status: 429 });
        return { patch: 'single mutation' };
      },
    });
    assert.equal(result.modelId, 'glm_5_2');
    assert.deepEqual(calls, ['kimi_k3', 'glm_5_2']);
    assert.equal(result.value.patch, 'single mutation');
  });

  it('does not retry authentication, invalid model, invalid request, or context failures', async () => {
    for (const error of [
      Object.assign(new Error('invalid API key'), { status: 401 }),
      new Error('model not found'), new Error('malformed invalid request'), new Error('maximum context length exceeded'),
    ]) {
      resetModelRuntimeHealth();
      let calls = 0;
      await assert.rejects(() => executeWithProviderFallback({
        routes: ['kimi_k3'], maximumAttemptsPerRoute: 3, execute: async () => { calls += 1; throw error; },
      }));
      assert.equal(calls, 1);
    }
  });

  it('classifies timeout, opens the circuit, and reports all-provider failure safely', async () => {
    await assert.rejects(() => executeWithProviderFallback({
      routes: ['deepseek_v4_flash'], timeoutMs: 5, maximumAttemptsPerRoute: 1,
      execute: async (_model, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true })),
    }), /All compatible provider routes failed/);
    const health = getModelRuntimeHealth('deepseek_v4_flash');
    assert.equal(health.lastFailureKind, 'timeout');
  });
});
