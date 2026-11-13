import assert from 'node:assert/strict';
import test from 'node:test';
import { NATIVE_UI_MARKER, PARTIAL_NATIVE_PRESENTATION_NOTE, missingNativeFormats, splitNativeOpenUiAnswer, validateNativeOpenUi, validateNativeWorkspaceProgram, type NativeUiDiagnostic } from './nativeOpenUi.js';
import { nativeOpenUiPlainPrompt, nativeOpenUiPrompt, workspaceNativeOpenUiPrompt } from './nativeOpenUiPrompt.js';
import { buildNativeOpenUiShare, readNativeOpenUiShare } from './nativeOpenUiShare.js';
import { readNativeOpenUiRun } from './nativeOpenUiRun.js';
import { completeNativeWorkspaceAnswer, usesNativeWorkspacePresentation } from './nativeOpenUiWorkspace.js';
import { requiredNativeFormats } from './answerCoverage.js';

test('the model gets instructions from the native registry and may answer in text', () => {
  for (const prompt of [nativeOpenUiPlainPrompt, nativeOpenUiPrompt]) {
    assert.match(prompt, /Verify the value, unit, and reference point, baseline, or denominator together/);
  }
  for (const name of ['Col(', 'Chart(', 'Slider(', 'Svg(', 'Diagram(', 'Section(', 'Table(', 'Payment(', 'Source(']) assert.ok(nativeOpenUiPrompt.includes(name), name);
  assert.deepEqual(splitNativeOpenUiAnswer('Paris.'), { text: 'Paris.', program: '' });
  assert.deepEqual(splitNativeOpenUiAnswer('Paris.\n<<<XROGA_OP', true), { text: 'Paris.', program: '' });
  assert.deepEqual(splitNativeOpenUiAnswer('<<<XROGA_OP', true), { text: '', program: '' });
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

test('the observed bare timeline object shape repairs without discarding the rest of the answer', () => {
  const program = [
    'root = Col([Section("Delivery", [steps, Code("run()", "typescript")])])',
    'steps = List(entries, "timeline")',
    'entries = [{title:"Queue",description:"Save the job."},{title:"Deliver",marker:"2",children:[Text("Confirm receipt.")]}]',
  ].join('\n');
  assert.deepEqual(validateNativeWorkspaceProgram(program, undefined, ''), { ok: false, reason: 'schema' });
  const answer = completeNativeWorkspaceAnswer('Queue, then deliver.\n\nTrack both steps.' + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.match(answer.responseSource.text, /ListItem\("Queue", "Save the job\."\)/);
  assert.match(answer.responseSource.text, /ListItem\("Deliver", "", "2", \[Text\("Confirm receipt\."\)\]\)/);
  assert.match(answer.response, /Save the job\.[\s\S]*Confirm receipt\.[\s\S]*run\(\)/);
  assert.deepEqual(validateNativeOpenUi(answer.responseSource.text, undefined, answer.response), { ok: true });
});

test('Workspace repairs diagram layout literals and keeps the complete saved presentation', () => {
  const program = [
    'root = Col([flow, Table(["Component"], [["API"]])])',
    'flow = Diagram("Request path", nodes, [{from:"web",to:"api",label:null}], "The web client calls the API.")',
    'nodes = [{id:"web",label:"Web",level:"0",detail:null},{id:"api",label:"API",level:"1",tone:null,icon:null}]',
  ].join('\n');
  const diagnostics: NativeUiDiagnostic[] = [];
  assert.deepEqual(validateNativeWorkspaceProgram(program, undefined, '', event => diagnostics.push(event)), { ok: false, reason: 'schema' });
  assert.ok(diagnostics[0]?.schema?.some(error => error.diagramField === '/nodes/*/level'));
  const answer = completeNativeWorkspaceAnswer('The web client calls the API.' + NATIVE_UI_MARKER + program,
    'stop', undefined, undefined, undefined, ['graph', 'table']);
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.match(answer.responseSource.text, /Diagram\(/);
  assert.deepEqual(validateNativeWorkspaceProgram(answer.responseSource.text, undefined, answer.response), { ok: true });
  assert.deepEqual(missingNativeFormats(answer.responseSource.text, ['graph', 'table']), []);
  const share = readNativeOpenUiShare(buildNativeOpenUiShare(answer.response, answer.responseSource.text)!);
  assert.equal(share?.program, answer.responseSource.text);
});

test('an unsupported diagram color does not remove verified nodes, edges, or their labels', () => {
  const program = [
    'root = Col([flow, Table(["Component"], [["API"]])])',
    'flow = Diagram("Request path", nodes, [{from:"web",to:"api",label:"HTTPS"}], "The web client calls the API.")',
    'nodes = [{id:"web",label:"Web",level:0,tone:"blue",detail:"Next.js"},{id:"api",label:"API",level:1,tone:"purple"}]',
  ].join('\n');
  const diagnostics: Array<NativeUiDiagnostic | { stage: 'assembly' }> = [];
  const answer = completeNativeWorkspaceAnswer('The web client calls the API over HTTPS.' + NATIVE_UI_MARKER + program,
    'stop', undefined, undefined, event => diagnostics.push(event), ['graph', 'table']);
  assert.ok(diagnostics.some(event => 'schema' in event && event.schema?.some(error => error.diagramField === '/nodes/*/tone')));
  assert.deepEqual(answer.completion, { status: 'complete' });
  const renderedDiagram = answer.responseSource.text.split('\n').find(line => line.startsWith('flow = Diagram(')) ?? '';
  assert.match(renderedDiagram, /"tone":\s*"purple"/);
  assert.doesNotMatch(renderedDiagram, /"tone":\s*"blue"/);
  assert.match(renderedDiagram, /"detail":\s*"Next\.js"/);
  assert.match(renderedDiagram, /"from":\s*"web",\s*"to":\s*"api",\s*"label":\s*"HTTPS"/);
  assert.deepEqual(missingNativeFormats(answer.responseSource.text, ['graph', 'table']), []);
  const share = readNativeOpenUiShare(buildNativeOpenUiShare(answer.response, answer.responseSource.text)!);
  assert.equal(share?.program, answer.responseSource.text);
});

test('unrenderable diagram relationships cannot satisfy graph coverage', () => {
  const nodes = [{ id: 'web', label: 'Web', level: 0 }, { id: 'api', label: 'API', level: 1 }];
  const links = [{ from: 'web', to: 'api' }];
  for (const [graphNodes, graphLinks] of [
    [nodes, [{ from: 'web', to: 'missing' }]],
    [nodes, [{ from: 'web', to: 'web' }]],
    [[nodes[0], nodes[0]], links],
    [[...nodes, { id: 'worker', label: 'Worker', level: 0 }, { id: 'auth', label: 'Auth', level: 0 }, { id: 'db', label: 'Database', level: 0 }], links],
    [[{ ...nodes[0], level: 'upstream' }, nodes[1]], links],
  ]) {
    const program = 'root = Col([Diagram("Request path", ' + JSON.stringify(graphNodes) + ', '
      + JSON.stringify(graphLinks) + ', "The web client calls the API."), Table(["Component"], [["API"]])])';
    assert.deepEqual(missingNativeFormats(program, ['graph']), ['graph']);
    const answer = completeNativeWorkspaceAnswer('The web client calls the API.' + NATIVE_UI_MARKER + program,
      'stop', undefined, undefined, undefined, ['graph', 'table']);
    assert.deepEqual(answer.completion, { status: 'partial', reason: 'presentation_contract' });
    assert.doesNotMatch(answer.responseSource.text, /Diagram\(/);
    assert.match(answer.responseSource.text, /Table\(/);
  }
});

test('native recovery discards unreachable broken references without dropping a complete layout', () => {
  const program = [
    'root = Col([table])',
    'table = Table(["Component", "Role"], [["Postgres", "Tenant data"]])',
    'unused = Section("Unused", [unresolvedPrivateIdentifier])',
  ].join('\n');
  const diagnostics: unknown[] = [];
  const result = completeNativeWorkspaceAnswer('Enforce tenant membership.' + NATIVE_UI_MARKER + program,
    'stop', undefined, undefined, event => diagnostics.push(event), ['table']);
  assert.deepEqual(result.completion, { status: 'complete' });
  assert.match(result.responseSource.text, /Table\(/);
  assert.doesNotMatch(result.responseSource.text, /Unused|unresolvedPrivateIdentifier/);
  assert.match(JSON.stringify(diagnostics), /"referenceIssue":"missing"/);
  assert.doesNotMatch(JSON.stringify(diagnostics), /unresolvedPrivateIdentifier/);
});

test('native recovery keeps verified components beside missing and cyclic references', () => {
  const table = 'table = Table(["Component", "Role"], [["Postgres", "Tenant data"]])';
  const graph = 'diagram = Diagram("Request path", [{id:"app",label:"App",level:0},{id:"db",label:"Postgres",level:1}], [{from:"app",to:"db"}], "The app verifies membership.")';
  const prose = 'Authenticate the user, verify membership, and keep service credentials server-side.';
  for (const [name, tail] of [
    ['missing', 'unstable = Section("Discarded", [unknownSection])'],
    ['cycle', 'unstable = Section("Discarded", [loop])\nloop = unstable'],
  ] as const) {
    const diagnostics: unknown[] = [];
    const program = ['root = Col([table, unstable, diagram])', table, graph, tail].join('\n');
    const result = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop', undefined, undefined,
      event => diagnostics.push(event), ['table', 'graph']);
    assert.deepEqual(result.completion, { status: 'partial', reason: 'presentation_contract' });
    assert.match(result.response, /Authenticate the user/);
    assert.match(result.responseSource.text, /Table\([\s\S]*Diagram\(/);
    assert.doesNotMatch(result.responseSource.text, /Discarded|unknownSection|\bloop\b/);
    assert.match(JSON.stringify(diagnostics), new RegExp('"referenceIssue":"' + name + '"'));
    assert.deepEqual(validateNativeOpenUi(result.responseSource.text, undefined, result.response), { ok: true });
  }
});

test('broken references cannot bypass evidence authority or factual review', () => {
  for (const program of [
    'root = Col([missing, Source("source-99")])',
    'root = Col([missing, draft])\ndraft = Text("WITH CHECK prevents moving a row to another tenant.")',
  ]) {
    const result = completeNativeWorkspaceAnswer('Check the current tenant membership.' + NATIVE_UI_MARKER + program, 'stop');
    assert.deepEqual(result.completion, { status: 'partial', reason: 'presentation_contract' });
    assert.equal(result.responseSource.text, '');
    assert.equal(result.response, 'Check the current tenant membership.');
  }
});

test('reference recovery preserves a validated calculator state and its formula', () => {
  const program = [
    'root = Col([missingCaption, Metric("Gross", @Format($attendees * 25, "currency", 0, "USD")), Controls([Slider($attendees, 10, 80, 1, "Attendees"), Button("Reset", @Set($attendees, 40))], "Attendance")])',
    '$attendees = 40',
  ].join('\n');
  const result = completeNativeWorkspaceAnswer('Gross revenue starts at $1,000.' + NATIVE_UI_MARKER + program,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(result.completion, { status: 'partial', reason: 'presentation_contract' });
  assert.match(result.responseSource.text, /\$attendees = 40/);
  assert.match(result.responseSource.text, /@Set\(\$attendees, 40\)/);
  assert.deepEqual(missingNativeFormats(result.responseSource.text, ['calculator']), []);
});

test('an invalid nested block keeps the ordered table, calculator, chart and verified source', () => {
  const prose = 'Use the supplied quote.\n\nThe controls let you compare quantities.';
  const program = [
    '$quantity = 2',
    'root = Col(blocks, 12)',
    'blocks = [Section("Estimate", [Card([Table(["Item", "USD"], [["Print", 25]]), Table(["malformed", "USD"], [[99]])]), calculator]),',
    '  Section("Scenario", [Chart("bar", [{label:"Base",price:50}], "label", ["price"]), Source("source-1")])]',
    'calculator = Row([Slider($quantity, 1, 10, 1, "Quantity"), Text("Total: $" + ($quantity * 25)), Button("Reset", @Set($quantity, 2))])',
  ].join('\n');
  const evidence = new Set(['source-1']);
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop', evidence);
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'presentation_contract' });
  assert.match(answer.response, /Use the supplied quote\.[\s\S]*## Estimate[\s\S]*Print \| 25[\s\S]*Total: \$50[\s\S]*## Scenario[\s\S]*Base \| 50[\s\S]*\[1\]/);
  assert.match(answer.responseSource.text, /Slider\(\$quantity,[\s\S]*@Set\(\$quantity, 2\)/);
  assert.match(answer.responseSource.text, /\], 12\)/);
  assert.doesNotMatch(answer.responseSource.text, /malformed/);
  assert.deepEqual(validateNativeOpenUi(answer.responseSource.text, evidence, answer.response), { ok: true });
  const source = { title: 'Workshop quote', url: 'https://example.com/quote' };
  const shared = buildNativeOpenUiShare(answer.response, answer.responseSource.text, [source]);
  assert.deepEqual(readNativeOpenUiShare(shared!), {
    format: 'xroga-openui-v1', program: answer.responseSource.text, text: answer.response, sources: [source],
  });
  assert.equal(completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop').responseSource.text, '');
});

test('one malformed wrapper preserves later blocks in a long answer', () => {
  const blocks = Array.from({ length: 52 }, (_, index) => 'Text("Item ' + index + '")');
  blocks.splice(25, 0, 'Section(42, [Text("Content from the malformed wrapper")])');
  const program = 'root = Col([' + blocks.join(', ') + '])';
  const answer = completeNativeWorkspaceAnswer('Here are the results.' + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'presentation_contract' });
  assert.match(answer.response, /Item 24[\s\S]*Content from the malformed wrapper[\s\S]*Item 25[\s\S]*Item 51/);
  assert.doesNotMatch(answer.responseSource.text, /Section\(42/);
});

test('a native-only schema failure recovers verified content and leaves unknown list fields alone', () => {
  const program = 'root = Col([Section("Report", [Text("Verified result."), List([{title:"Do not surface", unknown:"metadata"}])])])';
  const answer = completeNativeWorkspaceAnswer(NATIVE_UI_MARKER.slice(1) + program, 'stop');
  assert.equal(answer.completion.status, 'partial');
  assert.match(answer.response, /Verified result/);
  assert.doesNotMatch(answer.response + answer.responseSource.text, /Do not surface|metadata/);
  assert.equal(completeNativeWorkspaceAnswer(NATIVE_UI_MARKER.slice(1) + program, 'length').responseSource.text, '');
});

test('a schema failure cannot suppress an authorization finding or bypass chart review', () => {
  const badClaim = 'A service-role session enforces tenant RLS.';
  const program = 'root = Col([Text("Overview"), Table(["Malformed", ' + JSON.stringify(badClaim) + '])])';
  assert.deepEqual(completeNativeWorkspaceAnswer('Review access.' + NATIVE_UI_MARKER + program, 'stop').completion,
    { status: 'partial', reason: 'authorization_review' });
  const chart = 'root = Col([Text("March rose."), Table(["Malformed"]), Chart("bar", [{month:"Jan",value:12000},{month:"Feb",value:15500},{month:"Mar",value:14300}], "month", ["value"])])';
  const answer = completeNativeWorkspaceAnswer('Monthly performance.' + NATIVE_UI_MARKER + chart, 'stop');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'data_review' });
  assert.doesNotMatch(answer.response + answer.responseSource.text, /March rose/);
});

test('a validated native-only response recovers readable code and table data without a second call', () => {
  const program = 'root = Col([Text("Quote estimate"), Table(["Item", "Amount"], [["Print", 25]]), Code("total = 25", "python")])';
  const answer = completeNativeWorkspaceAnswer(NATIVE_UI_MARKER.slice(1) + program, 'stop');
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.equal(answer.responseSource.text, program);
  assert.match(answer.response, /Quote estimate/);
  assert.match(answer.response, /\| Item \| Amount \|\n\| --- \| --- \|\n\| Print \| 25 \|/);
  assert.match(answer.response, /total = 25/);
  assert.equal(readNativeOpenUiShare(buildNativeOpenUiShare(answer.response, program)!)?.text, answer.response);
});

test('an invalid program without readable prose explicitly asks the user to retry', () => {
  const seen: unknown[] = [];
  const answer = completeNativeWorkspaceAnswer(NATIVE_UI_MARKER + 'root = Col([Text("unreviewed")', 'stop', undefined, undefined, value => seen.push(value));
  assert.match(answer.response, /Send your question again to retry/);
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'presentation_contract' });
  assert.equal(answer.responseSource.text, '');
  assert.match(JSON.stringify(seen), /missing_prose/);
  assert.doesNotMatch(JSON.stringify(seen), /unreviewed/);
});

test('an empty native layout cannot cover up the written answer', () => {
  const prose = 'The complete explanation is available.';
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + 'root = Col([])', 'stop');
  assert.equal(answer.response, prose);
  assert.equal(answer.responseSource.text, '');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'presentation_contract' });
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

test('native transport variations isolate the program and preserve actual programming fences', () => {
  const program = '$count = 5\nroot = Col([Text("Count: " + $count)])';
  const fence = String.fromCharCode(96).repeat(3);
  const prose = ['Keep tenant_id unchanged.', fence + 'python', 'print("hello")', NATIVE_UI_MARKER.trim(),
    'root = Col(["literal in the example"])', fence, 'This is the full explanation.'].join('\n');
  const variants = [
    prose + NATIVE_UI_MARKER + program,
    prose + '\n\n' + program,
    prose + '\n\n' + fence + 'openui-lang\n' + program + '\n' + fence,
    prose + NATIVE_UI_MARKER + '~~~\n' + program + '\n~~~',
    JSON.stringify({ format: 'xroga-openui-v1', text: prose, program }),
  ];
  for (const wire of variants) for (const newline of ['\n', '\r\n']) {
    assert.deepEqual(splitNativeOpenUiAnswer(wire.replaceAll('\n', newline)), { text: prose, program });
  }
  const ordinary = [fence + 'json', '{"data":[1,2]}', fence].join('\n');
  const hidden = [fence + 'xroga-ui', '{"kind":"chart"}', fence].join('\n');
  assert.deepEqual(splitNativeOpenUiAnswer([ordinary, hidden, 'Next steps.'].join('\n')), { text: ordinary + '\nNext steps.', program: '' });
  assert.deepEqual(splitNativeOpenUiAnswer([prose, fence + 'openui', program, fence, 'Next steps.'].join('\n')),
    { text: prose + '\nNext steps.', program });
  assert.equal(completeNativeWorkspaceAnswer('Keep the prose.\nroot = Unknown(["internal"])', 'stop').response, 'Keep the prose.');
  const rootLast = 'visual = Text("Readable.")\n\nroot = Col([visual])';
  assert.deepEqual(splitNativeOpenUiAnswer('Readable.\n\n' + rootLast), { text: 'Readable.', program: rootLast });
});

test('every streamed transport prefix withholds the separator and keeps the prose', () => {
  const prose = 'Revenue is in USD.';
  const wire = prose + NATIVE_UI_MARKER + 'root = Col([Text("Revenue is in USD.")])';
  for (let size = prose.length; size <= wire.length; size += 1) {
    assert.equal(splitNativeOpenUiAnswer(wire.slice(0, size), true).text, prose);
  }
});

test('required visuals must render and cannot be satisfied by unused declarations or prose fallback', () => {
  const prompt = 'Build an interactive calculator with a slider. Chart and tabulate the attendance scenarios.';
  const formats = requiredNativeFormats(prompt);
  assert.deepEqual([...formats].sort(), ['calculator', 'chart', 'table']);
  assert.deepEqual(requiredNativeFormats('Explain what a chart is.'), []);
  assert.deepEqual(requiredNativeFormats('Explain the total without a chart.'), []);
  const checked: unknown[] = [];
  const prose = 'The fixed ticket price is $25.';
  const reply = completeNativeWorkspaceAnswer(prose, 'stop', undefined, undefined, event => checked.push(event), formats);
  assert.equal(reply.response, prose);
  assert.deepEqual(reply.completion, { status: 'partial', reason: 'presentation_contract' });
  assert.deepEqual(checked, [{ stage: 'assembly', reason: 'missing_formats', formats }]);
  const table = 'Table(["Attendance", "Revenue"], [[40, 1000]])';
  const wired = 'root = Col([Text("The fixed ticket price is $25.")])\nunused = ' + table;
  const unused = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + wired, 'stop', undefined, undefined, undefined, ['table']);
  assert.equal(unused.completion.status, 'partial');
  const visible = 'root = Col([Text("The fixed ticket price is $25."), ' + table + '])';
  const mixed = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + visible, 'stop', undefined, undefined, undefined, formats);
  assert.equal(mixed.completion.status, 'partial');
  assert.equal(mixed.responseSource.text, visible);
  const complete = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + visible, 'stop', undefined, undefined, undefined, ['table']);
  assert.equal(complete.completion.status, 'complete');
  const staticControl = '$attendees = 40\nroot = Col([Slider($attendees, 10, 80, 1, "Attendees"), Metric("Gross", "$1,000")])';
  const reactiveControl = staticControl.replace('"$1,000"', '@Format($attendees * 25, "currency", 0, "USD")');
  assert.equal(completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + staticControl, 'stop', undefined, undefined, undefined, ['calculator']).completion.status, 'partial');
  assert.equal(completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + reactiveControl, 'stop', undefined, undefined, undefined, ['calculator']).completion.status, 'complete');
});

