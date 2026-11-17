import assert from 'node:assert/strict';
import test from 'node:test';
import { initialNativeReadouts, initialNativeValueReader, conflictingNativeReadouts, nativePrincipalMultipleReview } from './nativeOpenUiValues.js';
import { parseExpression, tokenize } from '@openuidev/lang-core';
import { completeNativeWorkspaceAnswer } from './nativeOpenUiWorkspace.js';
import { NATIVE_UI_MARKER, supplementNativeProse } from './nativeOpenUi.js';
import { nativeTechnicalCorrections } from './nativeOpenUiAccuracy.js';
import { buildNativeOpenUiShare, readNativeOpenUiShare } from './nativeOpenUiShare.js';

const program = `root = Col([Metric("Monthly payment", @Format(payment, "currency", 2, "USD")), Metric("Total interest", @Format(payment * 60 - $principal, "currency", 2, "USD"))])
$principal = 20000
$apr = 8
payment = @Payment($principal, $apr / 12, 60)`;

test('readable table snapshots evaluate dynamic column headings without fabricating blank cells', () => {
  const source = 'root = Col([Table(["Compounding", "Balance after " + @Plural($years, "year")], [["Monthly", @Format(18193.96734, "currency", 2, "USD")]])])\n$years = 10';
  const prose = supplementNativeProse('Initial calculation.', source, true);
  assert.match(prose, /\| Compounding \| Balance after 10 years \|/);
  assert.match(prose, /\| Monthly \| \$18,193\.97 \|/);
  assert.doesNotMatch(prose, /\| Compounding \|  \|/);
});

test('a principal multiple stays tied to the currency metric it describes', () => {
  const prose = 'Interest: $8,193.97 (1.82× the principal)\n\nThe balance is $18,193.97.';
  const source = 'root = Col([Markdown(body), Slider($principal, 1000, 100000, 500, "Principal", "$"), Metric("Interest earned", @Format(8193.96734, "currency", 2, "USD"), "About 1.82x the principal you started with")])\n$principal = 10000\nbody = '+JSON.stringify(prose);
  const review = nativePrincipalMultipleReview(source);
  assert.deepEqual([...(review?.conflictingNotes ?? [])], ['Interest earned']);
  assert.equal(review?.repairProse(prose), 'Interest: $8,193.97\n\nThe balance is $18,193.97.');
  assert.equal(review?.repairProse('Interest: $200 (2× the principal)'), 'Interest: $200 (2× the principal)', 'A distinct worked example must stay intact');
  const corrected = completeNativeWorkspaceAnswer(prose+NATIVE_UI_MARKER+source,'stop');
  assert.equal(corrected.completion.status,'partial');
  assert.match(corrected.response,/\$8,193\.97/);
  assert.match(corrected.response,/The balance is \$18,193\.97/);
  assert.doesNotMatch(corrected.response,/1\.82[x×]/);
  assert.ok(corrected.responseSource.text.includes('Slider('));
  const correct=source.replaceAll('1.82','0.82');
  assert.equal(nativePrincipalMultipleReview(correct)?.conflictingNotes.size,0);
  assert.equal(nativePrincipalMultipleReview(correct)?.repairProse(prose.replace('1.82','0.82')),prose.replace('1.82','0.82'));
  const explicit=source.replace('About 1.82x','Final balance is 1.82x');
  assert.equal(nativePrincipalMultipleReview(explicit)?.conflictingNotes.size,0);
  const precise='root = Col([Slider($principal,1,10,1,"Principal","$"), Metric("Interest earned", "$0.12", "About 0.123456x the principal")])\n$principal = 1';
  assert.equal(nativePrincipalMultipleReview(precise)?.conflictingNotes.size,0,'Displayed currency rounding must not reject a more precise correct ratio');
  assert.equal(nativePrincipalMultipleReview(source.replace('"Principal", "$"','"Principal", "EUR"')),undefined,'Never infer a currency conversion');
  const earlyBody=source.split('\n').reverse().join('\n');
  const reordered=completeNativeWorkspaceAnswer(prose+NATIVE_UI_MARKER+earlyBody,'stop');
  assert.doesNotMatch(reordered.response,/1\.82[x×] the principal/);
});

test('initial calculator snapshots reuse upstream payment and formatting functions', () => {
  assert.deepEqual(initialNativeReadouts(program), [
    { label: 'Monthly payment', value: '$405.53' },
    { label: 'Total interest', value: '$4,331.67' },
  ]);
  assert.equal(initialNativeReadouts(program.replace('$apr = 8', '$apr = 0'))[1].value, '$0.00');
});

