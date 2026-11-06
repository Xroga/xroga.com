import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enhanceAiResponse } from '@/lib/xrogaResponseDocument';
import { adaptResponseV2 } from './document';
import { calculateV2, derivedCalculationsV2, type CalculatorNode } from './calculations';
import { responseTextV2 } from './exportText';

const authored = {
  type: 'calculator', title: 'Illustrative position sizing', operation: 'percentage',
  inputs: [{ id: 'capital', label: 'Capital', value: 50000, min: 0, unit: 'USD' }, { id: 'risk', label: 'Risk', value: 1, min: 0, max: 100, unit: '%' }],
  resultLabel: 'Risk budget', resultUnit: 'USD', precision: 2,
  derivedResults: [{ id: 'positions', label: 'Whole positions at $300 maximum loss each', operation: 'quotient', operands: ['$result', 300], rounding: 'floor', precision: 0 }],
};
const source = 'Hypothetical inputs, not a trading recommendation.\n```xroga-ui\n' + JSON.stringify(authored) + '\n```\nMaximum loss excludes fees.';
function message(text = source) {
  const enhanced = enhanceAiResponse(text, 'risk-answer');
  return { id: 'risk-answer', content: enhanced.content, featureOutput: enhanced.output };
}
function node(): CalculatorNode {
  const adapted = adaptResponseV2(message());
  assert.ok(adapted.supported);
  const calc = adapted.document.nodes.find(item => item.kind === 'calculator');
  assert.ok(calc?.kind === 'calculator');
  return calc;
}
test('one model-authored document links budget and whole positions through changes and reset', () => {
  const calc = node();
  const initial = { capital: '50000', risk: '1' };
  for (const [values, budget, positions] of [[initial, 500, 1], [{ ...initial, risk: '2' }, 1000, 3], [initial, 500, 1]] as const) {
    assert.equal(calculateV2(calc, values), budget);
    assert.equal(derivedCalculationsV2(calc, values)[0].value, positions);
  }
  assert.equal(derivedCalculationsV2(calc, initial)[0].formula, 'floor(500 ÷ 300)');
  assert.equal(derivedCalculationsV2(calc, { capital: '0', risk: '1' })[0].value, 0);
  for (const capital of ['', '-1', 'Infinity', 'alert(1)']) assert.equal(derivedCalculationsV2(calc, { capital, risk: '1' })[0].value, null);
});
test('derived calculations persist and copy with original inputs, formula and assumptions', () => {
  assert.deepEqual(adaptResponseV2(message()), adaptResponseV2(JSON.parse(JSON.stringify(message()))));
  const copy = responseTextV2(message());
  assert.match(copy!, /floor\(500 ÷ 300\)/);
  assert.match(copy!, /Whole positions at \$300 maximum loss each: 1/);
  assert.match(copy!, /Maximum loss excludes fees/);
});
test('invalid references and recursive or executable formulas remain explicit partial output', () => {
  for (const operands of [['positions', 300], ['unknown', 300], ['window.fetch()', 300], ['$result']]) {
    const invalid = { ...authored, derivedResults: [{ ...authored.derivedResults[0], operands }] };
    const text = 'Before\n```xroga-ui\n' + JSON.stringify(invalid) + '\n```\nAfter';
    const enhanced = enhanceAiResponse(text, 'invalid');
    assert.equal(enhanced.output?.status, 'partial');
    assert.equal(enhanced.output?.sourceText, text);
    assert.ok(enhanced.output?.blocks.some(block => block.type === 'notice'));
  }
});
test('zero divisor and overflow never become successful numeric results', () => {
  const calc = node();
  assert.equal(derivedCalculationsV2({ ...calc, derivedResults: [{ ...calc.derivedResults![0], operands: ['$result', 0] }] }, { capital: '50000', risk: '1' })[0].value, null);
  assert.equal(derivedCalculationsV2(calc, { capital: '1e308', risk: '100' })[0].value, null);
});
