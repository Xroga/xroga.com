import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletedChatHistory, serializeWorkspaceRequest } from './chatHistory';

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

test('preserves older pairs and long text for signed-in requests', () => {
  const messages = Array.from({ length: 30 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `  turn-${index}\n` + 'Long text. '.repeat(1_500) + '\n  final constraint  ',
  }));
  assert.deepEqual(buildCompletedChatHistory(messages), messages);
  assert.deepEqual(buildCompletedChatHistory(messages, 3), messages.slice(-2));
  assert.deepEqual(buildCompletedChatHistory(messages, 0), []);
});

test('leaves the entire request unchanged when it fits the transport', () => {
  const body = {
    message: 'Ask about the first example',
    history: [
      { role: 'user', content: '  Earlier question\n' },
      { role: 'assistant', content: 'Whole earlier answer č 你好' },
    ],
    attachments: [{ name: 'notes.txt', url: 'https://example.com/notes.txt' }],
  };
  assert.equal(serializeWorkspaceRequest(body), JSON.stringify(body));
});

test('keeps complete fitting exchanges and marks omission without editing current fields or stored history', () => {
  const early = [
    { role: 'user', content: 'Confirm the first detail.' },
    { role: 'assistant', content: 'First detail: 001.' },
  ];
  const massive = [
    { role: 'user', content: 'This old exchange will not fit.' },
    { role: 'assistant', content: '😀"\u0000'.repeat(1_000_000) },
  ];
  const recent = [
    { role: 'user', content: 'Confirm the most recent example.' },
    { role: 'assistant', content: 'Most recent example: 007.' },
  ];
  const history = Object.freeze([...early, ...massive, ...recent]);
  const body = {
    message: '  The exact current prompt includes a line break\nand a trailing space ',
    history,
    attachments: [{ name: 'notes.txt', url: 'https://example.com/notes.txt' }],
    goalContract: { acceptance: ['Keep all current fields'] },
    projectContext: { repo: 'example/project' },
  };
  const original = JSON.stringify(body);
  const encoded = (value: string) => new TextEncoder().encode(value).byteLength;
  const limit = 10 * 1024 * 1024;
  assert.ok(original.length < limit && encoded(original) > limit, 'UTF-8 transport is stricter than JS string length');
  const serialized = serializeWorkspaceRequest(body);
  assert.ok(encoded(serialized) <= limit);
  const parsed = JSON.parse(serialized);
  assert.match(parsed.history[0].content, /earlier conversation turns were omitted/i);
  assert.deepEqual(parsed.history.slice(1), [...early, ...recent]);
  assert.deepEqual(parsed, { ...body, history: parsed.history });
  assert.deepEqual(body.history, [...early, ...massive, ...recent]);
});
