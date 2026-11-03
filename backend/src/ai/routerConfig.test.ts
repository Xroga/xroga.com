import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getRouterAdminConfig, routingModeForPlan } from './routerConfig.js';

describe('router administrator configuration', () => {
  it('applies server-side provider, model, budget, fallback, and repair controls', () => {
    const env = {
      XROGA_ALLOWED_MODELS: 'claude_sonnet_5_5,deepseek_v4_1_flash_1017',
      XROGA_DISABLED_PROVIDERS: 'moonshot',
      XROGA_ROUTING_MODE: 'cost',
      XROGA_MAX_REPAIR_ATTEMPTS: '4',
      XROGA_PER_TASK_TOKEN_CAP: '12000',
      XROGA_PROVIDER_BUDGETS_JSON: '{"zhipu":4.5}',
      XROGA_MODEL_FALLBACK_ORDER: 'deepseek_v4_flash,glm_5_3',
      XROGA_FORCE_RESEARCH_TASK_CLASSES: 'api_discovery,documentation_lookup',
    };
    const config = getRouterAdminConfig(env);
    assert.deepEqual(config.allowedModels, ['deepseek_v4_1_flash_1017', 'claude_sonnet_5_5']);
    assert.equal(config.enabledProviders.includes('moonshot'), false);
    assert.equal(config.defaultMode, 'cost');
    assert.equal(config.maxRepairAttempts, 4);
    assert.equal(config.perTaskTokenCap, 12000);
    assert.equal(config.providerBudgetUsd.zhipu, 4.5);
    assert.deepEqual(config.fallbackOrder, []);
  });

  it('supports plan-specific routing modes without exposing controls to normal users', () => {
    const env = {
      XROGA_ROUTING_MODE: 'balanced',
      XROGA_PLAN_ROUTING_MODES_JSON: '{"enterprise":"intelligence","starter":"cost"}',
    };
    assert.equal(routingModeForPlan('enterprise', env), 'intelligence');
    assert.equal(routingModeForPlan('starter', env), 'cost');
    assert.equal(routingModeForPlan('unknown', env), 'balanced');
  });
});
