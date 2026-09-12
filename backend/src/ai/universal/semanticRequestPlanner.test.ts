import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { universalCapabilityRegistry } from '../../capabilities/index.js';
import { dispatchForGoal, interpreterModelOrder, planExplicitProjectBuild, protocolSocialResponse, resolveStructuredGoalContract, unresolvedGoalBlockers } from './semanticRequestPlanner.js';
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

  it('does not block authorized read-only research when the interpreter uses the broad external-action label', () => {
    assert.equal(
      dispatchForGoal(
        goal({ semanticIntent: 'EXTERNAL_ACTION' }),
        ['research.public-web', 'conversation.respond'],
      ),
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
    for (const id of ['attachment.analyze', 'conversation.respond', 'research.public-web', 'research.x', 'repository.read', 'repository.write', 'software.implement', 'validation.run']) {
      assert.ok(ids.has(id), `${id} missing`);
    }
  });

  it('never substitutes a generic scaffold when every implementation provider fails', () => {
    const pipeline = readFileSync(new URL('../pipeline.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(pipeline, /Builder routes returned no files — using the deterministic scaffold/);
    assert.doesNotMatch(pipeline, /AI route was unavailable — continuing with Xroga’s local project generator/);
  });

  it('offers the real validation sandbox without granting unrelated external authority', () => {
    const planner = readFileSync(new URL('./semanticRequestPlanner.ts', import.meta.url), 'utf8');
    assert.match(planner, /\['model:execute', 'sandbox:execute'\]/);
    assert.doesNotMatch(planner, /authorities\.add\('deploy:execute'\)/);
  });
});

describe('semantic authority blockers', () => {
  it('does not let model prose revoke an authority the runtime granted', () => {
    const blockers = unresolvedGoalBlockers([
      'Missing authority for validation.run: sandbox:execute.',
      'An essential product decision is still missing.',
    ], new Set(['model:execute', 'sandbox:execute']));
    assert.deepEqual(blockers, ['An essential product decision is still missing.']);
  });

  it('retains a blocker for authority the runtime did not grant', () => {
    const blockers = unresolvedGoalBlockers(
      ['Missing authority repository:write; user approval is required.'],
      new Set(['model:execute', 'sandbox:execute']),
    );
    assert.equal(blockers.length, 1);
  });
});

describe('semantic planner provider fallback', () => {
  it('uses every configured member of the approved model stack in stable order', () => {
    const order = interpreterModelOrder({
      DEEPSEEK_API_KEY: 'configured',
      Z_AI_API_KEY: 'configured',
      MOONSHOT_API_KEY: 'configured',
    });
    assert.deepEqual(order, ['deepseek_v4_flash', 'glm_5_3_flash', 'glm_5_3', 'kimi_k3']);
  });

  it('does not introduce a retired or private retrieval model', () => {
    const source = readFileSync(new URL('./semanticRequestPlanner.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /grok_4_3|grok-4\.3|kimi_k2_7|glm_5_2|deepseek_v4_pro|grok_4_5/);
    assert.match(source, /executeWithProviderFallback/);
  });

  it('repairs one malformed semantic output and safely strips commentary fields', async () => {
    let calls = 0;
    const contract = await resolveStructuredGoalContract(async (hint) => {
      calls += 1;
      if (!hint) return 'not json at all';
      return `Planning result:\n\`\`\`json\n${JSON.stringify({
        ...goal({ semanticIntent: 'PROPOSE' }),
        commentary: 'not part of the canonical contract',
      })}\n\`\`\``;
    });
    assert.equal(calls, 2);
    assert.equal(contract.semanticIntent, 'PROPOSE');
    assert.equal('commentary' in contract, false);
  });

  it('caps semantic fallback to two routes and a bounded total deadline', () => {
    const source = readFileSync(new URL('./semanticRequestPlanner.ts', import.meta.url), 'utf8');
    assert.match(source, /interpreterModelOrder\(\)\.slice\(0, 2\)/);
    assert.match(source, /SEMANTIC_PLANNER_TOTAL_TIMEOUT_MS/);
    assert.match(source, /correctionUsed \? 0 : 1/);
    assert.doesNotMatch(source, /timeoutMs:\s*45_000/);
  });
});

describe('social protocol fast path', () => {
  it('answers only bounded social turns and never questions or attached requests', () => {
    assert.match(protocolSocialResponse('hello') ?? '', /help you/i);
    assert.equal(protocolSocialResponse('Can you build a parser?'), null);
    assert.equal(protocolSocialResponse('hello?', false), null);
    assert.equal(protocolSocialResponse('hi', true), null);
  });
});

describe('explicit universal build command', () => {
  it('routes the canonical arbitrary project directly without guessing a product type', async () => {
    const plan = await planExplicitProjectBuild({
      userId: 'generated-user',
      message: '/build update the selected source and run its tests',
      projectContext: { repo: 'arbitrary-owner/arbitrary-repository', branch: 'topic/generated-branch', projectRoot: '/packages/tool' },
    });
    assert.equal(plan.dispatch, 'build');
    assert.equal(plan.goalContract.semanticIntent, 'MODIFY');
    assert.deepEqual(plan.goalContract.projectContext, {
      repo: 'arbitrary-owner/arbitrary-repository', branch: 'topic/generated-branch', projectRoot: '/packages/tool',
    });
    assert.deepEqual(plan.capabilityIds, ['repository.read', 'software.implement', 'validation.run', 'repository.write']);
    assert.doesNotMatch(plan.goalContract.goal, /^\/build/);
  });

  it('refuses an empty explicit build command', async () => {
    await assert.rejects(
      planExplicitProjectBuild({ userId: 'generated-user', message: '/build', projectContext: { repo: 'o/r', branch: 'b', projectRoot: '/' } }),
      (error: unknown) => (error as { code?: string }).code === 'INVALID_GOAL',
    );
  });
});
