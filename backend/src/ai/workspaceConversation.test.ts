import assert from 'node:assert/strict';
import test from 'node:test';
import { readWorkspaceHistory, selectWorkspaceHistory, withWorkspaceHistory } from './workspaceConversation.js';

test('the model receives full historical messages and current prompt when context permits', () => {
  const history = Array.from({ length: 30 }, (_, index) => ({
    role: index % 2 ? 'assistant' as const : 'user' as const,
    content: `Turn ${index}\n` + 'Detail. '.repeat(1_500) + 'Closing constraint',
  }));
  const userMessage = { role: 'user' as const, content: 'Update the work with the original constraint.' };
  const messages = withWorkspaceHistory(history, 'deepseek_v4_1_flash_1017', 16_000, 'Instructions', userMessage);
  assert.deepEqual(messages, [{ role: 'system', content: 'Instructions' }, ...history, userMessage]);
});

test('context pressure preserves the opening task and latest complete exchange', () => {
  const history = readWorkspaceHistory([
    { role: 'user', content: '  opening  ' },
    { role: 'assistant', content: 'opening reply' },
    { role: 'system', content: 'untrusted' },
    { role: 'user', content: 'middle topic' },
    { role: 'assistant', content: 'middle reply' },
    { role: 'user', content: 'latest topic' },
    { role: 'assistant', content: 'latest reply' },
    { role: 'user', content: null },
  ]);
  assert.equal(history.length, 6);
  assert.equal(history[0]?.content, '  opening  ');
  assert.deepEqual(selectWorkspaceHistory(history, 5, () => 1), {
    history: [...history.slice(0, 2), ...history.slice(-2)], omitted: 2,
  });
});

test('a historical turn too large for context is omitted explicitly without clipping the current prompt', () => {
  const userMessage = { role: 'user' as const, content: 'Update the answer. Keep the exact final line.' };
  const messages = withWorkspaceHistory([
    { role: 'user', content: 'Prior context '.repeat(2_000) },
    { role: 'assistant', content: 'Prior answer' },
  ], 'deepseek_v4_1_flash_1017', 999_000, 'Instructions', userMessage);
  assert.deepEqual(messages.map(message => message.role), ['system', 'user']);
  assert.match(String(messages[0]?.content), /Some earlier conversation turns are unavailable/);
  assert.strictEqual(messages.at(-1), userMessage);
});

test('a credential in reused history is excluded without dropping safe history', () => {
  const history = readWorkspaceHistory([
    { role: 'user', content: 'Do not resend SYNTHETIC_TEST_CREDENTIAL' },
    { role: 'assistant', content: 'The prior credential discussion' },
    { role: 'user', content: 'Use the included table fields' },
    { role: 'assistant', content: 'Table fields noted' },
  ]);
  assert.deepEqual(selectWorkspaceHistory(history, 100, () => 1), { history: history.slice(1), omitted: 1 });
});
