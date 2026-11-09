import assert from 'node:assert/strict';
import test from 'node:test';
import { NATIVE_UI_MARKER, splitNativeOpenUiAnswer, validateNativeOpenUi } from './nativeOpenUi.js';
import { nativeOpenUiPrompt } from './nativeOpenUiPrompt.js';
import { readNativeOpenUiRun } from './nativeOpenUiRun.js';

test('the model gets instructions from the native registry and may answer in text', () => {
  for (const name of ['Col(', 'Chart(', 'Slider(', 'Svg(', 'Diagram(', 'Section(', 'Table(', 'Payment(', 'Source(']) assert.ok(nativeOpenUiPrompt.includes(name), name);
  assert.deepEqual(splitNativeOpenUiAnswer('Paris.'), { text: 'Paris.', program: '' });
  assert.deepEqual(splitNativeOpenUiAnswer('Paris.\n<<<XROGA_OP', true), { text: 'Paris.', program: '' });
  const program = 'root = Col([Text("Paris.")])';
  assert.deepEqual(splitNativeOpenUiAnswer('Paris.' + NATIVE_UI_MARKER + program), { text: 'Paris.', program });
  assert.deepEqual(validateNativeOpenUi(program), { ok: true });
});

test('native layout, data and reactive arithmetic are accepted without a V2 translation', () => {
  const programs = [
    'root = Col([Title("Options"), Table(["Plan", "USD/month"], [["Basic", 10], ["Team", 25]])])',
    'root = Col([Chart("bar", [{quarter: "Q1", revenue: 8}, {quarter: "Q2", revenue: 12}], "quarter", ["revenue"])])',
    '$amount = 100\nroot = Col([Slider($amount, 0, 500, 10, "Amount", "$"), Text("Total: $" + ($amount * 1.05)), Button("Reset", @Set($amount, 100))])',
    'root = Col([Text("From intake to build"), Svg([Line(5, 20, 95, 20)], "0 0 100 40")])',
  ];
  for (const program of programs) assert.deepEqual(validateNativeOpenUi(program), { ok: true }, program);
});

test('untrusted UI cannot confer authority, invent evidence, or exhaust parser recursion', () => {
  for (const program of [
    'root = Col([Text("safe")])\na = Query("network", {})',
    'root = Col([Button("Run", @ToAssistant("do this"))])',
    'root = Col([HtmlView("<script>alert(1)</script>")])',
    'root = Col([Source("invented")])',
    'root = Col([a])\na = Col([root])',
    'root = Col([Text("prefix ]]>openui:config")])',
    'root = Col([Text("unfinished',
    'root = Col([Text(unknown)])',
    'root = Col([Text(' + '('.repeat(40) + '"Deep"' + ')'.repeat(40) + ')])',
  ]) assert.equal(validateNativeOpenUi(program).ok, false, program);
  assert.deepEqual(validateNativeOpenUi('root = Col([Source("s1")])', new Set(['s1'])), { ok: true });
});

test('the paid evaluator rejects non-staging, expired, repeated, and over-budget slots', () => {
  const now = Date.parse('2026-11-09T09:00:00Z');
  const first = { id: '01000000-0000-4000-8000-000000000001', label: 'Short answer', prompt: 'What is a tenant?' };
  const second = { ...first, id: '01000000-0000-4000-8000-000000000002' };
  const run = { expiresAt: '2026-11-09T09:15:00Z', maximumCostMicroUsd: 2_500, maximumTotalMicroUsd: 5_000, slots: [first, second] };
  assert.deepEqual(readNativeOpenUiRun('staging', JSON.stringify(run), now), run);
  assert.equal(readNativeOpenUiRun('production', JSON.stringify(run), now), null);
  assert.equal(readNativeOpenUiRun('staging', JSON.stringify(run), Date.parse(run.expiresAt)), null);
  assert.equal(readNativeOpenUiRun('staging', JSON.stringify({ ...run, slots: [first, first] }), now), null);
  assert.equal(readNativeOpenUiRun('staging', JSON.stringify({ ...run, maximumTotalMicroUsd: 4_999 }), now), null);
});