test('a provider output limit preserves readable prose and keeps the answer partial', () => {
  const program = 'root = Col([Table(["Plan", "Price"], [["Team", 25]])])';
  const answer = completeNativeWorkspaceAnswer('Team is $25.' + NATIVE_UI_MARKER + program, 'length');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'output_limit' });
  assert.equal(answer.responseSource.text, '');
  assert.match(answer.response, /Team is \$25\./);
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
  assert.match(answer.response, /finite delivery window/);
  assert.ok(answer.response.endsWith(inaccurate));
  assert.equal(answer.responseSource.text, '');
  assert.deepEqual(validateNativeOpenUi('root = Col([Text("Stripe does not retry forever.")])'), { ok: true });
});

test('the captured seasons error is flagged in prose and native content', () => {
  const inaccurate = 'Earth has seasons because its axis is tilted about 23.5° relative to its orbital plane, so as it orbits the Sun each hemisphere alternately receives more direct sunlight and longer days, then less direct sunlight and shorter days.';
  const result = completeNativeWorkspaceAnswer(inaccurate, 'stop');
  assert.deepEqual(result.completion, { status: 'partial', reason: 'factual_review' });
  assert.match(result.response, /23\.4° from the perpendicular to its orbital plane/);
  assert.ok(result.response.endsWith(inaccurate));
  assert.equal(result.responseSource.text, '');
  const program = (text: string) => 'root = Col([Text(' + JSON.stringify(text) + ')])';
  const diagnostics: NativeUiDiagnostic[] = [];
  assert.deepEqual(validateNativeWorkspaceProgram(program(inaccurate), undefined, '', event => diagnostics.push(event)),
    { ok: false, reason: 'factual_review' });
  assert.equal(diagnostics[0]?.factualRule, 'earth_axial_tilt_reference');
  for (const accurate of [
    'Earth’s rotation axis is tilted 23.4 degrees from the normal to the orbital plane.',
    'Earth’s equatorial plane is inclined 23.5° relative to its orbital plane.',
    'Earth’s axis makes an angle of 66.5° with its orbital plane.',
    'Earth’s axis is not tilted 23.5° from its orbital plane.',
    'Earth’s tilted axis changes the angle of sunlight and the length of the day over the year.',
  ]) {
    assert.deepEqual(completeNativeWorkspaceAnswer(accurate, 'stop').completion, { status: 'complete' });
    assert.deepEqual(validateNativeWorkspaceProgram(program(accurate), undefined, ''), { ok: true });
  }
});

