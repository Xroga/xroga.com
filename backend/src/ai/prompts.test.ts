import assert from 'node:assert/strict';
import test from 'node:test';

import { incrementalUpdateContext } from './prompts.js';

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
