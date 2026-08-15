import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decideConversion, normalizeRequest } from './converterPolicy.js';
import { assessBlackHoleComplexity } from './complexity.js';
import { analyzeTask } from './taskClass.js';

const decide = (prompt: string, extra: Record<string, unknown> = {}) => {
  const analysis = analyzeTask({ prompt, ...(extra as object) });
  return decideConversion({
    prompt,
    analysis,
    complexity: assessBlackHoleComplexity({ prompt, analysis, ...(extra as object) }),
  });
};

test('a clear, specific request skips the conversion call', () => {
  // §18: do not automatically spend two LLM calls on every build.
  const result = decide('add a dark mode toggle to the settings page', { projectId: 'p-1' });
  assert.equal(result.convert, false);
  assert.equal(result.normalizedInstruction, 'add a dark mode toggle to the settings page');
});

test('a bare product category is converted', () => {
  // Short, but every meaningful decision is still open — which is why length alone is not
  // the test.
  for (const prompt of ['build me an app', 'create a saas', 'make a website']) {
    assert.equal(decide(prompt).convert, true, `not converted: ${prompt}`);
  }
});

test('hedging triggers conversion', () => {
  for (const prompt of [
    'build something like a booking system for my salon',
    'add some kind of reporting to the dashboard',
    'make it nice, you decide the layout',
  ]) {
    const result = decide(prompt, { projectId: 'p-1' });
    assert.equal(result.convert, true, `not converted: ${prompt}`);
    assert.match(result.reason, /hedging|category|open/);
  }
});

test('a long brief is converted', () => {
  const brief = `Rebuild the checkout. ${'It needs to handle taxes and discounts. '.repeat(90)}`;
  const result = decide(brief, { projectId: 'p-1' });
  assert.equal(result.convert, true);
  assert.match(result.reason, /brief/);
});

test('high complexity earns the planning call', () => {
  const result = decide('migrate the entire codebase to the new auth provider without downtime', {
    projectId: 'p-1',
    previousFailures: 2,
  });
  assert.equal(result.convert, true);
  assert.match(result.reason, /complexity/);
});

test('conversion is opt-in on ambiguity, not opt-out on clarity', () => {
  // The costs are asymmetric: a skipped conversion costs one weaker first attempt that repair
  // already catches; an unnecessary one costs a call on every build forever.
  const specific = [
    'fix the null check in src/auth/session.ts',
    'rename the getUser function to loadUser across the api module',
    'add a loading spinner to the submit button',
  ];
  for (const prompt of specific) {
    assert.equal(decide(prompt, { projectId: 'p-1' }).convert, false, `converted: ${prompt}`);
  }
});

test('normalization does not rewrite the user\'s words', () => {
  // The entire value of skipping the converter is that the specialist sees what was written.
  const prompt = 'use   the existing\t\tButton component\n\n\n\nand keep the current spacing';
  assert.equal(
    normalizeRequest(prompt),
    'use the existing Button component\n\nand keep the current spacing',
  );
});

test('normalization strips invisible characters', () => {
  const prompt = 'add​ a ‍button';
  assert.equal(normalizeRequest(prompt), 'add a button');
});

test('a research block is appended rather than merged into the request', () => {
  const result = normalizeRequest('add a pricing page', 'RETRIEVED EVIDENCE\n[1] example.com');
  assert.match(result, /^add a pricing page\n\nRETRIEVED EVIDENCE/);
});

test('a converting decision carries no normalized instruction', () => {
  // The conversion call produces the instruction in that branch; returning both would let a
  // caller silently use the wrong one.
  const result = decide('build me an app');
  assert.equal(result.convert, true);
  assert.equal(result.normalizedInstruction, '');
});