test('membership checks are not treated as an immutable tenant key', () => {
  const inaccurate = 'WITH CHECK prevents moving a row to another tenant.';
  const program = 'root = Col([Table(["Component", "Role"], [["Postgres", "Tenant data"]])])';
  const diagnostics: unknown[] = [];
  const result = completeNativeWorkspaceAnswer(
    'Check current membership for both row versions.\n\n```sql\n-- ' + inaccurate + '\n```' + NATIVE_UI_MARKER + program,
    'stop', undefined, undefined, event => diagnostics.push(event),
  );
  assert.deepEqual(result.completion, { status: 'partial', reason: 'factual_review' });
  assert.match(result.response, /both pass for a user who belongs to both tenants/);
  assert.match(result.response, /restrict UPDATE privileges/);
  assert.match(JSON.stringify(diagnostics), /"factualRule":"tenant_key_immutability"/);
  for (const accurate of [
    'WITH CHECK blocks moves to an unauthorized tenant.',
    'WITH CHECK prevents moving a row to another tenant if the user lacks membership there.',
    'WITH CHECK does not prevent moving a row between tenants where the user belongs to both.',
  ]) {
    assert.deepEqual(validateNativeOpenUi(program, undefined, accurate), { ok: true });
  }
});

test('a flagged billing claim keeps independently valid architecture with an explicit correction', () => {
  const prose = 'Use tenant membership for authorization and a separate Stripe webhook for billing.';
  const unsafe = 'Compare event timestamps against stored state to order deliveries.';
  const program = [
    'root = Col([Section("Architecture", [Table(["Component", "Role"], [["Next.js", "Web"]]), billing]), Code("verify(rawBody);", "typescript")])',
    'billing = Text(' + JSON.stringify(unsafe) + ')',
  ].join('\n');
  const diagnostics: unknown[] = [];
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop', undefined, undefined, event => diagnostics.push(event));
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
  assert.ok(answer.response.startsWith(PARTIAL_NATIVE_PRESENTATION_NOTE));
  assert.match(answer.response, /do not establish delivery order/);
  assert.match(answer.response, /Next\.js \| Web/);
  assert.match(answer.responseSource.text, /Code\("verify\(rawBody\);"/);
  assert.doesNotMatch(answer.response + answer.responseSource.text, /compare event timestamps/i);
  assert.deepEqual(validateNativeOpenUi(answer.responseSource.text, undefined, answer.response), { ok: true });
  assert.ok(buildNativeOpenUiShare(answer.response, answer.responseSource.text));
  assert.match(JSON.stringify(diagnostics), /"factualRule":"stripe_event_order"/);
  assert.doesNotMatch(JSON.stringify(diagnostics), /stored state|rawBody|Next\.js/);

  const unverified = program.replace('billing]),', 'billing, Source("source-99")]),');
  assert.equal(completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + unverified, 'stop').responseSource.text, '');
  assert.equal(completeNativeWorkspaceAnswer(prose + '\n' + unsafe + NATIVE_UI_MARKER + program, 'stop').responseSource.text, '');
  assert.equal(completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'length').responseSource.text, '');
});

