import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadPresentation } from './loadPresentation';

test('a transient chunk failure gets one asset retry', async () => {
  let calls = 0;
  const loaded = await loadPresentation(async () => {
    if (++calls === 1) throw new Error('Loading chunk 8590 failed.');
    return { default: 'presentation' };
  });
  assert.equal(calls, 2);
  assert.equal(loaded.default, 'presentation');
});

test('persistent asset failures are bounded and ordinary errors are not retried', async () => {
  for (const [message, expected] of [['Loading chunk 8590 failed.', 2], ['Invalid data', 1]] as const) {
    let calls = 0;
    await assert.rejects(loadPresentation(async () => { calls++; throw new Error(message); }), { message });
    assert.equal(calls, expected);
  }
});
