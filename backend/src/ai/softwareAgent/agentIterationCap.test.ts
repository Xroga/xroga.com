import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./AgentSoftwareExecutor.ts', import.meta.url), 'utf8');

test('every Agent construction carries a finite maxIterations ceiling', () => {
  assert.match(source, /const SOFTWARE_AGENT_MAX_ITERATIONS = \d+;/);
  const constructions = source.match(/new Agent\(\{/g) ?? [];
  const caps = source.match(/maxIterations:\s*SOFTWARE_AGENT_MAX_ITERATIONS/g) ?? [];
  assert.equal(constructions.length, 2);
  assert.equal(caps.length, constructions.length);
});

test('each tool execution logs only the step, tool name and argument key names', () => {
  const at = source.indexOf('[software-agent-step]');
  assert.ok(at > 0);
  const line = source.slice(at, at + 220);
  assert.match(line, /argKeys/);
  assert.doesNotMatch(line, /JSON\.stringify\(arg\b|JSON\.stringify\(args/);
});