test('Stripe reconciliation advice that rejects timestamp ordering keeps the native answer', () => {
  const advice = 'Reconcile out-of-order delivery against authoritative Stripe state (fetch the subscription/customer) rather than inferring order from `event.created` or timestamps.';
  const program = 'root = Col([Text("Webhook flow"), Table(["Step", "Action"], [["1", "Verify the signature"]])])';
  const answer = completeNativeWorkspaceAnswer(advice + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.equal(answer.responseSource.text, program);
  const unsafe = advice.slice(0, -1) + ', but compare event timestamps against stored state to ignore stale deliveries.';
  assert.deepEqual(validateNativeOpenUi(program, undefined, unsafe), { ok: false, reason: 'factual_review' });
});

test('factual layout recovery does not hide contradictory chart prose from a removed block', () => {
  const program = 'root = Col([Text("Stripe will retry indefinitely. March rose."), Chart("bar", [{month:"Jan",value:12},{month:"Feb",value:15},{month:"Mar",value:14}], "month", ["value"])])';
  const answer = completeNativeWorkspaceAnswer('Review the monthly chart.' + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
  assert.match(answer.response, /finite delivery window/);
  assert.doesNotMatch(answer.response, /March rose/);
  assert.equal(answer.responseSource.text, '');
});

test('hosted authorization and billing contradictions get corrections before the saved draft', () => {
  const cookie = 'A server-only client that owns an HTTP-only session or uses the service role bypasses RLS.';
  const roles = 'Role checks for privileged operations, including deletion, require owner or admin.';
  const policy = 'create policy projects_delete on projects\n  for delete using (is_tenant_member(tenant_id));';
  const ordering = 'For Stripe webhooks, compare event timestamps against stored state; never overwrite newer data.';
  const draft = [cookie, roles, policy, ordering].join('\n\n');
  const program = 'root = Col([Text("Architecture")])';
  const answer = completeNativeWorkspaceAnswer(draft + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'authorization_review' });
  assert.equal(answer.responseSource.text, '');
  assert.match(answer.response, /^## Technical corrections[\s\S]*user access token[\s\S]*membership-only predicate[\s\S]*timestamps can tie/);
  assert.ok(answer.response.endsWith(draft));
  assert.deepEqual(validateNativeOpenUi(program, undefined, ordering), { ok: false, reason: 'factual_review' });
  const codeOnly = 'root = Col([Text(' + JSON.stringify(roles) + '), Code(' + JSON.stringify(policy) + ', "sql")])';
  assert.deepEqual(validateNativeOpenUi(codeOnly), { ok: false, reason: 'authorization_review' });
  for (const correct of [
    'A server-only client may use HTTP-only cookies. Requests with a user token still obey RLS.',
    'An HTTP-only session can bypass RLS only if the request uses a service-role identity.',
    roles + '\n' + policy.replace('is_tenant_member(tenant_id)', "has_tenant_role(tenant_id, 'admin')"),
    'Stripe webhooks: do not use event timestamps to order delivery. Fetch current subscription state.',
    'Compare event timestamps for reporting on webhook latency in Stripe.',
  ]) {
    assert.deepEqual(validateNativeOpenUi(program, undefined, correct), { ok: true }, correct);
  }
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

test('the hosted revenue wording verifies every user-supplied value and both gain measures', () => {
  const prompt = 'Show a monthly revenue chart and table in USD: January 8000, February 10000, March 12000, April 11000, May 13000, June 16000. Explain the largest dollar gain and largest percentage gain separately. Use only these values and no web search.';
  const chart = 'root = Col([Chart("line", [{month:"Jan",usd:8000},{month:"Feb",usd:10000},{month:"Mar",usd:12000},{month:"Apr",usd:11000},{month:"May",usd:13000},{month:"Jun",usd:16000}], "month", ["usd"], "currency", "USD")])';
  const prose = 'Revenue rose from January to June.';
  const result = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + chart, 'stop', undefined, prompt);
  assert.deepEqual(result.completion, { status: 'complete' });
  assert.match(result.response, /Largest month-over-month gain: \+\$3,000 \(June\)/);
  assert.match(result.response, /Largest relative month-over-month gain: \+25% \(February\)/);
  assert.match(result.responseSource.text, /Chart\("line".*Table\(/);
  const altered = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + chart.replace('usd:16000', 'usd:17000'), 'stop', undefined, prompt);
  assert.deepEqual(altered.completion, { status: 'partial', reason: 'data_review' });
  assert.match(altered.responseSource.text, /"Month":"June","Value":16000/);
  assert.doesNotMatch(altered.responseSource.text, /17000/);
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
