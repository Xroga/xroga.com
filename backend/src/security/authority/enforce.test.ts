import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTenantContext } from '../tenantContext.js';
import { preparedActionDigest } from './digest.js';
import { executeAuthorizedAction, assertAuthorityPermit, consumeAuthorityPermit } from './enforce.js';
import { ACTION_CLASSES, type AuthorityDispatchBinding, type PreparedAuthorityScope } from './types.js';
import { ACTION_POLICIES, businessActionClass } from './risk.js';
const OWNER = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
const actor = (userId = OWNER) => createTenantContext({ userId, via: 'remote_getuser' });
function fixture() {
  const scope: PreparedAuthorityScope = { version: '1', userId: OWNER, tenantId: OWNER, provider: 'slack', connectedAccountId: 'account-A', operation: 'SLACK_SEND_MESSAGE', targetDigest: preparedActionDigest({ recipient: 'channel-A', text: 'Exact approved content' }), planDigest: 'a'.repeat(64), actionClass: 'SEND_COMMUNICATION', risk: 'write', projectId: null, runId: null, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), nonce: 'server-nonce', maxSpendMicroUsd: null, currency: null };
  const claim = { id: 'confirmation-A', userId: OWNER, scopeDigest: preparedActionDigest(scope), expiresAt: scope.expiresAt, claimedAt: new Date().toISOString() };
  const binding: AuthorityDispatchBinding = { userId: OWNER, provider: scope.provider, connectedAccountId: scope.connectedAccountId, operation: scope.operation, targetDigest: scope.targetDigest, planDigest: scope.planDigest };
  return { scope, claim, binding, context: actor(), revalidateBeforeEffect: async () => claim };
}

test('canonical executor dispatches only an exact issued actor and durable adapter claim, once', async () => {
  const f = fixture(); let checks = 0, effects = 0; let escaped: unknown;
  await executeAuthorizedAction({ ...f, revalidateBeforeEffect: async () => { checks++; return f.claim; } }, async permit => {
    escaped = permit;
    assertAuthorityPermit(permit, f.binding);
    const results = await Promise.allSettled([consumeAuthorityPermit(permit, f.binding), consumeAuthorityPermit(permit, f.binding)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    effects++; return 'provider-stub-receipt';
  });
  assert.equal(checks, 1); assert.equal(effects, 1);
  assert.throws(() => assertAuthorityPermit(escaped, f.binding), { code: 'AUTHORITY_ALREADY_USED_OR_MISSING' });
});

test('boolean, cloned, serialized, wrong-account and mutated-scope authorities never dispatch', async () => {
  const f = fixture(); let effects = 0;
  for (const fake of [true, { confirmed: true }, { grantId: f.claim.id }, JSON.parse(JSON.stringify(f.claim))]) {
    await assert.rejects(consumeAuthorityPermit(fake, f.binding), /requires current approval/);
  }
  for (const context of [{ ...f.context }, actor(FOREIGN)]) {
    await assert.rejects(executeAuthorizedAction({ ...f, context }, async () => { effects++; }), /requires current approval|Sign in/);
  }
  await executeAuthorizedAction(f, async permit => {
    for (const mutation of [{ userId: FOREIGN }, { connectedAccountId: 'account-B' }, { provider: 'gmail' }, { operation: 'SLACK_DELETE_MESSAGE' }, { targetDigest: preparedActionDigest('changed recipient') }, { planDigest: 'b'.repeat(64) }]) {
      await assert.rejects(consumeAuthorityPermit(permit, { ...f.binding, ...mutation }), { code: 'AUTHORITY_SCOPE_MISMATCH' });
    }
    assert.throws(() => assertAuthorityPermit({ ...permit }, f.binding), { code: 'AUTHORITY_ALREADY_USED_OR_MISSING' });
    await consumeAuthorityPermit(permit, f.binding); effects++;
  });
  assert.equal(effects, 1);
});

test('expiry, revocation and substituted durable receipt after a wait fail before effect', async t => {
  let clock = Date.now(); t.mock.method(Date, 'now', () => clock);
  for (const mode of ['expired', 'revoked', 'substituted'] as const) {
    const f = fixture(); let effects = 0;
    await assert.rejects(executeAuthorizedAction({ ...f, revalidateBeforeEffect: async () => {
      if (mode === 'expired') clock += 61_000;
      if (mode === 'revoked') throw new Error('Canonical grant revoked');
      return mode === 'substituted' ? { ...f.claim, id: 'other-claim' } : f.claim;
    } }, async permit => { await consumeAuthorityPermit(permit, f.binding); effects++; }), /expired|revoked|requires current approval/);
    assert.equal(effects, 0);
  }
});

test('all twelve server policies exist, read is lighter, and financial authority needs exact spend binding', async () => {
  assert.equal(ACTION_CLASSES.length, 12); assert.deepEqual(Object.keys(ACTION_POLICIES), [...ACTION_CLASSES]);
  for (const actionClass of ACTION_CLASSES) assert.equal(ACTION_POLICIES[actionClass].requiresGrant, actionClass !== 'READ');
  assert.equal(Object.isFrozen(ACTION_POLICIES), true); assert.equal(Object.isFrozen(ACTION_POLICIES.DELETE), true);
  assert.equal(businessActionClass('GMAIL_SEND_EMAIL'), 'SEND_COMMUNICATION');
  assert.equal(businessActionClass('UNKNOWN_PROVIDER_PROPOSED_OPERATION'), 'ADMINISTRATIVE_HIGH_RISK');
  assert.equal(businessActionClass('PAYMENTS_TRANSFER'), 'TRANSFER_OR_FINANCIAL');
  for (const actionClass of ['TRANSFER_OR_FINANCIAL', 'PURCHASE_OR_SPEND'] as const) {
    const f = fixture(); f.scope.actionClass = actionClass; f.claim.scopeDigest = preparedActionDigest(f.scope);
    await assert.rejects(executeAuthorizedAction(f, async () => assert.fail('No effect allowed without spend authority')), { code: 'AUTHORITY_SPEND_BINDING_REQUIRED' });
  }
});
