import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationActivityV2, conversationStatusV2 } from './conversation';
import type { XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';

const row = (kind: XrogaActivityPresentation['kind'], status: XrogaActivityPresentation['status'] = 'complete'): XrogaActivityPresentation => ({ id: kind, kind, status, label: kind, startedAt: 1, updatedAt: 2 });
test('ordinary response lifecycle does not become a completed task panel', () => {
  assert.deepEqual(conversationActivityV2([row('understand'), row('respond'), row('summarize'), row('complete')]), []);
  assert.equal(conversationStatusV2(false, 'Saved answer'), null);
  assert.equal(conversationStatusV2(true, ''), 'Working on your response');
  assert.equal(conversationStatusV2(true, 'Partial answer'), 'Responding');
});
test('real operations, approval, cancellation and errors retain the original receipts', () => {
  const rows = [row('search'), row('command', 'active'), row('approval', 'waiting'), row('respond', 'error'), row('understand', 'cancelled'), row('complete', 'interrupted'), { ...row('complete'), evidenceRefs: ['receipt-id'] }];
  assert.deepEqual(conversationActivityV2(rows), rows);
  assert.equal(conversationActivityV2(rows)[0], rows[0]);
});
test('missing activity does not invent evidence or completion', () => {
  assert.deepEqual(conversationActivityV2(), []);
  assert.equal(conversationStatusV2(false, ''), null);
});
