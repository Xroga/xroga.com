import assert from 'node:assert/strict';
import test from 'node:test';
import { NATIVE_UI_MARKER, PARTIAL_NATIVE_PRESENTATION_NOTE, splitNativeOpenUiAnswer, validateNativeOpenUi } from './nativeOpenUi.js';
import { nativeOpenUiPrompt, workspaceNativeOpenUiPrompt } from './nativeOpenUiPrompt.js';
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

test('architecture instructions use registry signatures without unrelated controls or unsupplied evidence', () => {
  const prompt = workspaceNativeOpenUiPrompt(['prose', 'graph', 'table'], false);
  for (const name of ['Diagram(', 'Table(', 'Code(']) assert.ok(prompt.includes(name), name);
  for (const name of ['Slider(', 'Histogram(', 'Source(', 'DatePicker(']) assert.ok(!prompt.includes(name), name);
  assert.ok(prompt.length < nativeOpenUiPrompt.length * 0.7);
  assert.ok(workspaceNativeOpenUiPrompt(['chart', 'calculator'], true).includes('Source('));
});

test('independent schema failure keeps authorized sections, prose and an explicit partial status', () => {
  const prose = 'Validate each request before enqueueing it.';
  const program = [
    'root = Col([flow, sensitiveSectionName, code, metric])',
    'flow = Diagram("Request path", [{id:"client",label:"Client",level:0},{id:"queue",label:"Queue",level:1}], [{from:"client",to:"queue",label:"Valid request"}], "Validate before enqueueing.")',
    'sensitiveSectionName = Table(["customer-private-name"])',
    'code = Code("await queue.send(request);", "typescript")',
    '$count = 4',
    'metric = Metric("Count", @Format($count, "number", 0))',
  ].join('\n');
  const diagnostics: unknown[] = [];
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop', undefined, undefined, event => diagnostics.push(event));
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'presentation_contract' });
  assert.ok(answer.response.startsWith(PARTIAL_NATIVE_PRESENTATION_NOTE + '\n\n' + prose));
  assert.match(answer.response, /Client → Queue: Valid request/);
  assert.match(answer.response, /await queue\.send\(request\)/);
  assert.doesNotMatch(answer.response, /customer-private-name/);
  assert.match(answer.responseSource.text, /Diagram\(/);
  assert.match(answer.responseSource.text, /Code\(/);
  assert.match(answer.responseSource.text, /\$count = 4/);
  assert.doesNotMatch(answer.responseSource.text, /Table\(/);
  const diagnostic = JSON.stringify(diagnostics);
  assert.match(diagnostic, /"stage":"schema"/);
  assert.match(diagnostic, /"code":"missing-required"/);
  assert.doesNotMatch(diagnostic, /sensitiveSectionName|customer-private-name|await queue|Valid request/);
  const share = buildNativeOpenUiShare(answer.response, answer.responseSource.text);
  assert.equal(readNativeOpenUiShare(share!)?.text, answer.response);
  const untrusted = program.replace('Table(["customer-private-name"])', 'Source("invented")');
  assert.equal(completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + untrusted, 'stop').responseSource.text, '');
});

test('a program with no readable prose explicitly asks the user to retry', () => {
  const seen: unknown[] = [];
  const answer = completeNativeWorkspaceAnswer(NATIVE_UI_MARKER + 'root = Col([Text("unreviewed")])', 'stop', undefined, undefined, value => seen.push(value));
  assert.match(answer.response, /Send your question again to retry/);
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'presentation_contract' });
  assert.equal(answer.responseSource.text, '');
  assert.match(JSON.stringify(seen), /missing_prose/);
  assert.doesNotMatch(JSON.stringify(seen), /unreviewed/);
});

