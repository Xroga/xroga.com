import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { normalizeMathDelimitersV2, remarkMathPresentationV2 } from './mathSyntax';
test('explicit TeX delimiters normalize while code and incomplete streaming remain intact', () => {
  const code = '```tex\n\\(x^2\\)\n```';
  assert.equal(normalizeMathDelimitersV2(code), code);
  assert.equal(normalizeMathDelimitersV2('`\\(x\\)`'), '`\\(x\\)`');
  assert.equal(normalizeMathDelimitersV2('Text \\(x^2\\).'), 'Text $$x^2$$.');
  assert.equal(normalizeMathDelimitersV2('Text \\(x^'), 'Text \\(x^');
});
test('standard math parser preserves currency, code and creates math nodes only for explicit delimiters', async () => {
  const source = 'Cost $5 or $10. Code `$$x$$`. Equation $$x^2$$.';
  const processor = unified().use(remarkParse).use(remarkMath, { singleDollarTextMath: false }).use(remarkMathPresentationV2);
  const tree = await processor.run(processor.parse(source), { value: source });
  const serialized = JSON.stringify(tree);
  assert.match(serialized, /Cost \$5 or \$10/);
  assert.match(serialized, /"data-math-v2":"x\^2"/);
  assert.equal((serialized.match(/data-math-v2/g) || []).length, 1);
  assert.match(serialized, /inlineCode/);
});
