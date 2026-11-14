import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReadBatchTargets, executeApprovedComposioReadBatch,
  validateReviewedComposioReadBatch, confirmReviewedComposioReadBatch } from './composioApprovedReadBatch.js';

const read = (name: string) => ({
  sessionId: 'trs_bounded_test', toolSlug: name,
  useCase: 'Inspect connected data', arguments: {},
});

test('admits only 2–3 distinct plain read actions', () => {
  assert.doesNotThrow(() => validateReadBatchTargets([
    read('GMAIL_LIST_MESSAGES'), read('GOOGLECALENDAR_GET_EVENT'),
  ]));
  assert.throws(() => validateReadBatchTargets([read('GMAIL_LIST_MESSAGES')]), /two or three/);
  assert.throws(() => validateReadBatchTargets([
    read('GMAIL_LIST_MESSAGES'), read('GMAIL_LIST_MESSAGES'),
  ]), /Duplicate/);
  assert.throws(() => validateReadBatchTargets([
    read('GMAIL_LIST_MESSAGES'), read('GMAIL_SEND_EMAIL'),
  ]), /Only exact/);
  assert.throws(() => validateReadBatchTargets([
    read('GMAIL_LIST_MESSAGES'), read('COMPOSIO_MULTI_EXECUTE_TOOL'),
  ]), /Only exact/);
  assert.throws(() => validateReadBatchTargets([
    read('GMAIL_LIST_MESSAGES'), read('COMPOSIO_GET_TOOL_SCHEMAS'),
  ]), /Only exact/);
  assert.throws(() => validateReadBatchTargets([
    read('GMAIL_LIST_MESSAGES'), read('UNKNOWN_PERFORM_ACTION'),
  ]), /Only exact/);
  assert.throws(() => validateReadBatchTargets(Array.from({ length: 4 }, (_, i) =>
    read(`GMAIL_GET_MESSAGE_${i}`))), /two or three/);
});

test('batch rejects absent user authority before any provider calls', async () => {
  await assert.rejects(executeApprovedComposioReadBatch('user-test', [
    { ...read('GMAIL_LIST_MESSAGES'), authorityPermit: undefined, authorityBinding: undefined },
    { ...read('GMAIL_GET_MESSAGE'), authorityPermit: undefined, authorityBinding: undefined },
  ] as never), /approval|authority|permit|Cannot|undefined/i);
});

test('requires individually reviewed, unique confirmation IDs and account digests', () => {
  const one = { id: '11111111-1111-4111-8111-111111111111', actionDigest: 'a'.repeat(64),
    accountReference: 'ca_test_account_one' };
  const two = { id: '22222222-2222-4222-8222-222222222222', actionDigest: 'b'.repeat(64),
    accountReference: 'ca_test_account_two' };
  assert.doesNotThrow(() => validateReviewedComposioReadBatch([one, two]));
  assert.throws(() => validateReviewedComposioReadBatch([one]), /Review two or three/);
  assert.throws(() => validateReviewedComposioReadBatch([one, one]), /duplicated/);
  assert.throws(() => validateReviewedComposioReadBatch([one, { ...two, actionDigest: '' }]), /missing/);
  assert.throws(() => validateReviewedComposioReadBatch([one, { ...two, accountReference: '' }]), /missing/);
});

test('invalid batch cannot fetch or execute provider actions', async () => {
  await assert.rejects(confirmReviewedComposioReadBatch(undefined as never, []),
    /TENANT_AUTH_REQUIRED|tenant|context/i);
});
