import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationActivityV2, readingScript } from './conversation';
import type { XrogaActivityPresentation } from '@/lib/terminal/activityPresentation';

const row = (kind: XrogaActivityPresentation['kind'], status: XrogaActivityPresentation['status'] = 'complete'): XrogaActivityPresentation => ({ id: kind, kind, status, label: kind, startedAt: 1, updatedAt: 2 });
test('ordinary response lifecycle does not become a completed task panel', () => {
  assert.deepEqual(conversationActivityV2([row('understand'), row('respond'), row('summarize'), row('complete')]), []);
});
test('real operations, approval, cancellation and errors retain the original receipts', () => {
  const rows = [row('search'), row('command', 'active'), row('approval', 'waiting'), row('respond', 'error'), row('understand', 'cancelled'), row('complete', 'interrupted'), { ...row('complete'), evidenceRefs: ['receipt-id'] }];
  assert.deepEqual(conversationActivityV2(rows), rows);
  assert.equal(conversationActivityV2(rows)[0], rows[0]);
});
test('missing activity does not invent evidence or completion', () => {
  assert.deepEqual(conversationActivityV2(), []);
});

test('reading rhythm follows the script that makes up most of an answer', () => {
  assert.equal(readingScript('نیند بہتر کرنے کے لیے روزانہ ایک وقت پر سوئیں۔ Wi-Fi'), 'arabic');
  assert.equal(readingScript('रोज़ एक ही समय पर सोएँ।'), 'devanagari');
  assert.equal(readingScript('Say شکریہ to your host after dinner and leave on time.'), undefined);
  assert.equal(readingScript('12,000 + 15,000'), undefined);
});
