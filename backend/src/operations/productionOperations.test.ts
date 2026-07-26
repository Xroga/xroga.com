import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EvidenceStore, IdempotencyRegistry, createRollbackPlan, evaluatePromotion,
  evaluateReadiness, immutableRelease, redactOperationalText, shouldOpenIncident,
  transitionDeployment, authorizeOperation, compareSchema, evaluateSloWindow,
  finalProductionOutcome, safeConfigurationStatus, validateInventory,
} from './productionOperations.js';

const release = () => immutableRelease({
  commitSha: '8d96593ac0ca069069ce3f414ed72ed03d46c8ba', artifact: 'image:v1',
  environment: 'production', buildCommand: 'npm run build', buildExitCode: 0,
  createdAt: '2026-07-26T00:00:00.000Z',
});

test('release provenance is deterministic and failed builds are rejected', () => {
  assert.equal(release().id, release().id);
  assert.throws(() => immutableRelease({ commitSha: 'abcdef1', artifact: 'bad', environment: 'production', buildCommand: 'npm run build', buildExitCode: 1 }));
});

test('promotion requires evidence and explicit approval', () => {
  assert.equal(evaluatePromotion({ release: release(), requiredChecks: [{ id: 'smoke', passed: true }], approvals: [] }).allowed, false);
  assert.equal(evaluatePromotion({ release: release(), requiredChecks: [{ id: 'smoke', passed: true, evidenceId: 'ev_1' }], approvals: [{ actorId: 'u1', role: 'release_manager', approvedAt: 'now' }] }).allowed, true);
});

test('deployment transitions reject impossible provider states', () => {
  assert.equal(transitionDeployment('building', 'ready'), 'ready');
  assert.throws(() => transitionDeployment('created', 'promoted'));
});

test('required unknown checks block readiness while optional unknown is truthful', () => {
  assert.equal(evaluateReadiness([{ id: 'db', required: true, status: 'unknown' }]).status, 'blocked');
  assert.equal(evaluateReadiness([{ id: 'cost', required: false, status: 'unknown' }]).status, 'unknown');
});

test('alerts require evidence and sustained breach', () => {
  assert.equal(shouldOpenIncident({ id: 'latency', breached: true, consecutiveBreaches: 3, threshold: 3 }), false);
  assert.equal(shouldOpenIncident({ id: 'latency', breached: true, consecutiveBreaches: 3, threshold: 3, evidenceId: 'ev' }), true);
});

test('webhook delivery IDs are idempotent and payloads are stored only as digests', () => {
  const registry = new IdempotencyRegistry();
  const first = registry.accept('delivery-1', '{"email":"private@example.com"}');
  assert.equal(first?.payloadDigest.length, 64);
  assert.equal(registry.accept('delivery-1', 'different'), null);
});

test('evidence and operational errors redact credentials', () => {
  assert.equal(redactOperationalText('token=abc password: xyz'), 'token=[REDACTED] password=[REDACTED]');
  const record = new EvidenceStore().add({ kind: 'log', source: 'api', status: 'blocked', summary: 'Authorization: bearer123' });
  assert.equal(record.summary.includes('bearer123'), false);
});

test('rollback is blocked without a verified compatible target', () => {
  assert.equal(createRollbackPlan({ currentReleaseId: 'r2', schemaBackwardCompatible: true }).executable, false);
  assert.equal(createRollbackPlan({ currentReleaseId: 'r2', previousVerifiedReleaseId: 'r1', schemaBackwardCompatible: true }).executable, true);
});

test('inventory rejects dangling dependencies and duplicates', () => {
  assert.equal(validateInventory([{ id: 'api', kind: 'service', environment: 'production', dependsOn: ['db'] }]).valid, false);
  assert.equal(validateInventory([{ id: 'db', kind: 'database', environment: 'production', dependsOn: [] }, { id: 'api', kind: 'service', environment: 'production', dependsOn: ['db'] }]).valid, true);
});

test('configuration compiler returns presence but never values', () => {
  assert.deepEqual(safeConfigurationStatus(['SECRET'], { SECRET: 'private' }), [{ key: 'SECRET', configured: true }]);
  assert.equal(JSON.stringify(safeConfigurationStatus(['SECRET'], { SECRET: 'private' })).includes('private'), false);
});

test('schema drift reports missing and unexpected objects', () => {
  assert.deepEqual(compareSchema(['a', 'b'], ['a', 'c']), { missing: ['b'], unexpected: ['c'], matches: false });
});

test('SLO evaluation refuses to infer compliance from insufficient data', () => {
  assert.equal(evaluateSloWindow({ good: 1, total: 1, target: 0.99, minimumSamples: 100 }).status, 'insufficient_data');
  assert.equal(evaluateSloWindow({ good: 99, total: 100, target: 0.99, minimumSamples: 100 }).status, 'met');
});

test('operational permission matrix separates release and recovery authority', () => {
  assert.equal(authorizeOperation('viewer', 'promote'), false);
  assert.equal(authorizeOperation('release_manager', 'promote'), true);
  assert.equal(authorizeOperation('release_manager', 'restore'), false);
  assert.equal(authorizeOperation('recovery_manager', 'restore'), true);
});

test('final production outcome needs readiness, deployment ID, and verified URL', () => {
  const checks = [{ id: 'smoke', required: true, status: 'verified' as const, evidenceId: 'ev' }];
  assert.equal(finalProductionOutcome({ required: checks }).status, 'blocked');
  assert.equal(finalProductionOutcome({ required: checks, deploymentId: 'dpl_1', verifiedUrl: 'https://example.test' }).status, 'verified');
});
