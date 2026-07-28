import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletedChatHistory } from './chatHistory';

test('excludes the current and interrupted user-only turns', () => {
  assert.deepEqual(
    buildCompletedChatHistory([
      { role: 'user', content: 'answered question' },
      { role: 'assistant', content: 'answered response' },
      { role: 'user', content: 'interrupted question' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'current prompt sent separately' },
    ]),
    [
      { role: 'user', content: 'answered question' },
      { role: 'assistant', content: 'answered response' },
    ],
  );
});

test('keeps bounded complete pairs in chronological order', () => {
  assert.deepEqual(
    buildCompletedChatHistory(
      [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'first' },
        { role: 'user', content: 'two' },
        { role: 'assistant', content: 'second' },
      ],
      2,
    ),
    [
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'second' },
    ],
  );
});
