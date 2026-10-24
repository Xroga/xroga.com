import assert from 'node:assert/strict';
import test from 'node:test';
import { isFinancialAction, requiresBusinessActionConfirmation } from './businessAction.js';

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
  assert.equal(requiresBusinessActionConfirmation({ permissionMode: 'full_access', plan: { useCase: 'Create an event', toolSlug: 'CALENDAR_CREATE_EVENT', requiresConfirmation: false }, currentRisk: 'write' }), false);
});
