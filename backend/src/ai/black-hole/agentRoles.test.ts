import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AGENT_ROLES,
  EVALUATING_ROLES,
  REVIEW_SEVERITIES,
  WRITING_ROLES,
  agentRole,
  mayShareModel,
  reviewApproved,
  roleMayPerform,
  type AgentRoleId,
  type ReviewFinding,
} from './agentRoles.js';

const ALL: AgentRoleId[] = ['planner', 'implementer', 'repairer', 'reviewer', 'verifier'];

test('the role set is small and exactly the five specified', () => {
  // A large autonomous roster creates competing claims about run state, which is the thing
  // the single-authority rule exists to prevent.
  assert.deepEqual(Object.keys(AGENT_ROLES).sort(), [...ALL].sort());
});

test('every role declares a complete contract', () => {
  for (const id of ALL) {
    const role = agentRole(id);
    assert.ok(role.mission.length > 20, `${id} mission`);
    assert.ok(role.requiredInputs.length > 0, `${id} inputs`);
    assert.ok(role.outputSchema.length > 0, `${id} output schema`);
    assert.ok(role.completionCriteria.length > 20, `${id} completion criteria`);
    assert.ok(role.maxIterations > 0 && role.maxIterations <= 5, `${id} iterations bounded`);
    assert.ok(role.maxToolCalls > 0 && role.maxToolCalls <= 100, `${id} tool calls bounded`);
    assert.ok(role.evidenceRequirement.length > 20, `${id} evidence requirement`);
  }
});

// ---------------------------------------------------------------------------
// Least privilege
// ---------------------------------------------------------------------------

test('only the implementer and repairer may write', () => {
  for (const id of ALL) {
    const mayWrite = roleMayPerform(id, 'writeProjectFiles');
    assert.equal(mayWrite, WRITING_ROLES.includes(id), `${id} write authority is wrong`);
  }
});

test('no evaluating role holds any authority at all', () => {
  // A reviewer that can edit is an implementer with a second opinion about its own work.
  for (const id of EVALUATING_ROLES) {
    assert.deepEqual(agentRole(id).authority, [], `${id} must hold no authority`);
  }
});

test('the planner writes nothing', () => {
  // A planner that could write would start implementing, and the plan would stop being
  // reviewable before anything happened.
  assert.deepEqual(agentRole('planner').authority, []);
});

test('no role is offered a tool domain it has no authority for', () => {
  for (const id of ALL) {
    const role = agentRole(id);
    if (role.authority.length === 0) {
      assert.equal(
        role.allowedToolDomains.includes('deployment'),
        false,
        `${id} has no authority but was offered deployment tools`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Evaluator / implementer separation
// ---------------------------------------------------------------------------

test('a writing role and an evaluating role never share a model', () => {
  // Structural, because a component that produces work and grades it grades generously, and
  // no amount of prompting fixes that.
  for (const writer of WRITING_ROLES) {
    for (const evaluator of EVALUATING_ROLES) {
      assert.equal(mayShareModel(writer, evaluator), false, `${writer} + ${evaluator}`);
      assert.equal(mayShareModel(evaluator, writer), false, `${evaluator} + ${writer}`);
    }
  }
});

test('two writing roles may share a model, and so may two evaluators', () => {
  // The direction check: over-applying the rule would make a single-model deployment
  // impossible to run at all.
  assert.equal(mayShareModel('implementer', 'repairer'), true);
  assert.equal(mayShareModel('reviewer', 'verifier'), true);
  assert.equal(mayShareModel('planner', 'implementer'), true);
});

test('writing and evaluating role sets are disjoint', () => {
  for (const id of WRITING_ROLES) {
    assert.equal(EVALUATING_ROLES.includes(id), false, `${id} is in both sets`);
  }
});

// ---------------------------------------------------------------------------
// Repairer — minimal change
// ---------------------------------------------------------------------------

test('the repairer cannot be invoked without concrete evidence', () => {
  // Without it there is nothing to minimise against, and it rewrites whatever looks suspect.
  const role = agentRole('repairer');
  assert.ok(role.requiredInputs.includes('failureEvidence'));
  assert.ok(role.requiredInputs.includes('scope'));
});

test('the repairer contract forbids unrelated refactoring', () => {
  const role = agentRole('repairer');
  assert.match(role.evidenceRequirement, /unrelated refactoring/i);
  assert.match(role.completionCriteria, /outside the declared scope/i);
});

test('repair loops are bounded', () => {
  assert.ok(agentRole('repairer').maxIterations <= 3);
  assert.ok(agentRole('repairer').maxToolCalls <= 40);
});

// ---------------------------------------------------------------------------
// Reviewer — severity, and no invented findings
// ---------------------------------------------------------------------------

test('review severities are the three that get acted on', () => {
  assert.deepEqual([...REVIEW_SEVERITIES], ['blocker', 'recommendation', 'informational']);
});

test('only blockers block', () => {
  // A review process that halts on style produces a team that stops reading reviews.
  const recommendation: ReviewFinding = {
    severity: 'recommendation', file: 'a.ts', summary: 'prefer const', category: 'maintainability',
  };
  const blocker: ReviewFinding = {
    severity: 'blocker', file: 'b.ts', summary: 'SQL injection', category: 'security',
  };
  assert.equal(reviewApproved([recommendation]), true);
  assert.equal(reviewApproved([recommendation, blocker]), false);
});

test('a clean review approves', () => {
  // Zero findings is a valid review. Nothing is invented to satisfy a quota.
  assert.equal(reviewApproved([]), true);
});

test('the reviewer contract explicitly permits zero findings', () => {
  assert.match(agentRole('reviewer').evidenceRequirement, /Zero findings is a valid review/i);
});

// ---------------------------------------------------------------------------
// Verifier — no subjective personas
// ---------------------------------------------------------------------------

test('the verifier contract rejects grading, quotas and forced first failure', () => {
  // Explicitly excluded by the brief: "always find 3-5 issues", "first implementation must
  // fail", arbitrary A+/B/C grades.
  const requirement = agentRole('verifier').evidenceRequirement;
  assert.match(requirement, /no grades/i);
  assert.match(requirement, /no quotas/i);
  assert.match(requirement, /first attempt fail/i);
  assert.match(requirement, /zero problems/i);
});

test('the verifier holds no authority and judges nothing subjectively', () => {
  assert.deepEqual(agentRole('verifier').authority, []);
  assert.match(agentRole('verifier').mission, /Decides nothing subjectively/i);
});

// ---------------------------------------------------------------------------
// Phase 9.13 — one authority owns the run
// ---------------------------------------------------------------------------

test('no role contract claims authority over run completion', () => {
  // The scheduler owns task state and completion. A role that could declare the job done
  // would be a second authority.
  for (const id of ALL) {
    const role = agentRole(id);
    assert.equal(
      /complete the run|declare (the )?(run|job) (complete|done)/i.test(role.mission),
      false,
      `${id} claims completion authority`,
    );
    assert.equal(role.outputSchema.includes('runComplete'), false, `${id} outputs run completion`);
  }
});