test('Workspace strips only the trailing provider transport envelope from a native program', () => {
  const prose = 'The browser is not a trusted authorization boundary.';
  const program = 'root = Col([Text("A quoted </｜DSML｜ parameter> example stays intact."), List([ListItem("Verify the signature")], "timeline")])';
  const wire = prose + NATIVE_UI_MARKER + program + '</｜DSML｜ parameter>\r\n</｜DSML｜ invoke>\r\n</｜DSML｜ calls>\n';
  assert.deepEqual(completeNativeWorkspaceAnswer(wire, 'stop'), {
    response: prose, completion: { status: 'complete' }, responseSource: { format: 'xroga-openui-v1', text: program },
  });
  assert.equal(splitNativeOpenUiAnswer(prose + NATIVE_UI_MARKER + program).program, program);
});

test('the saved prose and clipboard fallback retain the substantive native body after an unfinished heading', () => {
  const prose = 'Separate identity and authorization.\n\n## Request path';
  const program = 'root = Col([Title("Request path"), Text("Separate identity and authorization."), Diagram("Trust boundaries", [{id: "client", label: "Client", level: 0}, {id: "app", label: "App", level: 1}], [{from: "client", to: "app", label: "HTTPS"}], "The app authorizes the request."), Table(["Concern", "Guard"], [["Billing", "Verify the webhook"]])])';
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop');
  assert.equal(answer.completion.status, 'complete');
  assert.equal(answer.responseSource.text, program);
  assert.ok(answer.response.startsWith(prose));
  assert.match(answer.response, /Client → App: HTTPS/);
  assert.match(answer.response, /Billing \| Verify the webhook/);
  assert.equal(answer.response.match(/Separate identity/g)?.length, 1);
});

