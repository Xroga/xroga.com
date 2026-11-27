import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiWarmer, WARM_AGAIN_AFTER_MS } from './warmApi';

test('wakes the service when someone starts writing, once per window', () => {
  let calls = 0;
  let now = 1_000;
  const warm = createApiWarmer(() => { calls += 1; }, () => now);
  warm();
  warm();
  now += WARM_AGAIN_AFTER_MS - 1;
  warm();
  assert.equal(calls, 1);
  now += 1;
  warm();
  assert.equal(calls, 2);
});