test('calculated rates retain their exact denominator through root references and recovery', () => {
  const native = 'root = answer\nanswer = Col([Metric("Team per seat", @Format(25 / 5, "currency", 2, "USD")), Text("Five seats are included per month.")])';
  assert.deepEqual(initialNativeReadouts(native), [{ label: 'Team per seat', value: '$5.00' }]);
  const result = completeNativeWorkspaceAnswer('Basic is cheaper per month, but Team is far cheaper per seat: $2.00 per seat versus $10.00. Team only makes sense if you actually need more than one seat.' + NATIVE_UI_MARKER + native, 'stop');
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.match(result.response, /\$5\.00/);
  assert.doesNotMatch(result.response, /\$2\.00/);
  assert.match(result.response, /Five seats are included per month/);
});

test('snapshots fail closed on cycles, missing references and actions', () => {
  for (const expression of ['missing', '@Set($amount, 10)', 'cycle']) {
    assert.deepEqual(initialNativeReadouts(`root = Col([Metric("Total", ${expression})])\n$amount = 1\ncycle = cycle`), []);
  }
});

test('currency review compares a labeled equation result rather than its operand', () => {
  const rows = [{ label: 'Team per seat', value: '$5.00' }];
  for (const operator of ['÷', '/', 'divided by']) {
    assert.deepEqual(conflictingNativeReadouts(`Team per-seat cost: $25 ${operator} 5 seats = $5.00 per seat-month.`, rows), []);
    assert.deepEqual(conflictingNativeReadouts(`Team per-seat cost: $25 ${operator} 5 seats = $6.00 per seat-month.`, rows), rows);
  }
  for (const text of [
    'Team per seat: $2; another price is $25 / 5 = $5.00.',
    'Team per seat: $2\nAnother price is $25 / 5 = $5.00.',
    'Team per seat: $2 and another price is $25 / 5 = $5.00.',
    'Team per seat: $25 / 5 seats = €5.00.',
  ]) assert.deepEqual(conflictingNativeReadouts(text, rows), rows, text);
});

test('correct per-seat calculation remains complete through native answer and Share', () => {
  const prose = 'Team per-seat cost: $25 ÷ 5 seats = $5.00 per seat-month.';
  const native = `root = Col([Markdown(answer), Metric("Team per seat", @Format(25 / 5, "currency", 2, "USD"))])\nanswer = ${JSON.stringify(prose)}`;
  const result = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + native, 'stop');
  assert.equal(result.completion.status, 'complete');
  assert.ok(result.response.includes(prose));
  assert.doesNotMatch(result.response, /inconsistent numerical explanation/);
  const snapshot = buildNativeOpenUiShare(result.response, result.responseSource.text);
  assert.ok(snapshot);
  assert.equal(readNativeOpenUiShare(snapshot)?.text, result.response);
});

test('currency conflicts match corresponding labels without rewriting examples', () => {
  const rows = initialNativeReadouts(program);
  assert.equal(conflictingNativeReadouts('Total interest: $4,331.83.', rows).length, 1);
  assert.equal(conflictingNativeReadouts('Total interest: $4,331.67.', rows).length, 0);
  assert.equal(conflictingNativeReadouts('For example, total interest: $1,000.', rows).length, 0);
  assert.equal(conflictingNativeReadouts('For example. Total interest: $1,000.', rows).length, 0);
  assert.equal(conflictingNativeReadouts('Principal: $20,000.', rows).length, 0);
  assert.equal(conflictingNativeReadouts('Total interest: $4,331.83. If you refinance, the total will change.', rows).length, 1);
  assert.equal(conflictingNativeReadouts('If you refinance, total interest could be $1,000.', rows).length, 0);
  assert.deepEqual(conflictingNativeReadouts('word '.repeat(1000) + '$2.', [
    { label: 'word '.repeat(100) + 'absent', value: '$5.00' },
  ]), []);
});

