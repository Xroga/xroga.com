import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_SYSTEM,
  incrementalUpdateContext,
  isDirectCurrentFactLookup,
  researchAnswerMaxTokens,
  researchSynthesisPrompt,
} from './prompts.js';

test('chat requires real structured UI for explicit visual requests', () => {
  assert.match(CHAT_SYSTEM, /MUST include the corresponding xroga-ui block/);
  assert.match(CHAT_SYSTEM, /Never imitate a progress bar, calculator/);
  assert.match(CHAT_SYSTEM, /ASCII art or plain-text diagrams/);
});

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

  assert.match(prompt, /requested length, format, and number of items as far as the supplied evidence supports/);
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

test('research synthesis retains source evidence and delimiters beyond the old cutoff', () => {
  const gathered = '<evidence>\n' + 'Source excerpt.\n'.repeat(2_800)
    + '[25] Additional source with its own citation.\n</evidence>';
  assert.ok(gathered.length > 40_000);
  assert.ok(researchSynthesisPrompt('Write a sourced comparison.', gathered).includes(gathered));
});

test('unqualified research comparisons follow the scope of the question', () => {
  const prompt = researchSynthesisPrompt('Compare two approaches using their official documentation.', 'Evidence excerpts.');
  assert.match(prompt, /More retrieved material does not make the question broader/);
  assert.match(prompt, /Let inline citations carry the source references/);
  assert.match(prompt, /excerpt actually supports the claim/);
  assert.match(prompt, /exact rate, range, or historical example only when it helps answer/);
  assert.match(prompt, /source measures the same entity and criterion the user asked about/);
  assert.match(prompt, /Do not promote a discovery-only post into a definitive ranking/);
  assert.match(prompt, /Add both only when each answers a different part/);
  assert.doesNotMatch(prompt, /write a comprehensive|End with practical takeaways/);
});

test('direct current lookup is compact without overriding a broader request or output format', () => {
  for (const singleFact of ['price of btc currently', 'What is the exchange rate for GBP to EUR today?',
    'What is the latest stable Next.js version?', 'What is the weather now in Lahore?']) {
    assert.equal(isDirectCurrentFactLookup(singleFact), true, singleFact);
  }
  for (const largerRequest of ['Compare the latest prices of BTC and ETH', 'Price of BTC currently with a chart',
    'Give the current exchange rate in two bullets', 'Price of BTC currently. Should I buy?',
    'Explain why solar and lunar eclipses don’t happen every month', 'Current best practices for fast APIs']) {
    assert.equal(isDirectCurrentFactLookup(largerRequest), false, largerRequest);
  }
  const prompt = researchSynthesisPrompt('price of btc currently', 'Retrieved search evidence.', true);
  assert.match(prompt, /one or two short paragraphs/);
  assert.match(prompt, /explicit observation time/);
  assert.match(prompt, /Neither a retrieval time nor a publication date alone proves a value is current/);
  assert.match(prompt, /Never average or combine stale, differently timed, or incomparable snapshots/);
  assert.match(prompt, /If the sources cannot verify a current value, state that in one sentence/);
  assert.match(prompt, /Omit the inventory of conflicting or discarded values unless the user asks to compare them/);
  assert.doesNotMatch(prompt, /Choose a comparison table or diagram/);
});
