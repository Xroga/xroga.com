import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AGENT_INTELLIGENCE_CONDITIONS,
  deriveAgentIntelligenceStatus,
  deriveCommand3OverallStatus,
  type AgentIntelligenceEvidence,
  type Command3BRequirement,
} from './completionGate.js';

/**
 * The Command 3 status model: Agent Intelligence completion is derived, never declared.
 *
 * The failure prevented is a success string invented outside the completion system — which
 * the command forbids by name, and which is the easiest possible way to report a milestone
 * finished. There is no field a caller can set to `agent_intelligence_verified`.
 */

const ALL: AgentIntelligenceEvidence = {
  rolesEnforced: true,
  providerIsolationEnforced: true,
  canonicalTasksExecute: true,
  incrementalImplementation: true,
  measuredRoutingEvidence: true,
  capabilityMaturityDerived: true,
  liveRunProducedCommit: true,
  rolloutReturnedToSafeMode: true,
};

const verifiedRequirement = (id: string): Command3BRequirement => ({
  id,
  mandatory: true,
  status: 'verified',
  evidence: [`evidence for ${id}`],
});

test('nothing proven is incomplete, and names every outstanding condition', () => {
  const status = deriveAgentIntelligenceStatus({});
  assert.equal(status.status, 'agent_intelligence_incomplete');
  assert.deepEqual([...status.outstanding].sort(), [...AGENT_INTELLIGENCE_CONDITIONS].sort());
});

test('every condition is required — none may be waived', () => {
  assert.equal(deriveAgentIntelligenceStatus(ALL).status, 'agent_intelligence_verified');
  for (const key of AGENT_INTELLIGENCE_CONDITIONS) {
    const status = deriveAgentIntelligenceStatus({ ...ALL, [key]: false });
    assert.equal(status.status, 'agent_intelligence_incomplete', `${key} was waivable`);
    assert.deepEqual(status.outstanding, [key]);
  }
});

test('a missing condition is treated as unmet rather than assumed', () => {
  // `undefined` must not read as true. The direction matters: an unset fact is not evidence.
  const { rolesEnforced: _omitted, ...withoutOne } = ALL;
  const status = deriveAgentIntelligenceStatus(withoutOne);
  assert.equal(status.status, 'agent_intelligence_incomplete');
  assert.deepEqual(status.outstanding, ['rolesEnforced']);
});

test('a truthy non-boolean does not satisfy a condition', () => {
  const status = deriveAgentIntelligenceStatus({
    ...ALL,
    liveRunProducedCommit: 'yes' as unknown as boolean,
  });
  assert.equal(status.status, 'agent_intelligence_incomplete');
  assert.deepEqual(status.outstanding, ['liveRunProducedCommit']);
});

test('the live-run condition reflects the current real state', () => {
  // As of this commit no universal run has produced a commit, so the honest status is
  // incomplete and this test documents which condition is open.
  const status = deriveAgentIntelligenceStatus({
    ...ALL,
    liveRunProducedCommit: false,
    rolloutReturnedToSafeMode: false,
  });
  assert.equal(status.status, 'agent_intelligence_incomplete');
  assert.deepEqual([...status.outstanding].sort(), ['liveRunProducedCommit', 'rolloutReturnedToSafeMode']);
});

test('Operations/Growth verification alone does not verify Command 3', () => {
  // The distinction that matters: a passing Operations suite must never imply that the
  // canonical runtime implements.
  const overall = deriveCommand3OverallStatus({
    command3b: [verifiedRequirement('C3B-01')],
    command3c: [verifiedRequirement('C3C-01')],
    agentIntelligence: { ...ALL, liveRunProducedCommit: false },
  });
  assert.equal(overall.complete, 'production_operations_growth_verified');
  assert.equal(overall.agentIntelligence, 'agent_intelligence_incomplete');
  assert.equal(overall.overall, 'command_3_incomplete');
});

test('Agent Intelligence alone does not verify Command 3 either', () => {
  const overall = deriveCommand3OverallStatus({
    command3b: [{ id: 'C3B-01', mandatory: true, status: 'blocked', evidence: [] }],
    command3c: [verifiedRequirement('C3C-01')],
    agentIntelligence: ALL,
  });
  assert.equal(overall.agentIntelligence, 'agent_intelligence_verified');
  assert.equal(overall.complete, 'production_operations_growth_blocked');
  assert.equal(overall.overall, 'command_3_incomplete');
});

test('both halves verified yields command_3_verified', () => {
  const overall = deriveCommand3OverallStatus({
    command3b: [verifiedRequirement('C3B-01')],
    command3c: [verifiedRequirement('C3C-01')],
    agentIntelligence: ALL,
  });
  assert.equal(overall.overall, 'command_3_verified');
});

test('a requirement marked verified with no evidence blocks the historical half', () => {
  // Preserved behaviour from the existing gate: "verified" without evidence is dishonest
  // and must not pass.
  const overall = deriveCommand3OverallStatus({
    command3b: [{ id: 'C3B-01', mandatory: true, status: 'verified', evidence: [] }],
    command3c: [verifiedRequirement('C3C-01')],
    agentIntelligence: ALL,
  });
  assert.equal(overall.command3b, 'command_3b_blocked');
  assert.equal(overall.overall, 'command_3_incomplete');
});

test('outstanding conditions are reported on the overall status', () => {
  const overall = deriveCommand3OverallStatus({
    command3b: [verifiedRequirement('C3B-01')],
    command3c: [verifiedRequirement('C3C-01')],
    agentIntelligence: { rolesEnforced: true, providerIsolationEnforced: true },
  });
  assert.ok(overall.agentIntelligenceOutstanding.includes('liveRunProducedCommit'));
  assert.equal(overall.agentIntelligenceOutstanding.includes('rolesEnforced'), false);
});
