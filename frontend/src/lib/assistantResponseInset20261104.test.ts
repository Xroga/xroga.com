import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const log = readFileSync(new URL('../components/terminal/SwarmMessageLog.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('assistant turns have a stable role marker for scoped alignment', () => {
  assert.match(log, /data-message-role=\{msg\.role\}/);
});

test('narrow assistant replies move inside the composer without moving user turns', () => {
  assert.match(css, /@media \(max-width: 600px\)\s*\{\s*\.xv-terminal-body--flush \.xv-terminal-turn\[data-message-role='assistant'\]\s*\{[^}]*padding-inline-start:\s*18px/s);
  assert.doesNotMatch(css, /\.xv-terminal-turn\[data-message-role='user'\][^{]*\{[^}]*padding-inline-start:\s*18px/s);
});