test('saved answer preserves calculator and readable computed values after a prose conflict', () => {
  const result = completeNativeWorkspaceAnswer('Total interest: $4,331.83.' + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.equal(result.responseSource.text, program);
  assert.match(result.response, /4,331\.67/);
  assert.doesNotMatch(result.response, /4,331\.83|@Payment/);
});

test('conflicting totals inside native explanatory text cannot return through recovery', () => {
  const rich = program.replace('root = Col([', 'root = Col([intro, formula, ')
    + '\nintro = Text("A $20,000 loan costs $405.53 per month, with about $4,331.93 of total interest.")'
    + '\nformula = Text("At the initial values, payment is $405.53 and interest is $4,331.93.")';
  const result = completeNativeWorkspaceAnswer('Total interest: $4,331.93.' + NATIVE_UI_MARKER + rich, 'stop');
  assert.equal(result.completion.status, 'partial');
  assert.match(result.response, /4,331\.67/);
  assert.doesNotMatch(result.response + result.responseSource.text, /4,331\.93/);
  assert.deepEqual(initialNativeReadouts(result.responseSource.text), initialNativeReadouts(program));
  assert.match(result.responseSource.text, /@Payment/);
  const accurateProse = completeNativeWorkspaceAnswer('Total interest: $4,331.67.' + NATIVE_UI_MARKER + rich, 'stop');
  assert.doesNotMatch(accurateProse.response + accurateProse.responseSource.text, /4,331\.93/);
});

test('a false minimum is removed while retaining the monthly chart', () => {
  const chart = 'root = Col([Chart("line", [{month:"January",value:20},{month:"February",value:24},{month:"March",value:22}], "month", ["value"], "number")])';
  const wrong = completeNativeWorkspaceAnswer('March was the lowest month.' + NATIVE_UI_MARKER + chart, 'stop');
  assert.deepEqual(wrong.completion, { status: 'partial', reason: 'data_review' });
  assert.ok(wrong.responseSource.text);
  assert.doesNotMatch(wrong.response, /March was the lowest/);
  const scoped = completeNativeWorkspaceAnswer('March was the lowest month since February.' + NATIVE_UI_MARKER + chart, 'stop');
  assert.equal(scoped.completion.status, 'complete');
  const monotonic = completeNativeWorkspaceAnswer('The series rises each month, up 4 and then down 2.' + NATIVE_UI_MARKER + chart, 'stop');
  assert.equal(monotonic.completion.status, 'partial');
  assert.doesNotMatch(monotonic.response, /rises each month/);
  assert.ok(monotonic.responseSource.text);
  const net = completeNativeWorkspaceAnswer('The series rises overall, but not every month.' + NATIVE_UI_MARKER + chart, 'stop');
  assert.equal(net.completion.status, 'complete');
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

test('a rich answer derives its complete readable copy from the native program', () => {
  const summary = 'Here is the comparison. The details and limitations are included below.';
  const rich = 'root = Col([Table(["Plan", "Price"], [["Basic", "$10"], ["Team", "$25"]]), Section("Limitations", [Text("Feature availability has not been supplied.")]), Code("const seats = 5;", "javascript")])';
  const result = completeNativeWorkspaceAnswer(summary + NATIVE_UI_MARKER + rich, 'stop');
  assert.equal(result.completion.status, 'complete');
  assert.match(result.response, /\| Basic \| \$10 \|/);
  assert.match(result.response, /Feature availability has not been supplied/);
  assert.match(result.response, /const seats = 5;/);
  assert.doesNotMatch(result.response, /root = Col/);
  assert.equal(result.responseSource.text, rich);
});

test('readable recovery keeps calculated table cells and boolean values', () => {
  const table = 'root = Col([Table(["Item", "Value"], [["Payment", @Format(@Payment($principal, $apr / 12, 60), "currency", 2, "USD")], ["Enabled", true]])])\n$principal = 20000\n$apr = 8';
  const text = supplementNativeProse('', table, true);
  assert.match(text, /\| Payment \| \$405\.53 \|/);
  assert.match(text, /\| Enabled \| true \|/);
  assert.doesNotMatch(text, /@Payment|\$principal|\"k\"/);
  assert.match(supplementNativeProse('', table.replace('$apr = 8', '$apr = 0'), true), /\$333\.33/);
});

test('readable history and Share retain nested alternative sections and supporting notes', () => {
  const rich = `root = Col([Section("Practical guidance", [Tabs("Choosing an approach", options)])])
options = [{title: "Server", content: [Text("Authorize next to the query."), Popover("Assumption", Text("Only verified members may read."))]}, {title: "Client", content: [Text("Keep tokens out of client modules."), Quote("Review each mutation.", "Review checklist")]}]`;
  const result = completeNativeWorkspaceAnswer('Compare the approaches.' + NATIVE_UI_MARKER + rich, 'stop');
  assert.equal(result.completion.status, 'complete');
  for (const text of ['Choosing an approach', '### Server', 'Authorize next to the query.', 'Assumption', 'Only verified members may read.', '### Client', 'Keep tokens out of client modules.', 'Review each mutation.', 'Review checklist']) {
    assert.ok(result.response.includes(text), text);
  }
  assert.doesNotMatch(result.response, /root =|Tabs\(|Popover\(/);
  const snapshot = buildNativeOpenUiShare(result.response, result.responseSource.text);
  assert.ok(snapshot);
  const shared = readNativeOpenUiShare(snapshot);
  assert.equal(shared?.text, result.response);
});

test('readable study content retains both faces and formulas without executing interactions', () => {
  const rich = 'root = Col([Flashcard("Area?", [Math("A = pi r^2"), Text("Square the radius first.")])])';
  const text = supplementNativeProse('', rich, true);
  assert.match(text, /Area\?/);
  assert.match(text, /A = pi r\^2/);
  assert.match(text, /Square the radius first/);
});

test('initial table evaluation rejects non-finite values, actions and cycles', () => {
  for (const expression of ['@Set($amount, 10)', 'cycle', 'missing']) {
    const read = initialNativeValueReader('root = Col([])\n$amount = 1\ncycle = cycle');
    assert.equal(read(Infinity), undefined);
    assert.equal(read(NaN), undefined);
    assert.equal(read(parseExpression(tokenize(expression))), undefined);
    assert.equal(read(parseExpression(tokenize('$amount'))), 1, 'An action must not modify initial state');
  }
});
