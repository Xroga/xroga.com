import assert from 'node:assert/strict';
import test from 'node:test';

import {
  incrementalUpdateContext,
  researchAnswerMaxTokens,
  researchSynthesisPrompt,
} from './prompts.js';

test('incremental update context preserves requested sections beyond the old 6k cutoff', () => {
  const tail = '<section id="roasted-this-week"><h2>Roasted this week</h2></section>';
  const html = `<main>${'x'.repeat(6_500)}${tail}</main>`;

  const context = incrementalUpdateContext([{ path: 'index.html', content: html }]);

  assert.match(context, /Roasted this week/);
  assert.match(context, new RegExp(tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('incremental update context remains bounded across selected files', () => {
  const context = incrementalUpdateContext([
    { path: 'first.html', content: 'a'.repeat(30_000) },
    { path: 'second.html', content: 'b'.repeat(30_000) },
    { path: 'third.html', content: 'c'.repeat(30_000) },
  ]);

  assert.ok(context.length < 52_000);
  assert.match(context, /first\.html/);
  assert.match(context, /second\.html/);
  assert.doesNotMatch(context, /third\.html\n```/);
});

test('research synthesis preserves an explicit concise response contract', () => {
  const prompt = researchSynthesisPrompt(
    'What is the current stable release? Answer concisely in three bullets.',
    'Official source evidence.',
  );

  assert.match(prompt, /requested length, format, and number of items exactly/);
  assert.match(prompt, /Omit generic report sections, tables, and takeaways/);
  assert.doesNotMatch(prompt, /comprehensive, well-structured report/);
  assert.equal(
    researchAnswerMaxTokens('Answer concisely in three bullets.'),
    800,
  );
});

test('research synthesis recognizes a one-short-sentence contract', () => {
  const query = 'Use the official source and answer in one short sentence with a citation.';
  const prompt = researchSynthesisPrompt(query, 'Official source material');

  assert.equal(researchAnswerMaxTokens(query), 800);
  assert.match(prompt, /answer the user directly/);
  assert.match(prompt, /Do not turn a single-fact lookup into a long report/);
  assert.doesNotMatch(prompt, /write a comprehensive, well-structured report/);
});

test('research retains the full output budget when the user requests a report', () => {
  assert.equal(
    researchAnswerMaxTokens('Prepare a comprehensive multi-source research report.'),
    8192,
  );
});
