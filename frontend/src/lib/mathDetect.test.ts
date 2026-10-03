import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isMathSolutionContent } from './mathDetect';
import { parseXrogaBlocks } from './plainAiText';

test('ordinary prose with steps, numbers, and an Answer label is not math', () => {
  const prose = 'Answer\n\nStep 1: Open settings.\nStep 2: Choose the project with 3 files.';
  assert.equal(isMathSolutionContent(prose), false);
  assert.deepEqual(parseXrogaBlocks(prose).map((block) => block.type), ['paragraph', 'paragraph']);
});

test('explicit equation structure opts into math without creating a Final answer card', () => {
  const math = 'Solve the equation\n\n2x + 4 = 10';
  assert.equal(isMathSolutionContent(math), true);
  assert.deepEqual(parseXrogaBlocks(math).map((block) => block.type), ['paragraph', 'math-equation']);
});
