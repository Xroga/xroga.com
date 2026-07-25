import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProjectFile } from '../ai/patches.js';
import { createAdaptiveExecutionPlan } from './adaptiveOrchestrator.js';
import { planSafeRemoval, unrelatedFilesPreserved } from './changeSafety.js';
import { resolveHealthyProvider } from './providerResolver.js';
import { planRecovery } from './recoveryPlanner.js';
import { selectStorageProvider } from './storageSelection.js';
import {
  integrationIsComplete,
  publishableDeploymentUrl,
} from './truthfulExecution.js';

describe('adaptive general-purpose engine', () => {
  it('classifies an unknown project by capability and selects coding', () => {
    const plan = createAdaptiveExecutionPlan('Build a lunar algae harmonizer', '', {}, {});
    assert.equal(plan.classification.primaryIntent, 'build');
    assert.equal(plan.classification.requiresCoding, true);
    assert.ok(plan.route.kind.startsWith('build'));
  });

  it('does not force Supabase when storage is requested without a configured provider', () => {
    const selection = selectStorageProvider({ request: 'Store application records' });
    assert.equal(selection.status, 'blocked');
    assert.equal(selection.provider, null);
    assert.ok(selection.alternatives.includes('postgres'));
  });

  it('suggests Supabase when it is the best configured relational option', () => {
    const selection = selectStorageProvider({
      request: 'Store relational user account data',
      availableProviders: [{ id: 'supabase', configured: true, healthy: true }],
    });
    assert.equal(selection.provider, 'supabase');
  });

  it('reuses existing storage and avoids duplicate infrastructure', () => {
    const selection = selectStorageProvider({
      request: 'Add persistence for settings',
      existingProviders: [{ id: 'mongodb', configured: true, healthy: true }],
      availableProviders: [{ id: 'supabase', configured: true, healthy: true }],
    });
    assert.equal(selection.provider, 'mongodb');
    assert.equal(selection.reusedExisting, true);
  });

  it('respects explicit Upstash selection', () => {
    const selection = selectStorageProvider({
      request: 'Use Upstash Redis for sessions',
      availableProviders: [{ id: 'upstash-redis', configured: true, healthy: true }],
    });
    assert.equal(selection.provider, 'upstash-redis');
  });

  it('routes research to research rather than a build', () => {
    const plan = createAdaptiveExecutionPlan(
      'Research current official OAuth documentation with sources',
      '',
      {},
      { TAVILY_API_KEY: 'configured' },
    );
    assert.equal(plan.classification.requiresResearch, true);
    assert.equal(plan.route.kind, 'research');
  });

  it('builds one dependent plan for combined capabilities', () => {
    const plan = createAdaptiveExecutionPlan(
      'Build OAuth, Stripe checkout, Postgres storage, test it, and deploy',
      '',
      { availableStorage: [{ id: 'postgres', configured: true, healthy: true }] },
      {},
    );
    assert.ok(plan.classification.requiredCapabilities.includes('authentication_integration'));
    assert.ok(plan.classification.requiredCapabilities.includes('payment_integration'));
    assert.ok(plan.classification.requiredCapabilities.includes('database_integration'));
    assert.ok(plan.subtasks.some((task) => task.id === 'review'));
  });

  it('requires and selects a distinct healthy reviewer for high-risk work', () => {
    const plan = createAdaptiveExecutionPlan(
      'Secure and deploy this application',
      '',
      {
        modelProviders: [
          { id: 'kimi_k3', configured: true, healthy: true, supports: ['generate'] },
          { id: 'glm_5_2', configured: true, healthy: true, supports: ['generate'] },
        ],
      },
      {},
    );
    assert.equal(plan.route.primaryModel, 'kimi_k3');
    assert.equal(plan.route.reviewerModel, 'glm_5_2');
  });

  it('uses a healthy fallback after the preferred provider fails', () => {
    const result = resolveHealthyProvider(
      'generate',
      [
        {
          id: 'primary',
          configured: true,
          healthy: false,
          supports: ['generate'],
          failureReason: 'runtime health probe failed',
        },
        { id: 'fallback', configured: true, healthy: true, supports: ['generate'] },
      ],
      'primary',
    );
    assert.equal(result.selected, 'fallback');
    assert.match(result.reason, /health probe failed/);
  });

  it('does not treat an environment key alone as runtime health', () => {
    const result = resolveHealthyProvider('generate', [
      { id: 'configured-only', configured: true, supports: ['generate'] },
    ]);
    assert.equal(result.status, 'blocked');
    assert.match(result.blocker || '', /runtime health not verified/);
  });

  it('plans targeted bounded recovery from generation failure', () => {
    const result = planRecovery('src/app.ts:21 error TS2322: type mismatch', 1, 3);
    assert.equal(result.category, 'type');
    assert.deepEqual(result.targetFiles, ['src/app.ts']);
    assert.equal(result.canRetry, true);
    assert.equal(result.preserveLastValidState, true);
  });

  it('finds dependent code during removal', () => {
    const files: ProjectFile[] = [
      { path: 'src/legacy.ts', content: 'export const legacy = true;' },
      { path: 'src/app.ts', content: "import { legacy } from './legacy';" },
      { path: 'src/unrelated.ts', content: 'export const safe = true;' },
    ];
    const result = planSafeRemoval(files, ['src/legacy.ts']);
    assert.deepEqual(result.dependentPaths, ['src/app.ts']);
    assert.ok(result.preservedPaths.includes('src/unrelated.ts'));
  });

  it('verifies repository updates preserve unrelated files', () => {
    const before: ProjectFile[] = [
      { path: 'src/a.ts', content: 'old' },
      { path: 'src/b.ts', content: 'untouched' },
    ];
    const after: ProjectFile[] = [
      { path: 'src/a.ts', content: 'new' },
      { path: 'src/b.ts', content: 'untouched' },
    ];
    assert.equal(unrelatedFilesPreserved(before, after, ['src/a.ts']), true);
  });

  it('returns the exact provider blocker for a missing credential', () => {
    const result = resolveHealthyProvider('send', [
      { id: 'email', configured: false, supports: ['send'] },
    ]);
    assert.equal(result.status, 'blocked');
    assert.match(result.blocker || '', /email: not configured/);
  });

  it('does not call a failed integration connected', () => {
    assert.equal(
      integrationIsComplete({
        configurationValid: true,
        authenticatedApiCallOk: false,
        applicationConsumesResponse: true,
        errorHandlingVerified: true,
        secretsServerSide: true,
      }),
      false,
    );
  });

  it('does not expose a live URL after failed deployment verification', () => {
    assert.equal(
      publishableDeploymentUrl({
        providerAccepted: true,
        reachable: false,
        url: 'https://failed.example',
      }),
      undefined,
    );
  });
});
