import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { synthesizeProductDefinition } from './productDefinition.js';
import { buildCapabilityGraph, compileCapabilitySpecifications, validateCapabilityGraph } from './capabilityGraph.js';

describe('dynamic capability graph compiler', () => {
  it('creates typed relationships and executable, never pre-completed tasks', () => {
    const definition = synthesizeProductDefinition({ prompt: 'Build a warehouse intake system with staff approvals, persistent stock, async reconciliation and daily reports' });
    const graph = buildCapabilityGraph(definition);
    const plan = compileCapabilitySpecifications(graph, definition);
    assert.deepEqual(validateCapabilityGraph(graph), []);
    assert.ok(graph.nodes.some((node) => node.id === 'background-execution'));
    assert.ok(graph.relationships.some((edge) => edge.kind === 'requires'));
    assert.ok(plan.tasks.length >= graph.nodes.length * 2);
    for (const task of plan.tasks) {
      assert.notEqual(task.status, 'completed');
      assert.ok(task.validationMethod.length > 0);
      assert.ok(task.evidenceRequirements.length > 0);
      assert.ok(task.expectedOutputSchema);
      assert.ok(task.timeoutMs > 0);
    }
  });
});
