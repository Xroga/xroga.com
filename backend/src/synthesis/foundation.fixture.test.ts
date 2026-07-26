import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryExecutionStateStore } from '../ai/executionRuntime.js';
import { runUniversalSynthesisFoundation } from './foundation.js';

const fixtures = [
  { id: 'clinic', prompt: 'Build a multi-tenant clinic booking portal where patients request appointments, staff approve them, and email confirmation is sent', expected: 'full_stack_web_application' },
  { id: 'cli', prompt: 'Create a stateless command line CLI that converts CSV to JSON on stdout only with no database or storage', expected: 'command_line_tool' },
  { id: 'logistics', prompt: 'Build a warehouse logistics system with stock intake, staff approvals, async reconciliation workers and daily operational reports', expected: 'full_stack_web_application' },
] as const;

describe('non-crypto universal synthesis black-box fixtures', () => {
  for (const fixture of fixtures) it(`executes and persists ${fixture.id}`, async () => {
    const store = new InMemoryExecutionStateStore();
    const result = await runUniversalSynthesisFoundation({
      prompt: fixture.prompt, projectId: fixture.id, runId: `${fixture.id}-run`, files: [], store,
    });
    assert.equal(result.artifacts.architecture.primary, fixture.expected);
    assert.ok(result.state.tasks.every((task) => task.status === 'completed' && task.evidence.length > 0));
    assert.ok(result.artifacts.compiledPlan.tasks.every((task) => task.status !== 'completed'));
    assert.match(result.artifacts.evidenceHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(result.artifacts.productDefinition.blockchainCapabilities, []);
    const reloaded = await store.load(`${fixture.id}-run`);
    assert.equal(reloaded?.productManifest.synthesisEvidenceHash, result.artifacts.evidenceHash);
  });
});
