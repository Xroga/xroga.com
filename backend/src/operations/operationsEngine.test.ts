import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION_DEFINITIONS, actionPlanDigest, aggregatePortfolioProduct, approvalIsValid,
  automationDecision, configurationPosture, deriveProductStatus, initialActionStatus, maintenanceBlocksAction,
  providerResultToStatus, redactOperationsValue,
} from './operationsEngine.js';
import { hasOperationsPermission, roleForProjectAccess } from './permissions.js';
import type { OperationalResource, SafeActionRequest } from './types.js';

const resource = (overrides: Partial<OperationalResource> = {}): OperationalResource => ({
  id: 'r1', version: 1, projectId: 'p1', environmentId: 'e1', kind: 'health_check', provider: 'internal',
  name: 'API readiness', status: 'verified', statusReason: null, desiredState: {}, observedState: {},
  evidenceReference: 'ev1', availableActions: ['refresh_health'],
  freshness: { source: 'synthetic', observedAt: '2026-07-27T00:00:00Z', verifiedAt: '2026-07-27T00:00:00Z', staleAfter: '2099-01-01T00:00:00Z', reconciliationState: 'matched', stale: false },
  ...overrides,
});

const request: SafeActionRequest = { actionType: 'retry_job', projectId: '11111111-1111-4111-8111-111111111111', targetType: 'job', targetId: 'j1', targetVersion: 2, idempotencyKey: '22222222-2222-4222-8222-222222222222', confirmed: true, parameters: { reason: 'network' } };

test('no evidence is unknown rather than healthy', () => assert.equal(deriveProductStatus([], 0).status, 'unknown'));
test('active incidents override optimistic resource state', () => assert.equal(deriveProductStatus([resource()], 1).status, 'incident'));
test('stale required evidence requires verification', () => assert.equal(deriveProductStatus([resource({ freshness: { ...resource().freshness, stale: true } })], 0).status, 'verification_required'));
test('conflicting desired and observed state blocks product', () => assert.equal(deriveProductStatus([resource({ freshness: { ...resource().freshness, reconciliationState: 'inconsistent' } })], 0).status, 'blocked'));
test('fresh verified required evidence may be healthy', () => assert.equal(deriveProductStatus([resource()], 0).status, 'healthy'));
test('missing secondary states remain unknown in portfolio aggregation', () => {
  const product = aggregatePortfolioProduct({ project: { id: 'p1', name: 'P', type: 'app' }, resources: [resource()], incidentCount: 0, alertCount: 0, pendingApprovals: 0 });
  assert.equal(product.backupState, 'unknown'); assert.equal(product.databaseState, 'unknown');
});

test('action digest is stable and changes with target version', () => {
  assert.equal(actionPlanDigest(request), actionPlanDigest({ ...request, idempotencyKey: 'different' }));
  assert.notEqual(actionPlanDigest(request), actionPlanDigest({ ...request, targetVersion: 3 }));
});
test('unconfirmed dangerous action waits for confirmation', () => assert.equal(initialActionStatus(ACTION_DEFINITIONS.retry_job, false), 'confirmation_required'));
test('approved-risk action waits for approval after confirmation', () => assert.equal(initialActionStatus(ACTION_DEFINITIONS.resume_automation, true), 'approval_required'));
test('requester cannot self approve', () => assert.equal(approvalIsValid({ requesterId: 'u', approverId: 'u', decision: 'approved', expiresAt: '2099-01-01', approvedTargetVersion: 1, currentTargetVersion: 1, approvedPlanDigest: 'a', currentPlanDigest: 'a' }).reason, 'requester_cannot_self_approve'));
test('expired approval is invalid', () => assert.equal(approvalIsValid({ requesterId: 'u1', approverId: 'u2', decision: 'approved', expiresAt: '2020-01-01', approvedTargetVersion: 1, currentTargetVersion: 1, approvedPlanDigest: 'a', currentPlanDigest: 'a' }).reason, 'approval_expired'));
test('changed target invalidates approval', () => assert.equal(approvalIsValid({ requesterId: 'u1', approverId: 'u2', decision: 'approved', expiresAt: '2099-01-01', approvedTargetVersion: 1, currentTargetVersion: 2, approvedPlanDigest: 'a', currentPlanDigest: 'a' }).reason, 'approved_target_changed'));
test('changed plan invalidates approval', () => assert.equal(approvalIsValid({ requesterId: 'u1', approverId: 'u2', decision: 'approved', expiresAt: '2099-01-01', approvedTargetVersion: 1, currentTargetVersion: 1, approvedPlanDigest: 'a', currentPlanDigest: 'b' }).reason, 'approved_target_changed'));