test('a one-paragraph overview retains later code and diagram details for saved text, Copy and Share', () => {
  const prose = 'Verify identity and process billing in a separate flow.';
  const program = [
    'root = Col([summary, storage, billing])',
    'summary = Text("Verify identity and process billing in a separate flow.")',
    'storage = Section("Tenant access", [Table(["Boundary", "Control"], [["Database", "Current membership"]]), Code("alter table projects enable row level security;", "sql")])',
    'billing = Section("Verified billing", [Diagram("Event flow", [{id:"stripe",label:"Stripe",level:0},{id:"app",label:"Handler",level:1}], [{from:"stripe",to:"app",label:"Signed payload"}], "Read the original body."), Code("stripe.webhooks.constructEvent(rawBody, signature, secret);", "typescript")])',
  ].join('\n');
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program + '\n</Col>', 'stop');
  assert.equal(answer.completion.status, 'complete');
  assert.equal(answer.responseSource.text, program);
  assert.match(answer.response, /## Tenant access[\s\S]*Database \| Current membership/);
  assert.match(answer.response, /Stripe → Handler: Signed payload/);
  assert.match(answer.response, /stripe\.webhooks\.constructEvent/);
  assert.equal(answer.response.match(/Verify identity/g)?.length, 1);
  assert.equal(readNativeOpenUiShare(buildNativeOpenUiShare(answer.response, program)!)?.text, answer.response);
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

test('DELETE role checks use USING and native review catches the observed WITH CHECK advice', () => {
  const inaccurate = 'Role checks (only owner may delete a tenant) belong in a with check clause or an invoker function.';
  const program = 'root = Col([Text(' + JSON.stringify(inaccurate) + ')])';
  assert.deepEqual(validateNativeOpenUi(program), { ok: false, reason: 'authorization_review' });
  assert.deepEqual(completeNativeWorkspaceAnswer(inaccurate, 'stop').completion,
    { status: 'partial', reason: 'authorization_review' });
  for (const correct of [
    'For DELETE policies, use USING. For INSERT, use WITH CHECK.',
    'Never use WITH CHECK for DELETE.',
    'Only the owner may delete a tenant; new-row checks belong in a WITH CHECK clause.',
  ]) {
    assert.deepEqual(validateNativeOpenUi('root = Col([Text(' + JSON.stringify(correct) + ')])'), { ok: true });
  }
});

test('an unbounded Stripe retry claim gets a readable factual-review fallback', () => {
  const inaccurate = 'A non-2xx makes Stripe retry forever.';
  const program = 'root = Col([Text(' + JSON.stringify(inaccurate) + ')])';
  assert.deepEqual(validateNativeOpenUi(program), { ok: false, reason: 'factual_review' });
  const answer = completeNativeWorkspaceAnswer(inaccurate, 'stop');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
  assert.equal(answer.response, inaccurate);
  assert.equal(answer.responseSource.text, '');
  assert.deepEqual(validateNativeOpenUi('root = Col([Text("Stripe does not retry forever.")])'), { ok: true });
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
  assert.match(result.response, /Partial answer/);
  assert.match(result.responseSource.text, /Chart\("line"/);
  assert.doesNotMatch(result.responseSource.text, /ease back/);
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.deepEqual(validateNativeOpenUi(make('March increased from January.')), { ok: true });
});

test('a monthly bar chart catches incorrect gain rankings and does not publish the contradictory prose', () => {
  const rows = '[{month:"Jan", value:12000},{month:"Feb", value:15500},{month:"Mar", value:14300},{month:"Apr", value:18800},{month:"May", value:22200},{month:"Jun", value:25700}]';
  const make = (text: string) => `root = Col([Text(${JSON.stringify(text)}), Chart("bar", ${rows}, "month", ["value"], "currency", "USD")])`;
  const accurate = 'April had the largest dollar gain. April had the strongest percentage gain. The series rises in four of five months.';
  assert.deepEqual(validateNativeOpenUi(make(accurate)), { ok: true });
  for (const claim of [
    "February's +$3,500 (+29.2%) is the largest percentage gain.",
    'February is the strongest percentage gain.',
    'June adds the most dollars.',
    'Largest dollar increase: June.',
    'Largest percentage increase: May → June.',
    'March dips, then April through June accelerate sharply, with June the strongest month in both dollar and percentage terms.',
    'May is the second-largest dollar gain.',
    'Five of six months increased.',
    'March rose.',
  ]) assert.deepEqual(validateNativeOpenUi(make(claim)), { ok: false, reason: 'data_review' }, claim);
  assert.deepEqual(validateNativeOpenUi(make('February had the largest percentage gain since January.')), { ok: true });
  assert.deepEqual(validateNativeOpenUi(make('Of the first three months, February had the largest percentage gain.')), { ok: true });
  assert.deepEqual(validateNativeOpenUi(make('June had the highest revenue level. Largest dollar increase: April. Largest percentage increase: March → April.')), { ok: true });
  assert.deepEqual(validateNativeOpenUi(make('Revenue grows, with April the strongest month in both dollar and percentage terms.')), { ok: true });
  const result = completeNativeWorkspaceAnswer('June adds the most dollars.' + NATIVE_UI_MARKER + make(accurate), 'stop');
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.match(result.response, /written summary disagreed/i);
  assert.match(result.response, /\| April \| 18800 \| \+4500 \| \+31\.47% \|/);
  assert.match(result.response, /\| June \| 25700 \| \+3500 \|/);
  assert.match(result.response, /Highest chart value: \$25,700 \(June\)/);
  assert.doesNotMatch(result.response, /June adds the most/);
  assert.match(result.responseSource.text, /Chart\("bar"/);
  assert.match(result.responseSource.text, /"Month":"April","Value":18800/);
  assert.doesNotMatch(result.responseSource.text, /June adds the most|strongest percentage gain/);
  assert.deepEqual(validateNativeOpenUi(result.responseSource.text, undefined, result.response), { ok: true });
  const snapshot = buildNativeOpenUiShare(result.response, result.responseSource.text);
  assert.ok(snapshot);
  assert.equal(readNativeOpenUiShare(snapshot)?.program, result.responseSource.text);
  // No part of a program with an unverified source or dynamic chart is recovered.
  for (const program of [
    make('June adds the most dollars.').replace('Col([', 'Col([Source("unverified"), '),
    '$dollars = 3500\n' + make('June adds the most dollars.').replace('value:15500', 'value:$dollars + 12000'),
  ]) {
    const checked = completeNativeWorkspaceAnswer('June adds the most dollars.' + NATIVE_UI_MARKER + program, 'stop');
    assert.notEqual(checked.completion.status === 'partial' && checked.completion.reason, 'data_review');
    assert.doesNotMatch(checked.responseSource.text, /Partial answer/);
  }
});

test('an explicit monthly data comparison uses the supplied points and deterministic rankings in Copy and Share', () => {
  const prompt = 'Show a monthly revenue chart in USD using January 12000, February 15500, March 14300, April 18800, May 22200 and June 25700. List all month-over-month changes and identify the largest gains. Use only these supplied values.';
  const rows = '[{m:"Jan",n:12000},{m:"Feb",n:15500},{m:"Mar",n:14300},{m:"Apr",n:18800},{m:"May",n:22200},{m:"Jun",n:25700}]';
  const program = 'root = Col([Text("June was unbeatable when it came to growth."), Chart("line", ' + rows + ', "m", ["n"], "currency", "USD")])';
  const wire = (chart: string, prose = 'June outpaced every other month in growth.') => prose + NATIVE_UI_MARKER + chart;
  const answer = completeNativeWorkspaceAnswer(wire(program), 'stop', undefined, prompt);
  assert.doesNotMatch(answer.response + answer.responseSource.text, /outpaced|unbeatable/);
  assert.match(answer.response, /Largest month-over-month gain: \+\$4,500 \(April\)/);
  assert.match(answer.response, /Largest relative month-over-month gain: \+31\.47% \(April\)/);
  assert.match(answer.response, /Highest chart value: \$25,700 \(June\)/);
  assert.match(answer.responseSource.text, /Chart\("line".*Table\(/);
  const shared = buildNativeOpenUiShare(answer.response, answer.responseSource.text);
  assert.ok(shared);
  assert.equal(readNativeOpenUiShare(shared)?.text, answer.response);
  const wrong = completeNativeWorkspaceAnswer(wire(program.replace('n:18800', 'n:17000').replace('"USD"', '"EUR"')), 'stop', undefined, prompt);
  assert.deepEqual(wrong.completion, { status: 'partial', reason: 'data_review' });
  assert.match(wrong.response, /generated chart did not match the supplied values or units/);
  assert.match(wrong.responseSource.text, /"Month":"April","Value":18800/);
  assert.doesNotMatch(wrong.response + wrong.responseSource.text, /17000|EUR/);
  const contradiction = completeNativeWorkspaceAnswer(wire(program, 'June adds the most dollars.'), 'stop', undefined, prompt);
  assert.deepEqual(contradiction.completion, { status: 'partial', reason: 'data_review' });
  assert.match(contradiction.response, /written summary disagreed/);
  assert.doesNotMatch(contradiction.response, /June adds/);
  const truncated = completeNativeWorkspaceAnswer(wire(program), 'length', undefined, prompt);
  assert.deepEqual(truncated.completion, { status: 'partial', reason: 'output_limit' });
  assert.equal(truncated.responseSource.text, '');
});

test('monthly comparison keeps tied winners, separates gain metrics, and handles a zero base', () => {
  function analyze(amounts: number[]) {
    const months = ['January', 'February', 'March', 'April'];
    const prompt = 'Plot a monthly chart in USD and show the largest month-over-month changes. Use only the provided values: ' +
      months.map((month, i) => month + ' ' + amounts[i]).join(', ') + '.';
    const chart = 'root = Col([Chart("bar", ' + JSON.stringify(months.map((month, i) => ({ month, value: amounts[i] })))
      + ', "month", ["value"], "currency", "USD")])';
    return completeNativeWorkspaceAnswer('Monthly figures.' + NATIVE_UI_MARKER + chart, 'stop', undefined, prompt).response;
  }
  const tied = analyze([10, 15, 20, 25]);
  assert.match(tied, /\+\$5 \(February, March, April\)/);
  assert.match(tied, /\+50% \(February\)/);
  const separate = analyze([10, 20, 32, 33]);
  assert.match(separate, /\+\$12 \(March\)/);
  assert.match(separate, /\+100% \(February\)/);
  const zero = analyze([0, 3, 6, 0]);
  assert.match(zero, /\+\$3 \(February, March\)/);
  assert.match(zero, /gain: unavailable across all months/);
  assert.match(zero, /\| February \| 3 \| \+3 \| n\/a \|/);
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
