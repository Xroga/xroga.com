import assert from 'node:assert/strict';
import test from 'node:test';
import { NATIVE_UI_MARKER, splitNativeOpenUiAnswer, validateNativeOpenUi } from './nativeOpenUi.js';
import { nativeOpenUiPrompt } from './nativeOpenUiPrompt.js';
import { buildNativeOpenUiShare, readNativeOpenUiShare } from './nativeOpenUiShare.js';
import { readNativeOpenUiRun } from './nativeOpenUiRun.js';
import { completeNativeWorkspaceAnswer, usesNativeWorkspacePresentation } from './nativeOpenUiWorkspace.js';

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
    'root = Col([Text(@AddMonths("2028-01-31", 1)), Metric("Elapsed days", @DaysBetween("2028-02-28", "2028-03-01"))])',
    '$left = 15\nroot = Col([Icon("plane", "lg", "info"), Timer($left, "Practice"), Chart("bar", @Histogram([0, 1, 1, 4], 2, 0, 4), "key", ["value"]), Text(@Slice("ABC", 0, 2))])',
  ];
  for (const program of programs) assert.deepEqual(validateNativeOpenUi(program), { ok: true }, program);
});

test('native chat is a deploy-time DeepSeek flag independent of founder evaluation', () => {
  const flag = { XROGA_NATIVE_OPENUI_WORKSPACE: '1' };
  const deepSeek = 'deepseek_v4_1_flash_1017';
  for (const environment of ['staging', 'production']) {
    assert.equal(usesNativeWorkspacePresentation(deepSeek, { ...flag, XROGA_DEPLOYMENT_ENVIRONMENT: environment }), true);
    assert.equal(usesNativeWorkspacePresentation(deepSeek, { XROGA_DEPLOYMENT_ENVIRONMENT: environment }), false);
    assert.equal(usesNativeWorkspacePresentation('sonnet', { ...flag, XROGA_DEPLOYMENT_ENVIRONMENT: environment }), false);
  }
  assert.equal(usesNativeWorkspacePresentation(deepSeek, flag), false);
});

test('a settled document answer retains prose when presentation or evidence is incomplete', () => {
  const prose = 'The uploaded agreement expires in 30 days.';
  const program = 'root = Col([Text("The uploaded agreement expires in 30 days."), Source("source-1")])';
  const raw = prose + NATIVE_UI_MARKER + program;
  assert.deepEqual(completeNativeWorkspaceAnswer(raw, 'stop', new Set(['source-1'])), {
    response: prose, completion: { status: 'complete' }, responseSource: { format: 'xroga-openui-v1', text: program },
  });
  assert.deepEqual(completeNativeWorkspaceAnswer(raw, 'stop'), {
    response: prose, completion: { status: 'partial', reason: 'presentation_contract' },
    responseSource: { format: 'xroga-openui-v1', text: '' },
  });
  assert.equal(completeNativeWorkspaceAnswer(raw, 'length', new Set(['source-1'])).responseSource.text, '');
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

test('native visual text receives the same unsafe authorization review as prose', () => {
  const unsafe = 'root = Col([Text("A service-role session enforces tenant RLS.")])';
  const safe = 'root = Col([Text("A service-role key can bypass RLS. Never expose it to browsers.")])';
  assert.deepEqual(validateNativeOpenUi(unsafe), { ok: false, reason: 'authorization_review' });
  assert.deepEqual(validateNativeOpenUi(safe), { ok: true });
  assert.equal(buildNativeOpenUiShare('Read the security diagram.', unsafe), undefined);
});

test('a browser Supabase SSR session is distinct from an explicitly server-owned session', () => {
  const inaccurate = 'Browser authenticates via Supabase Auth and receives an HTTP-only session cookie.';
  const precise = 'For a server-only Supabase integration, use an HTTP-only cookie and keep all token handling on the server.';
  for (const text of [inaccurate, precise]) {
    const result = validateNativeOpenUi(`root = Col([Text(${JSON.stringify(text)})])`);
    assert.deepEqual(result, text === inaccurate ? { ok: false, reason: 'authorization_review' } : { ok: true });
  }
  assert.deepEqual(completeNativeWorkspaceAnswer(inaccurate, 'stop').completion,
    { status: 'partial', reason: 'authorization_review' });
});

test('an explicit monthly direction that conflicts with the displayed data is flagged', () => {
  const accurate = 'February rose. March dipped.';
  const inaccurate = 'The path is not smooth: February and March ease back before growth resumes.';
  const rows = '[{month: "Jan", value: 12000}, {month: "Feb", value: 15500}, {month: "Mar", value: 14300}]';
  const make = (text: string) => `rows = ${rows}\nroot = Col([Text(${JSON.stringify(text)}), Chart("line", rows, "month", ["value"])])`;
  assert.deepEqual(validateNativeOpenUi(make(accurate)), { ok: true });
  assert.deepEqual(validateNativeOpenUi(make(inaccurate)), { ok: false, reason: 'data_review' });
  assert.deepEqual(validateNativeOpenUi(make(accurate), undefined, inaccurate), { ok: false, reason: 'data_review' });
  const result = completeNativeWorkspaceAnswer(accurate + NATIVE_UI_MARKER + make(inaccurate), 'stop');
  assert.equal(result.response, accurate);
  assert.equal(result.responseSource.text, '');
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.deepEqual(validateNativeOpenUi(make('March increased from January.')), { ok: true });
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

test('native sharing round trips only a bounded presentation and explicit safe citations', () => {
  const program = 'root = Col([Text("Answer"), Source("source-1")])';
  const sources = [{ title: 'Primary evidence', url: 'https://example.com/evidence' }];
  const saved = buildNativeOpenUiShare('Answer', program, sources);
  assert.ok(saved);
  assert.deepEqual(readNativeOpenUiShare(saved), { format: 'xroga-openui-v1', text: 'Answer', program, sources });
  assert.equal(buildNativeOpenUiShare('Answer', program), undefined);
  assert.equal(buildNativeOpenUiShare('Answer', program, [{ title: 'Unsafe', url: 'javascript:alert(1)' }]), undefined);
  assert.equal(buildNativeOpenUiShare('Answer', 'root = Col([Button("Run", @ToAssistant("send"))])'), undefined);
});
