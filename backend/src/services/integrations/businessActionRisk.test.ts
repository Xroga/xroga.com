import assert from 'node:assert/strict';
import test from 'node:test';
import { actionCandidatesForIntent, isExplicitGmailSendIntent, isFinancialAction, requiresBusinessActionConfirmation } from './businessAction.js';

test('an explicit Gmail send cannot be silently changed into a draft', () => {
  const request = 'Send exactly one email using my connected Gmail account to a@example.com.';
  assert.equal(isExplicitGmailSendIntent(request), true);
  assert.deepEqual(actionCandidatesForIntent([
    { slug: 'GMAIL_CREATE_EMAIL_DRAFT', risk: 'write' as const },
    { slug: 'GMAIL_SEND_EMAIL', risk: 'write' as const },
    { slug: 'GMAIL_LIST_MESSAGES', risk: 'read' as const },
  ], request).map((tool) => tool.slug), ['GMAIL_SEND_EMAIL']);
  assert.deepEqual(actionCandidatesForIntent([
    { slug: 'GMAIL_CREATE_EMAIL_DRAFT', risk: 'write' as const },
  ], request), []);
});

test('draft requests and unrelated app actions retain their own tools', () => {
  assert.equal(isExplicitGmailSendIntent('Send my existing Gmail draft'), false);
  assert.equal(isExplicitGmailSendIntent('Draft an email in Gmail to send later'), false);
  assert.equal(isExplicitGmailSendIntent('Send a Slack message'), false);
  assert.deepEqual(actionCandidatesForIntent([
    { slug: 'GMAIL_CREATE_EMAIL_DRAFT', risk: 'write' as const },
  ], 'Draft an email in Gmail to send later').map((tool) => tool.slug), ['GMAIL_CREATE_EMAIL_DRAFT']);
});

test('financial connected-app mutations require confirmation regardless of permission mode', () => {
  assert.equal(isFinancialAction('Swap 1 ETH for USDT', 'EXCHANGE_EXECUTE'), true);
  assert.equal(isFinancialAction('Use my connected wallet', 'WALLET_SWAP_TOKENS'), true);
  assert.equal(isFinancialAction('Transfer funds', 'BANK_SEND'), true);
  assert.equal(isFinancialAction('Refund this payment', 'PAYMENTS_CREATE_REFUND'), true);
  assert.equal(isFinancialAction('Create a calendar event', 'CALENDAR_CREATE_EVENT'), false);
});

test('full access never bypasses confirmation for a crypto swap', () => {
  const plan = { useCase: 'Swap 1 ETH for USDT', toolSlug: 'EXCHANGE_SWAP', requiresConfirmation: true };
  assert.equal(requiresBusinessActionConfirmation({ permissionMode: 'full_access', plan, currentRisk: 'write' }), true);
  assert.equal(requiresBusinessActionConfirmation({ permissionMode: 'low_risk', plan, currentRisk: 'write' }), true);
  assert.equal(requiresBusinessActionConfirmation({ permissionMode: 'full_access', plan: { useCase: 'Create an event', toolSlug: 'CALENDAR_CREATE_EVENT', requiresConfirmation: false }, currentRisk: 'write' }), true);
});

test('permission preferences cannot waive a prepared approval or current consequential risk', () => {
  for (const permissionMode of ['full_access', 'low_risk', 'read_only'] as const) {
    for (const currentRisk of ['write', 'destructive', 'unknown'] as const) {
      assert.equal(requiresBusinessActionConfirmation({ permissionMode, plan: {
        useCase: 'Update an event', toolSlug: 'CALENDAR_UPDATE_EVENT', requiresConfirmation: false,
      }, currentRisk }), true);
    }
    assert.equal(requiresBusinessActionConfirmation({ permissionMode, plan: {
      useCase: 'Read an event', toolSlug: 'CALENDAR_GET_EVENT', requiresConfirmation: true,
    }, currentRisk: 'read' }), true);
  }
  assert.equal(requiresBusinessActionConfirmation({ permissionMode: 'full_access', plan: {
    useCase: 'Read an event', toolSlug: 'CALENDAR_GET_EVENT', requiresConfirmation: false,
  }, currentRisk: 'read' }), false);
});
