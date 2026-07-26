import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTimeboxedHackathonPlan, compileHackathonDefinition, evaluateSponsorRequirements, evidenceDigest, rankHackathonCandidates, runGoldenDemo, validateSubmissionPackage } from './hackathonRuntime.js';
import type { ResearchEvidence } from '../research/researchEngine.js';

const official: ResearchEvidence = { id: 'official-rules', url: 'https://hackathon.example/rules', canonicalUrl: 'https://hackathon.example/rules', title: 'Official rules', excerpt: 'Deadline 2026-08-30; build a meaningful integration', contentHash: 'a'.repeat(64), provider: 'direct', trust: 'A_official', fetchedAt: '2026-07-26T00:00:00Z', expiresAt: '2026-08-01T00:00:00Z', citationAllowed: true };

test('hackathon rules and sponsor tracks require fresh official evidence', () => {
  const definition = compileHackathonDefinition({ title: 'Build', organizer: 'Organizer', deadline: '2026-08-30T00:00:00Z', teamSize: { minimum: 1, maximum: 4 }, judgingCriteria: ['impact', 'working demo'], sponsorTracks: [{ id: 'track', name: 'Infrastructure', requiredTechnologies: ['official SDK'], evidenceIds: ['official-rules'] }], deliverables: ['repository', 'demo'], prohibitedActions: ['mainnet funds'], evidence: [official], now: new Date('2026-07-26T00:00:00Z') });
  assert.equal(definition.officialEvidenceIds[0], 'official-rules');
  assert.throws(() => compileHackathonDefinition({ title: 'Build', organizer: 'Organizer', deadline: '2026-08-30T00:00:00Z', teamSize: { minimum: 1, maximum: 4 }, judgingCriteria: ['impact'], sponsorTracks: [{ id: 'bad', name: 'Bad', requiredTechnologies: [], evidenceIds: ['social-only'] }], deliverables: ['repo'], prohibitedActions: [], evidence: [{ ...official, trust: 'D_discovery' }], now: new Date('2026-07-26T00:00:00Z') }));
});

test('candidate ranking values feasibility and depth instead of sponsor count', () => {
  const scores = { userImpact: 8, technicalFeasibility: 8, sponsorFit: 8, demonstrability: 8, originality: 8, buildTime: 8, integrationDepth: 8, securityComplexity: 3, evidenceAvailability: 8, postHackathonPotential: 8 };
  const ranked = rankHackathonCandidates([{ id: 'focused', title: 'Focused', capabilities: ['core'], sponsorTrackIds: ['one'], scores, externalBlockers: [] }, { id: 'name-drop', title: 'Many sponsors', capabilities: ['shallow'], sponsorTrackIds: ['a', 'b', 'c', 'd'], scores: { ...scores, integrationDepth: 1, technicalFeasibility: 4 }, externalBlockers: ['missing credentials'] }]);
  assert.equal(ranked[0].id, 'focused');
});

test('timeboxed plan never demotes security-critical golden journey and reset', () => {
  const plan = buildTimeboxedHackathonPlan({ criticalJourney: 'escrow release', sponsorWorkflow: 'verified oracle', resetWorkflow: 'reset local chain and fixtures', additionalFeatures: ['theme', 'extra chart', 'future mobile'] });
  assert.equal(plan.find((item) => item.id === 'critical-journey')?.priority, 'must_work_for_submission');
  assert.equal(plan.find((item) => item.id === 'demo-reset')?.securityCritical, true);
  assert.equal(plan.at(-1)?.priority, 'post_hackathon');
});

test('sponsor matrix cannot call a requirement satisfied without implementation and validation', () => {
  const requirements = [{ id: 'r1', trackId: 'track', statement: 'Use official SDK', requiredCapability: 'adapter', officialEvidenceId: 'official-rules', required: true }];
  assert.throws(() => evaluateSponsorRequirements(requirements, [{ requirementId: 'r1', implementationEvidenceIds: [], validationEvidenceIds: [], status: 'satisfied' }]));
  assert.equal(evaluateSponsorRequirements(requirements, [{ requirementId: 'r1', implementationEvidenceIds: ['code'], validationEvidenceIds: ['test'], status: 'satisfied' }]).complete, true);
});

test('golden demo resets and replays a real deterministic state transition', async () => {
  let state = 99; const reset = async () => { state = 0; return { evidenceId: evidenceDigest({ action: 'reset', state }), stateDigest: evidenceDigest(state) }; };
  const steps = [{ id: 'create', execute: async () => { state += 1; return { evidenceId: evidenceDigest({ action: 'create', state }), stateDigest: evidenceDigest(state) }; } }, { id: 'complete', execute: async () => { state += 1; return { evidenceId: evidenceDigest({ action: 'complete', state }), stateDigest: evidenceDigest(state) }; } }];
  const result = await runGoldenDemo({ reset, steps, expectedFinalDigest: evidenceDigest(2) }); assert.equal(result.repeatable, true); assert.equal(state, 2);
});

test('submission package rejects placeholders and remains an explicit external action', () => {
  const base = { schema: 'xroga.hackathon-submission' as const, schemaVersion: '1.0.0' as const, migrationPath: ['1.0.0'], title: 'Project', oneSentenceDescription: 'Description', problem: 'Problem', targetUsers: ['user'], solution: 'Solution', blockchainJustification: 'shared verifiability', architecture: ['web', 'contract'], chainNetworks: ['officially verified testnet'], sponsorIntegrations: ['meaningful adapter'], repository: 'Xroga/xroga.com', branch: 'agent/test', commit: 'a'.repeat(40), liveUrl: null, testnetAddresses: [], explorerLinks: [], transactionLinks: [], demoInstructions: ['run locally'], resetCommand: 'npm run demo:reset', environmentTemplate: ['RPC_URL'], localSetup: ['install'], testCommands: ['npm test'], buildCommands: ['npm run build'], deploymentCommands: ['owner-authorized command'], securityNotes: ['no mainnet'], knownLimitations: ['testnet pending'], judgingCriteriaMap: { impact: ['demo'] }, bountyMatrixEvidenceId: 'matrix', demoEvidenceId: 'demo', videoOutline: ['problem', 'demo'], submissionStatus: 'action_required' as const };
  assert.doesNotThrow(() => validateSubmissionPackage(base)); assert.throws(() => validateSubmissionPackage({ ...base, explorerLinks: ['https://example.com/placeholder'] })); assert.throws(() => validateSubmissionPackage({ ...base, environmentTemplate: ['RPC_URL=secret'] }));
});
