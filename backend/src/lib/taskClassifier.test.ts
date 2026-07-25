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
});

