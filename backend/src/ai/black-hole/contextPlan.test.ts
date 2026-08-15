import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTEXT_PRIORITY,
  ContextBudgetError,
  planContext,
  type ContextFile,
} from './contextPlan.js';

const file = (path: string, size: number, relevance: number): ContextFile => ({
  path,
  content: 'x'.repeat(size),
  relevance,
});

test('the priority order is exactly the one §9 specifies', () => {
  assert.deepEqual([...CONTEXT_PRIORITY], [
    'current_request',
    'target_project_state',
    'relevant_files',
    'recent_conversation',
    'project_memory',
    'summarized_history',
  ]);
});

test('segments are admitted in priority order', () => {
  const plan = planContext({
    request: 'add pagination',
    budgetTokens: 10_000,
    projectState: 'next.js app, 12 routes',
    files: [file('src/list.tsx', 400, 0.9)],
    conversation: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ],
    memory: [{ label: 'convention', content: 'tables use server components' }],
  });
  const kinds = plan.segments.map((segment) => segment.kind);
  const positions = kinds.map((kind) => CONTEXT_PRIORITY.indexOf(kind));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), kinds.join(','));
});

test('the request is never truncated to fit — a too-small budget is an error', () => {
  // Trimming the request would answer a different question than the one asked, and the wrong
  // answer would look exactly like a correct one.
  assert.throws(
    () => planContext({ request: 'x'.repeat(8_000), budgetTokens: 100 }),
    (error: unknown) => {
      assert.ok(error instanceof ContextBudgetError);
      assert.match(error.message, /budget/i);
      return true;
    },
  );
});

test('nothing is dropped silently', () => {
  // A planner that quietly discards the file the user asked about produces a reply that is
  // confidently about the wrong thing, indistinguishable downstream from bad reasoning.
  const plan = planContext({
    request: 'explain the router',
    budgetTokens: 300,
    files: [file('src/router.ts', 40_000, 0.99), file('src/small.ts', 100, 0.5)],
  });
  assert.ok(plan.dropped.length > 0);
  const dropped = plan.dropped.find((entry) => entry.label === 'src/router.ts');
  assert.ok(dropped, 'the oversized file must be reported by name');
  assert.match(dropped!.reason, /needs \d+ tokens/);
});

test('a file that does not fit is dropped whole rather than truncated', () => {
  // A model shown the first forty lines of a module infers the rest and states the inference
  // as fact, so half a file is frequently worse than none.
  const plan = planContext({
    request: 'explain this',
    budgetTokens: 500,
    files: [file('big.ts', 40_000, 0.9)],
  });
  const segment = plan.segments.find((entry) => entry.kind === 'relevant_files');
  assert.equal(segment, undefined);
  assert.equal(plan.dropped[0].label, 'big.ts');
});

test('files are admitted by descending relevance, not by input order', () => {
  const plan = planContext({
    request: 'fix the bug',
    budgetTokens: 400,
    files: [file('irrelevant.ts', 800, 0.1), file('relevant.ts', 800, 0.95)],
  });
  const segment = plan.segments.find((entry) => entry.kind === 'relevant_files');
  assert.ok(segment, 'expected one file to fit');
  assert.match(segment!.content, /relevant\.ts/);
  assert.equal(/irrelevant\.ts/.test(segment!.content), false);
});

test('the plan never exceeds its budget', () => {
  const plan = planContext({
    request: 'do the thing',
    budgetTokens: 2_000,
    projectState: 'y'.repeat(4_000),
    files: Array.from({ length: 30 }, (_, index) => file(`f${index}.ts`, 1_000, 0.5)),
    conversation: Array.from({ length: 40 }, () => ({ role: 'user' as const, content: 'z'.repeat(500) })),
    memory: Array.from({ length: 10 }, (_, index) => ({ label: `m${index}`, content: 'w'.repeat(800) })),
  });
  assert.ok(plan.usedTokens <= plan.budgetTokens, `${plan.usedTokens} > ${plan.budgetTokens}`);
});

test('previous failure logs ride with the project state', () => {
  const plan = planContext({
    request: 'try again',
    budgetTokens: 5_000,
    previousFailures: ['typecheck failed: TS2345 in src/a.ts'],
  });
  const state = plan.segments.find((entry) => entry.kind === 'target_project_state');
  assert.ok(state);
  assert.match(state!.content, /TS2345/);
});

test('recent turns outrank a digest of older ones', () => {
  const conversation = Array.from({ length: 20 }, (_, index) => ({
    role: (index % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
    content: `turn ${index}`,
  }));
  const plan = planContext({ request: 'continue', budgetTokens: 5_000, conversation, recentTurnCount: 4 });
  const recent = plan.segments.find((entry) => entry.kind === 'recent_conversation')!;
  assert.match(recent.content, /turn 19/);
  assert.equal(/turn 0\b/.test(recent.content), false);
});

test('a mechanical digest is not presented as a summary', () => {
  // Calling a truncation a "summary" misrepresents what the model is being handed.
  const conversation = Array.from({ length: 20 }, (_, index) => ({
    role: 'user' as const,
    content: `turn ${index} ${'detail '.repeat(30)}`,
  }));
  const plan = planContext({ request: 'continue', budgetTokens: 5_000, conversation, recentTurnCount: 2 });
  const older = plan.segments.find((entry) => entry.kind === 'summarized_history');
  assert.ok(older);
  assert.match(older!.content, /mechanically shortened, not model-summarized/);
});

test('a caller-supplied summary is used in preference to a digest', () => {
  const conversation = Array.from({ length: 20 }, (_, index) => ({
    role: 'user' as const,
    content: `turn ${index}`,
  }));
  const plan = planContext({
    request: 'continue',
    budgetTokens: 5_000,
    conversation,
    recentTurnCount: 2,
    historySummary: 'The user is building a checkout flow.',
  });
  const older = plan.segments.find((entry) => entry.kind === 'summarized_history')!;
  assert.match(older.content, /checkout flow/);
  assert.equal(/mechanically shortened/.test(older.content), false);
});

test('an empty context yields only the request', () => {
  const plan = planContext({ request: 'hi', budgetTokens: 1_000 });
  assert.deepEqual(plan.segments.map((entry) => entry.kind), ['current_request']);
  assert.equal(plan.contextText, '');
});
