import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./semanticRequestPlanner.ts', import.meta.url), 'utf8');

test('planner failure logs reason, repairs and a bounded detail before throwing', () => {
  const at = source.indexOf('[planner-failure]');
  assert.ok(at > 0);
  const window = source.slice(at - 80, at + 400);
  assert.match(window, /reason: generated\.reason/);
  assert.match(window, /repairs: generated\.repairs/);
  assert.match(window, /slice\(0, 300\)/);
  assert.ok(source.indexOf('throw new RuntimeFailure', at) > at);
});

test('planner failure log never includes the prompt or raw model reply', () => {
  const at = source.indexOf('[planner-failure]');
  const window = source.slice(at, at + 300);
  assert.doesNotMatch(window, /prompt|raw|history/i);
});
