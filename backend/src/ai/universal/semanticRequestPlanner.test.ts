import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { universalCapabilityRegistry } from '../../capabilities/index.js';
import { dispatchForGoal } from './semanticRequestPlanner.js';
import { goalContractSchema, type GoalContract } from './goalContract.js';
import { readFileSync } from 'node:fs';

function goal(overrides: Partial<GoalContract> = {}): GoalContract {
  return goalContractSchema.parse({
    version: '1.0',
    goal: 'arbitrary user outcome',
    desiredOutcome: 'the requested outcome',
    semanticIntent: 'ANSWER',
    constraints: [],
    acceptance: [],
    historyContext: [],
    projectContext: null,
    deliverables: [],
    requiredCapabilities: ['conversation.respond'],
    requiredAuthorities: [],
    risks: [],
    confidence: 0.9,
    blockers: [],
    contextComplexity: 'low',
    ...overrides,
  });
}

describe('semantic request dispatch', () => {
  it('keeps a normal answer and public research out of the build path', () => {
    assert.equal(dispatchForGoal(goal(), ['conversation.respond']), 'chat');
    assert.equal(
      dispatchForGoal(goal({ semanticIntent: 'INVESTIGATE' }), ['research.public-web', 'conversation.respond']),
      'chat',
    );
  });

  it('treats an active repository as context rather than mutation intent', () => {
    const readOnly = goal({
      semanticIntent: 'INVESTIGATE',
      projectContext: { repo: 'generated-owner/generated-repository', branch: 'feature/arbitrary-branch', projectRoot: '/' },
      requiredCapabilities: ['repository.read', 'conversation.respond'],
    });
    assert.equal(dispatchForGoal(readOnly, readOnly.requiredCapabilities), 'chat');
  });

  it('routes real implementation to build and refuses unfulfilled external actions', () => {
    assert.equal(dispatchForGoal(goal({ semanticIntent: 'MODIFY' }), ['software.implement', 'repository.write']), 'build');
    assert.equal(dispatchForGoal(goal({ semanticIntent: 'EXTERNAL_ACTION' }), ['conversation.respond']), 'blocked');
  });

  it('registers user-facing read, response, research, implementation, validation, and write capabilities', () => {
    const ids = new Set(universalCapabilityRegistry.list().map((item) => String(item.id)));
    for (const id of ['attachment.analyze', 'conversation.respond', 'research.public-web', 'repository.read', 'repository.write', 'software.implement', 'validation.run']) {
      assert.ok(ids.has(id), `${id} missing`);
    }
  });

  it('never substitutes a generic scaffold when every implementation provider fails', () => {
    const pipeline = readFileSync(new URL('../pipeline.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(pipeline, /Builder routes returned no files — using the deterministic scaffold/);
    assert.doesNotMatch(pipeline, /AI route was unavailable — continuing with Xroga’s local project generator/);
  });
});
