import test from 'node:test';
import assert from 'node:assert/strict';
import { statusToneV2 } from './status';

test('status words get green, red, orange and blue tones, and ordinary text stays neutral', () => {
  const cases: Array<[string, string]> = [
    ['Completed', 'success'], ['passed', 'success'], ['Verified', 'success'], ['ok', 'success'],
    ['Failed', 'danger'], ['error', 'danger'], ['Blocked', 'danger'], ['Invalid', 'danger'],
    ['Processing', 'warning'], ['In progress', 'warning'], ['in-progress', 'warning'], ['Pending', 'warning'], ['Partial', 'warning'], ['Estimate', 'warning'],
    ['Beta', 'info'], ['Proposed', 'info'],
    ['Next.js', 'neutral'], ['Starter plan', 'neutral'], ['Cancelled', 'neutral'], ['', 'neutral'],
  ];
  for (const [text, tone] of cases) assert.equal(statusToneV2(text), tone, text);
});

test('a sentence or markup that merely contains a status word is not turned into a badge', () => {
  assert.equal(statusToneV2('The request failed because the key was invalid'), 'neutral');
  assert.equal(statusToneV2('**Failed**'), 'neutral');
  assert.equal(statusToneV2('[Failed](https://example.com)'), 'neutral');
  assert.equal(statusToneV2('failed\nretrying'), 'neutral');
  assert.equal(statusToneV2(42), 'neutral');
  assert.equal(statusToneV2('x'.repeat(40)), 'neutral');
});
