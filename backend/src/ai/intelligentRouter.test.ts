import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessComplexity,
  createIntelligentRoutePlan,
  inferTaskClasses,
  rankModelsForSubtask,
  repairTaskClass,
} from './intelligentRouter.js';
import { getRuntimeModelRegistry, type RuntimeModelCapability } from './modelCapabilityRegistry.js';

function healthyRegistry(): RuntimeModelCapability[] {
  return getRuntimeModelRegistry().map((model) => ({
    ...model,
    configured: true,
    enabled: true,
    health: {
      ...model.health,
      status: 'healthy',
      successes: 10,
      failures: 0,
      recentFailureRate: 0,
      validationSuccesses: 9,
      validationFailures: 1,
      validationSuccessRate: 0.9,
    },
  }));
}

describe('intelligent router evaluation framework', () => {
  it('routes a small focused edit through cost-efficient coding', () => {
    const plan = createIntelligentRoutePlan({
      prompt: 'Change the button label in one component',
      mode: 'cost',
      affectedFiles: ['Button.tsx'],
      registry: healthyRegistry(),
    });
    const implementation = plan.subtasks.find((task) => task.taskClass === 'code_generation');
    assert.equal(implementation?.selectedModel, 'deepseek_v4_1_flash_1017');
    assert.equal(plan.reviewRequired, false);
  });

  it('routes large repository understanding to a broad-context model', () => {
    const plan = createIntelligentRoutePlan({
      prompt: 'Analyze this large repository and refactor its cross-file architecture',
      repositoryFileCount: 800,
      mode: 'intelligence',
      registry: healthyRegistry(),
    });
    const repository = plan.subtasks.find((task) => task.taskClass === 'repository_analysis');
    assert.equal(repository?.selectedModel, 'deepseek_v4_1_flash_1017');
    assert.equal(plan.contextStrategy.includeFullRepository, false);
  });

  it('creates a controlled graph for a multi-file full-stack feature', () => {
    const plan = createIntelligentRoutePlan({
      prompt: 'Build a full-stack feature with frontend, backend API, OAuth, database, tests and deploy',
      affectedFileCount: 18,
      registry: healthyRegistry(),
    });
    assert.ok(plan.subtasks.length >= 5);
    assert.ok(plan.subtasks.every((task) => task.expectedOutput && task.validation.length));
    assert.equal(plan.reviewRequired, true);
  });

  it('routes current web, X, and crypto research to research capability', () => {
    for (const prompt of [
      'Research current official SDK documentation',
      'Research current X.com discussion',
      'Research current crypto ecosystem integrations',
    ]) {
      const classes = inferTaskClasses(prompt);
      assert.ok(classes.some((taskClass) => taskClass.includes('research')));
    }
    const ranked = rankModelsForSubtask('x_research', {
      mode: 'balanced',
      complexity: assessComplexity({ prompt: 'current X.com research' }),
      requiredTokens: 4096,
      registry: healthyRegistry(),
    });
    assert.equal(ranked[0], 'deepseek_v4_1_flash_1017');
  });

  it('escalates security-sensitive changes to intelligence and independent review', () => {
    const plan = createIntelligentRoutePlan({
      prompt: 'Change OAuth secret handling and database permissions',
      registry: healthyRegistry(),
    });
    assert.equal(plan.mode, 'intelligence');
    assert.equal(plan.reviewRequired, true);
    const review = plan.subtasks.at(-1);
    assert.equal(review?.selectedModel,null);assert.ok(plan.blockers.some(value=>value.includes('distinct healthy configured review model')),'Independent review cannot silently grant Sonnet authority');
  });

  it('maps validation evidence to targeted repair routes', () => {
    assert.equal(repairTaskClass('type'), 'validation_repair');
    assert.equal(repairTaskClass('dependency'), 'build_debugging');
    assert.equal(repairTaskClass('deployment'), 'deployment_troubleshooting');
    assert.equal(repairTaskClass('runtime'), 'runtime_debugging');
  });

  it('reports unavailability when the default circuit opens without selecting premium', () => {
    const registry = healthyRegistry().map((model) =>
      model.id === 'deepseek_v4_1_flash_1017'
        ? {
            ...model,
            health: {
              ...model.health,
              status: 'circuit_open' as const,
              recentFailureRate: 1,
            },
          }
        : model,
    );
    const ranked = rankModelsForSubtask('architecture', {
      mode: 'intelligence',
      complexity: assessComplexity({ prompt: 'complex architecture' }),
      requiredTokens: 8192,
      registry,
    });
    assert.deepEqual(ranked,[]);
  });

  it('rejects models whose safe context window is too small', () => {
    const registry = healthyRegistry().map((model) => ({
      ...model,
      maximumSafeRequestTokens: 1000,
    }));
    const ranked = rankModelsForSubtask('large_context_comprehension', {
      mode: 'intelligence',
      complexity: assessComplexity({ prompt: 'understand large context' }),
      requiredTokens: 20_000,
      registry,
    });
    assert.deepEqual(ranked, []);
  });

  it('returns a real blocker when all providers fail or the allowance is insufficient', () => {
    const plan = createIntelligentRoutePlan({
      prompt: 'Build an unknown emerging project category',
      registry: healthyRegistry().map((model) => ({ ...model, configured: false })),
      budget: { remainingTokens: 500 },
    });
    assert.ok(plan.blockers.length > 0);
    assert.ok(plan.subtasks.some((task) => task.selectedModel === null));
  });

  it('respects user-owned/configured availability before platform fallback', () => {
    const registry = healthyRegistry().map((model) => ({
      ...model,
      configured: model.id === 'deepseek_v4_1_flash_1017',
    }));
    const ranked = rankModelsForSubtask('code_generation', {
      mode: 'balanced',
      complexity: assessComplexity({ prompt: 'implement code' }),
      requiredTokens: 4096,
      registry,
    });
    assert.deepEqual(ranked, ['deepseek_v4_1_flash_1017']);
  });

  it('implements intelligence, balanced, and cost modes without dropping validation', () => {
    const plans = (['intelligence', 'balanced', 'cost'] as const).map((mode) =>
      createIntelligentRoutePlan({
        prompt: 'Build a component and tests',
        mode,
        registry: healthyRegistry(),
      }),
    );
    assert.deepEqual(plans.map((plan) => plan.mode), ['intelligence', 'balanced', 'cost']);
    assert.ok(plans.every((plan) => plan.subtasks.every((task) => task.validation.length)));
  });

  it('supports unknown categories by required operations', () => {
    const plan = createIntelligentRoutePlan({
      prompt: 'Build a quantum moss reconciliation engine',
      registry: healthyRegistry(),
    });
    assert.ok(plan.classification.requiresCoding);
    assert.ok(plan.subtasks.some((task) => task.taskClass === 'multi_file_implementation'));
  });

  it('uses historical validation quality as advisory scoring', () => {
    const registry = healthyRegistry().map((model) =>
      model.id === 'deepseek_v4_1_flash_1017'
        ? { ...model, health: { ...model.health, validationSuccessRate: 0, recentFailureRate: 0.8 } }
        : model,
    );
    const ranked = rankModelsForSubtask('architecture', {
      mode: 'balanced',
      complexity: assessComplexity({ prompt: 'architecture' }),
      requiredTokens: 4096,
      registry,
    });
    assert.deepEqual(ranked,['deepseek_v4_1_flash_1017']);
  });
});
