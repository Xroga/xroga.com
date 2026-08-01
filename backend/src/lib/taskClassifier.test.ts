import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyTaskRequest } from './taskClassifier.js';

describe('task classifier', () => {
  it('accepts an unknown product category when the requested operation is feasible', () => {
    const result = classifyTaskRequest(
      'Build a quantum grape synchronizer for my existing repository',
    );
    assert.equal(result.primaryIntent, 'build');
    assert.equal(result.requiresCoding, true);
    assert.ok(result.requiredCapabilities.includes('software_engineering'));
    assert.ok(result.requiredCapabilities.includes('github_operations'));
  });

  it('does not force pure research into a coding workflow', () => {
    const result = classifyTaskRequest(
      'Research current accessibility standards and cite official sources',
    );
    assert.equal(result.requiresCoding, false);
    assert.equal(result.requiresResearch, true);
    assert.ok(result.requiredCapabilities.includes('web_research'));
  });

  it('honors an explicit instruction not to research during a ship-only run', () => {
    const result = classifyTaskRequest(
      'Ship the current saved project. Do not research, browse, or redesign it. Push to GitHub and deploy to Vercel.',
    );
    assert.equal(result.requiresCoding, true);
    assert.equal(result.requiresResearch, false);
    assert.equal(result.requiredCapabilities.includes('web_research'), false);
    assert.equal(result.requiredCapabilities.includes('x_research'), false);
    assert.ok(result.requiredCapabilities.includes('github_operations'));
    assert.ok(result.requiredCapabilities.includes('vercel_operations'));
  });

  it('selects capabilities from the task rather than the industry', () => {
    const result = classifyTaskRequest(
      'Connect OAuth, Supabase, Stripe checkout, and deploy this unusual museum workflow to Vercel',
    );
    assert.ok(result.requiredCapabilities.includes('authentication_integration'));
    assert.ok(result.requiredCapabilities.includes('database_integration'));
    assert.ok(result.requiredCapabilities.includes('payment_integration'));
    assert.ok(result.requiredCapabilities.includes('deployment'));
    assert.ok(result.requiredCapabilities.includes('vercel_operations'));
    assert.equal(result.requiresUserAuthorization, true);
  });

  it('recognizes recovery, replacement, migration, redeploy, rollback, and secure operations', () => {
    const result = classifyTaskRequest(
      'Recover the failed migration, replace storage, secure it, redeploy, then rollback if verification fails',
    );
    for (const intent of ['recover', 'migrate', 'replace', 'secure', 'redeploy', 'rollback'] as const) {
      assert.ok(result.intents.includes(intent), intent);
    }
    assert.ok(result.requiredCapabilities.includes('database_integration'));
    assert.ok(result.requiredCapabilities.includes('security_review'));
    assert.ok(result.requiredCapabilities.includes('deployment'));
  });
});

