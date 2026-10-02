import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SemanticRequestPlan } from './api';
import { requiresSoftwareExecution } from './semanticExecution';

function plan(overrides: Partial<SemanticRequestPlan> = {}): SemanticRequestPlan {
  return {
    goalContract: {
      version: '1.0',
      goal: 'Answer a question',
      desiredOutcome: 'A concise answer',
      semanticIntent: 'ANSWER',
      constraints: [],
      acceptance: [],
      historyContext: [],
      projectContext: null,
      deliverables: [],
      requiredCapabilities: ['conversation.respond'],
      requiredAuthorities: [],
      freshnessRequirement: 'NONE',
      sourcePolicy: {
        mode: 'any',
        scope: 'public_web',
        officialDomains: [],
      },
      previewRequirement: 'NONE',
      publicationRequirement: 'NONE',
      deploymentRequirement: 'NONE',
      evidencePolicy: {
        requireSources: false,
        requireCitationLinkage: false,
        rejectUncitedEvidence: false,
      },
      sideEffectPolicy: {
        mutationRequested: false,
        deploymentRequested: false,
      },
      blockers: [],
      confidence: 1,
      ...overrides.goalContract,
    },
    dispatch: 'chat',
    capabilityIds: ['conversation.respond'],
    rationale: 'test',
    blockers: [],
    usage: {
      inputTokensUsed: 0,
      outputTokensUsed: 0,
      totalTokensUsed: 0,
      inputTokensRemaining: 1,
      outputTokensRemaining: 1,
      totalTokensRemaining: 1,
      percentUsed: 0,
      quotaPeriodStart: '2026-10-01',
      emergencyTokensAvailable: false,
      emergencyTokensClaimedThisMonth: false,
      totalLimit: 1,
      planTier: 'free',
    },
    ...overrides,
  };
}

test('chat remains on the chat lane', () => {
  assert.equal(requiresSoftwareExecution(plan()), false);
});

test('a Preview contract cannot be sent to chat when the dispatch projection disagrees', () => {
  assert.equal(requiresSoftwareExecution(plan({
    dispatch: 'chat',
    goalContract: {
      ...plan().goalContract,
      previewRequirement: 'REQUIRED',
      requiredCapabilities: ['business.action'],
    },
  })), true);
});

test('software implementation capability remains authoritative when dispatch is stale', () => {
  assert.equal(requiresSoftwareExecution(plan({
    dispatch: 'chat',
    goalContract: {
      ...plan().goalContract,
      requiredCapabilities: ['software.implement', 'validation.run'],
    },
  })), true);
});

test('a real blocked decision remains blocked even if Preview was requested', () => {
  assert.equal(requiresSoftwareExecution(plan({
    dispatch: 'blocked',
    goalContract: {
      ...plan().goalContract,
      previewRequirement: 'REQUIRED',
    },
  })), false);
});
