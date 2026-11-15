import assert from 'node:assert/strict';
import test from 'node:test';
import { initialNativeReadouts, conflictingNativeReadouts } from './nativeOpenUiValues.js';
import { completeNativeWorkspaceAnswer } from './nativeOpenUiWorkspace.js';
import { NATIVE_UI_MARKER } from './nativeOpenUi.js';
import { nativeTechnicalCorrections } from './nativeOpenUiAccuracy.js';

const program = `root = Col([Metric("Monthly payment", @Format(payment, "currency", 2, "USD")), Metric("Total interest", @Format(payment * 60 - $principal, "currency", 2, "USD"))])
$principal = 20000
$apr = 8
payment = @Payment($principal, $apr / 12, 60)`;

test('initial calculator snapshots reuse upstream payment and formatting functions', () => {
  assert.deepEqual(initialNativeReadouts(program), [
    { label: 'Monthly payment', value: '$405.53' },
    { label: 'Total interest', value: '$4,331.67' },
  ]);
  assert.equal(initialNativeReadouts(program.replace('$apr = 8', '$apr = 0'))[1].value, '$0.00');
});

test('snapshots fail closed on cycles, missing references and actions', () => {
  for (const expression of ['missing', '@Set($amount, 10)', 'cycle']) {
    assert.deepEqual(initialNativeReadouts(`root = Col([Metric("Total", ${expression})])\n$amount = 1\ncycle = cycle`), []);
  }
});

test('currency conflicts match corresponding labels without rewriting examples', () => {
  const rows = initialNativeReadouts(program);
  assert.equal(conflictingNativeReadouts('Total interest: $4,331.83.', rows).length, 1);
  assert.equal(conflictingNativeReadouts('Total interest: $4,331.67.', rows).length, 0);
  assert.equal(conflictingNativeReadouts('For example, total interest: $1,000.', rows).length, 0);
  assert.equal(conflictingNativeReadouts('Principal: $20,000.', rows).length, 0);
});

test('saved answer preserves calculator and readable computed values after a prose conflict', () => {
  const result = completeNativeWorkspaceAnswer('Total interest: $4,331.83.' + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.equal(result.responseSource.text, program);
  assert.match(result.response, /4,331\.67/);
  assert.doesNotMatch(result.response, /4,331\.83|@Payment/);
});

test('a false minimum is removed while retaining the monthly chart', () => {
  const chart = 'root = Col([Chart("line", [{month:"January",value:20},{month:"February",value:24},{month:"March",value:22}], "month", ["value"], "number")])';
  const wrong = completeNativeWorkspaceAnswer('March was the lowest month.' + NATIVE_UI_MARKER + chart, 'stop');
  assert.deepEqual(wrong.completion, { status: 'partial', reason: 'data_review' });
  assert.ok(wrong.responseSource.text);
  assert.doesNotMatch(wrong.response, /March was the lowest/);
  const scoped = completeNativeWorkspaceAnswer('March was the lowest month since February.' + NATIVE_UI_MARKER + chart, 'stop');
  assert.equal(scoped.completion.status, 'complete');
});

test('a roving tabindex example cannot add a second tab stop on its container', () => {
  const text = 'Use one focusable element with roving tabindex.\n```html\n<div tabindex="0"><li tabindex="0">Point</li></div>\n```';
  assert.equal(nativeTechnicalCorrections(text)[0]?.rule, 'keyboard_focus_pattern');
  assert.equal(nativeTechnicalCorrections(text.replace('<div tabindex="0">', '<div>')).length, 0);
  assert.equal(nativeTechnicalCorrections(text.replace('\n```html', '\n\nDo not use this broken example:\n```html')).length, 0);
});

test('checklist labels omitted from prose survive the saved readable answer', () => {
  const checklist = 'root = Col([Checkbox($first, "Check links"), Checkbox($second, "Schedule announcement")])\n$first = false\n$second = false';
  const result = completeNativeWorkspaceAnswer('Prepare the blog.\n\n- Check links' + NATIVE_UI_MARKER + checklist, 'stop');
  assert.match(result.response, /Schedule announcement/);
  assert.equal(result.response.match(/Check links/g)?.length, 1);
  const recovered = completeNativeWorkspaceAnswer(NATIVE_UI_MARKER + checklist, 'stop');
  assert.match(recovered.response, /Check links/);
  assert.match(recovered.response, /Schedule announcement/);
});
