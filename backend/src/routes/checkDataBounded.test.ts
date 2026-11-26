import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkDataBounded } from './localBrowser.js';

const message = (text: string) => ({ role: 'user', content: [{ type: 'text', text }] });
const refused = (value: unknown) => {
  try {
    checkDataBounded(value);
    return false;
  } catch (error) {
    return (error as { code?: string }).code === 'BROWSER_DATA_DENIED';
  }
};

test('a long clean conversation is not refused for being long', () => {
  // About 600 KB in 400 messages, and one 250,000 character page: far past what the classifier accepts in one piece.
  const messages = Array.from({ length: 400 }, (_, i) => message(`step ${i} ${'plain page text about seo agencies in leeds '.repeat(35)}`));
  messages.push(message('page '.repeat(50_000)));
  assert.equal(refused(messages), false);
});

test('a credential is still refused wherever it sits in a long conversation', () => {
  const filler = Array.from({ length: 400 }, () => message('plain page text '.repeat(40)));
  assert.equal(refused([...filler, message('the header was Bearer abc123def')]), true);
  assert.equal(refused([...filler, message(`key sk-${'a'.repeat(30)}`)]), true);
  assert.equal(refused([message(`${'x'.repeat(19_900)} ghp_${'b'.repeat(20)} ${'y'.repeat(30_000)}`)]), true);
});

test('a value split across a slice boundary is still found', () => {
  const text = `${'z'.repeat(19_990)} Bearer secret-value-here${'z'.repeat(5_000)}`;
  assert.equal(refused([message(text)]), true);
});

test('secret-like key names are still refused, and ordinary ones are not', () => {
  assert.equal(refused([{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'x', input: { api_key: 'v' } }] }]), true);
  assert.equal(refused([{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'x', input: { url: 'https://a.test/', filter: 'title' } }] }]), false);
});
