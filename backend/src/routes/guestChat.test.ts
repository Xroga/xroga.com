import assert from 'node:assert/strict';
import test from 'node:test';

import {
  consumeGuestAllowance,
  GUEST_CHAT_PROMPT_LIMIT,
  GUEST_CHAT_WINDOW_MS,
  resetGuestChatRateLimitsForTest,
} from './guestChat.js';

test('guest chat allows only the bounded preview count per session', () => {
  resetGuestChatRateLimitsForTest();
  const now = 1_700_000_000_000;
  for (let i = 0; i < GUEST_CHAT_PROMPT_LIMIT; i += 1) {
    const result = consumeGuestAllowance(
      '11111111-1111-4111-8111-111111111111',
      '203.0.113.5',
      now,
    );
    assert.equal(result.allowed, true);
    assert.equal(result.remaining, GUEST_CHAT_PROMPT_LIMIT - i - 1);
  }

  const blocked = consumeGuestAllowance(
    '11111111-1111-4111-8111-111111111111',
    '203.0.113.5',
    now,
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'session');
});

test('guest allowance resets after its window', () => {
  resetGuestChatRateLimitsForTest();
  const now = 1_700_000_000_000;
  for (let i = 0; i < GUEST_CHAT_PROMPT_LIMIT; i += 1) {
    consumeGuestAllowance(
      '22222222-2222-4222-8222-222222222222',
      '203.0.113.6',
      now,
    );
  }

  const reset = consumeGuestAllowance(
    '22222222-2222-4222-8222-222222222222',
    '203.0.113.6',
    now + GUEST_CHAT_WINDOW_MS + 1,
  );
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, GUEST_CHAT_PROMPT_LIMIT - 1);
});
