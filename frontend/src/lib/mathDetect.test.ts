import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isMathSolutionContent } from './mathDetect';

test('ordinary product prose never becomes a math solution', () => {
  const prose =
    'questions, explain code, plan features, build software, research, and interact with connected business apps or repositories. What do you need?';

  assert.equal(isMathSolutionContent(prose), false);
});

test('ordinary prose containing bottom-line language remains prose', () => {
  assert.equal(
    isMathSolutionContent('The bottom line\nUse the connected app only when the user asks for it.'),
    false,
  );
});

test('explicit step-by-step equation content can use math rendering', () => {
  assert.equal(
    isMathSolutionContent('Solving for x\nStep 1\n2x + 4 = 10\nAnswer\nx = 3'),
    true,
  );
});