test('active maintenance window blocks unspecified changes', () => assert.equal(maintenanceBlocksAction({ actionType: 'promote_release', now: new Date('2026-07-27T12:00:00Z'), windows: [{ startsAt: '2026-07-27T11:00:00Z', endsAt: '2026-07-27T13:00:00Z', allowedActions: [], blockedActions: [] }] }), true));
test('maintenance allow list permits explicit recovery', () => assert.equal(maintenanceBlocksAction({ actionType: 'rollback_release', now: new Date('2026-07-27T12:00:00Z'), windows: [{ startsAt: '2026-07-27T11:00:00Z', endsAt: '2026-07-27T13:00:00Z', allowedActions: ['rollback_release'], blockedActions: [] }] }), false));
test('inactive maintenance window does not block', () => assert.equal(maintenanceBlocksAction({ actionType: 'promote_release', now: new Date('2026-07-28'), windows: [{ startsAt: '2026-07-27', endsAt: '2026-07-27T01:00:00Z', allowedActions: [], blockedActions: [] }] }), false));

test('automation emergency stop wins over other rules', () => assert.equal(automationDecision({ enabled: true, emergencyStopped: true, riskLevel: 'low', recentRuns: 0, maxRuns: 3, maintenanceBlocked: false, duplicate: false }), 'stopped'));
test('automation deduplicates repeated signal', () => assert.equal(automationDecision({ enabled: true, emergencyStopped: false, riskLevel: 'low', recentRuns: 0, maxRuns: 3, maintenanceBlocked: false, duplicate: true }), 'duplicate'));
test('automation respects rate limit', () => assert.equal(automationDecision({ enabled: true, emergencyStopped: false, riskLevel: 'low', recentRuns: 3, maxRuns: 3, maintenanceBlocked: false, duplicate: false }), 'rate_limited'));
test('high-risk automation requests approval', () => assert.equal(automationDecision({ enabled: true, emergencyStopped: false, riskLevel: 'high', recentRuns: 0, maxRuns: 3, maintenanceBlocked: false, duplicate: false }), 'approval_required'));
test('low-risk automation can execute', () => assert.equal(automationDecision({ enabled: true, emergencyStopped: false, riskLevel: 'low', recentRuns: 0, maxRuns: 3, maintenanceBlocked: false, duplicate: false }), 'execute'));

test('redaction removes nested secrets and connection strings', () => {
  const value = redactOperationsValue({ token: 'secret-token', nested: ['postgresql://u:p@host/db', 'safe'] });
  assert.equal(JSON.stringify(value).includes('secret-token'), false); assert.equal(JSON.stringify(value).includes('u:p'), false);
});
test('provider failures cannot become verified actions', () => { assert.equal(providerResultToStatus({ status: 'provider_unavailable', safeSummary: 'down' }), 'failed'); assert.equal(providerResultToStatus({ status: 'unsupported', safeSummary: 'no' }), 'blocked'); });
test('configuration posture detects missing and cross-environment credentials', () => {
  assert.equal(configurationPosture({ present: false, environment: 'production' }), 'missing');
  assert.equal(configurationPosture({ present: true, environment: 'production', credentialClass: 'test', verifiedAt: '2026-07-27' }), 'wrong_environment');
  assert.equal(configurationPosture({ present: true, environment: 'preview', credentialClass: 'live', verifiedAt: '2026-07-27' }), 'wrong_environment');
});
test('configuration posture never treats stale or unverified presence as verified', () => {
  assert.equal(configurationPosture({ present: true, environment: 'production' }), 'unknown');
  assert.equal(configurationPosture({ present: true, environment: 'production', verifiedAt: '2026-07-27', staleAfter: '2026-07-27', now: new Date('2026-07-28') }), 'stale');
});
test('tenant owner gets operator rights but not approval rights', () => { assert.equal(roleForProjectAccess({ isAdmin: false, isOwner: true }), 'operator'); assert.equal(hasOperationsPermission('operator', 'approve_operations_action'), false); });
test('unrelated user receives no project role', () => assert.equal(roleForProjectAccess({ isAdmin: false, isOwner: false }), null));
