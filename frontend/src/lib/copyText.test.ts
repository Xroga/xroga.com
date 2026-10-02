import assert from 'node:assert/strict';
import { test } from 'node:test';

import { serializeAssistantCopy } from './copyText';

test('assistant copy removes markdown presentation syntax while preserving meaning', () => {
  const input = [
    '## Revenue',
    '',
    '**Revenue declined 12%** because subscriptions fell.',
    '',
    '- First point',
    '- Second point',
  ].join('\n');

  const copied = serializeAssistantCopy(input);

  assert.match(copied, /^Revenue/m);
  assert.match(copied, /Revenue declined 12%/);
  assert.doesNotMatch(copied, /\*\*|##/);
});

test('assistant copy preserves exact code bodies without fence chrome', () => {
  const input = ['Use this:', '', '```ts', 'const x = "**";', 'console.log(x);', '```'].join('\n');
  const copied = serializeAssistantCopy(input);

  assert.match(copied, /const x = "\*\*";/);
  assert.match(copied, /console\.log\(x\);/);
  assert.doesNotMatch(copied, /```/);
});

test('assistant copy turns markdown tables into readable tab-separated text', () => {
  const input = ['| Name | Value |', '| --- | ---: |', '| Revenue | $10 |'].join('\n');
  const copied = serializeAssistantCopy(input);

  assert.equal(copied, 'Name\tValue\nRevenue\t$10');
});

test('assistant copy excludes Xroga interaction chrome links', () => {
  const input = 'Connect Slack to continue.\n\n[Open Xroga Connect](/xroga/tool-ui?payload=secret)';
  assert.equal(serializeAssistantCopy(input), 'Connect Slack to continue.');
});
