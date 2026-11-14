import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReadBatchTargets, executeApprovedComposioReadBatch } from './composioApprovedReadBatch.js';

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
