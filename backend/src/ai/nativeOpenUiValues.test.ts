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

test('fixed decimal readouts preserve the requested precision without changing saved formats', () => {
  const source = [
    'root = Col([Metric("Litres", @Format($amount, "fixed", 2) + " L"), Metric("Saved numeric", @Format($amount, "number", 2)), Metric("Saved currency", @Format($amount, "currency", 2, "USD"))])',
    '$amount = 9.6',
  ].join('\n');
  assert.deepEqual(initialNativeReadouts(source), [
    { label: 'Litres', value: '9.60 L' },
    { label: 'Saved numeric', value: '9.6' },
    { label: 'Saved currency', value: '$9.60' },
  ]);
});

test('whole-unit estimates round up unrounded values without incrementing whole values', () => {
  const source = 'root = Col([Metric("Fractional", @RoundUp(4.0001)), Metric("Whole", @RoundUp(4)), Metric("Zero", @RoundUp(0))])';
  assert.deepEqual(initialNativeReadouts(source), [
    { label: 'Fractional', value: '5' },
    { label: 'Whole', value: '4' },
    { label: 'Zero', value: '0' },
  ]);
});

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

test('readout validation checks the result of percentage equations separately from their inputs', () => {
  const rows = [{ label: 'Tip', value: '$14.40' }];
  const equivalent = ['Tip: $80 × 18% = $14.40.', 'Tip: $80 × 18 / 100 = $14.40.'];
  for (const equation of equivalent) {
    assert.deepEqual(conflictingNativeReadouts(equation, rows), [], equation);
    assert.deepEqual(conflictingNativeReadouts(equation.replace('$14.40', '$15.40'), rows), rows, equation);
  }
  assert.deepEqual(conflictingNativeReadouts('Tip: $80 × 18 / 100. Total: $94.40.', rows), rows);
  const native = [
    'root = Col([Markdown(_xroga_answer), editor, Metric("Tip", @Format($bill * $rate / 100, "currency", 2, "USD")), Metric("Total to pay", @Format($bill * (1 + $rate / 100), "currency", 2, "USD"))])',
    'editor = Controls([Input($bill, "Bill amount", "number"), Input($rate, "Tip percentage", "number"), Button("Reset", @Reset($bill, $rate))], "Editable inputs")',
    '$bill = 80', '$rate = 18',
  ].join('\n');
  const answer = completeNativeWorkspaceAnswer(equivalent[0] + '\n\nTotal to pay: $94.40.' + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.match(answer.responseSource.text, /@Reset\(\$bill, \$rate\)/);
  assert.match(answer.response, /Tip: \$80 × 18% = \$14\.40/);

  const prose = 'The percentage is applied to the bill before any additional fees.\n\n'
    + '- **Tip: $14.41**\n- **Total to pay:** $94.41';
  const repaired = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(repaired.completion, { status: 'complete' });
  assert.match(repaired.response, /before any additional fees/);
  assert.match(repaired.response, /\*\*Tip: \$14\.40\*\*/);
  assert.match(repaired.response, /\*\*Total to pay:\*\* \$94\.40/);
  assert.doesNotMatch(repaired.response + repaired.responseSource.text, /14\.41|94\.41/);
  assert.match(repaired.responseSource.text, /@Reset\(\$bill, \$rate\)/);
  assert.deepEqual(initialNativeReadouts(repaired.responseSource.text), initialNativeReadouts(native));
  const shared = readNativeOpenUiShare(buildNativeOpenUiShare(repaired.response, repaired.responseSource.text)!);
  assert.equal(shared?.text, repaired.response);
  assert.equal(shared?.program, repaired.responseSource.text);

  const staticTotal = native.replace('@Format($bill * (1 + $rate / 100), "currency", 2, "USD")', '"$95.00"');
  const unverified = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + staticTotal,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(unverified.completion, { status: 'partial', reason: 'data_review' });

  const equation = prose + '\n\nTip: $80 × 18% = $14.41 after rounding.';
  const mixed = completeNativeWorkspaceAnswer(equation + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(mixed.completion, { status: 'partial', reason: 'data_review' });
});

test('reconciles an explicit result sentence without altering surrounding explanation', () => {
  const native = [
    'root = Col([Markdown(_xroga_answer), controls, Metric("Projected balance", @Format(balance, "currency", 2, "USD")), Metric("Interest earned", @Format(balance - $principal, "currency", 2, "USD")), chart])',
    '$principal = 12500', '$rate = 4', '$years = 3',
    'balance = $principal * @Pow(1 + $rate / 100, $years)',
    'controls = Controls([Input($principal, "Principal (USD)", "number"), Input($rate, "Annual rate", "number"), Input($years, "Years", "number"), Button("Reset inputs", @Reset($principal, $rate, $years))], "Compound interest inputs")',
    'chart = Chart("bar", [{component:"Principal",usd:$principal},{component:"Interest earned",usd:balance - $principal}], "component", ["usd"], "currency", "USD")',
  ].join('\n');
  const prose = 'Interest compounds annually. The projected balance is **$14,066.80**. No deposits are included.\n\n'
    + 'For example, a different principal can yield a lower balance. The projected balance is $2,000.00.';
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator', 'chart']);
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.match(answer.response, /Interest compounds annually\. The projected balance is \*\*\$14,060\.80\*\*\. No deposits are included\./);
  assert.match(answer.response, /The projected balance is \$2,000\.00\./);
  assert.doesNotMatch(answer.response + answer.responseSource.text, /14,066\.80/);
  assert.match(answer.response, /\| Interest earned \| \$1,560\.80 \|/);
  assert.match(answer.responseSource.text, /@Reset\(\$principal, \$rate, \$years\)/);
  const shared = readNativeOpenUiShare(buildNativeOpenUiShare(answer.response, answer.responseSource.text)!);
  assert.equal(shared?.text, answer.response);
  assert.equal(shared?.program, answer.responseSource.text);
});

test('an exact correction inside the calculator keeps its controls and full answer', () => {
  const prose = 'Base price and quantity can both be edited. This estimate excludes tax.';
  const native = [
    'root = Col([Markdown(_xroga_answer), purchase, Text("Order total: $53.00. Delivery is included.")])',
    '$price = 10', '$quantity = 5',
    'purchase = Controls([Input($price, "Unit price", "number"), Input($quantity, "Quantity", "number"), Button("Reset", @Reset($price, $quantity)), Metric("Order total", @Format($price * $quantity, "currency", 2, "USD"))], "Purchase inputs")',
  ].join('\n');
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.match(answer.response, /Base price and quantity can both be edited/);
  assert.match(answer.response, /Order total: \$50\.00\. Delivery is included/);
  assert.doesNotMatch(answer.response + answer.responseSource.text, /\$53\.00/);
  assert.match(answer.responseSource.text, /@Reset\(\$price, \$quantity\)/);
  assert.deepEqual(initialNativeReadouts(answer.responseSource.text), initialNativeReadouts(native));
  const snapshot = buildNativeOpenUiShare(answer.response, answer.responseSource.text);
  assert.ok(snapshot);
  assert.equal(readNativeOpenUiShare(snapshot)?.text, answer.response);
});

test('sensitivity and boundary examples do not conflict with the selected calculator result', () => {
  const rows = [{ label: 'Interest', value: '$1,500.00' }, { label: 'Total balance', value: '$11,500.00' }];
  const examples = [
    '- Each 1 percentage point of annual rate changes total interest by 10,000 × 0.01 × 3 = $300 over three years.',
    '- Each additional year at 5% adds $500 of interest.',
    '- Boundary values work: a 0% rate gives $0 interest and a $10,000 total; a 0-year duration does the same.',
  ].join('\n');
  const correct = 'Interest: 10,000 × 0.05 × 3 = $1,500.00. Total balance: $11,500.00.';
  assert.deepEqual(conflictingNativeReadouts(correct + '\n\n' + examples, rows), []);
  assert.deepEqual(conflictingNativeReadouts('Interest: $1,800.00.\n' + examples, rows), [rows[0]]);
  assert.deepEqual(conflictingNativeReadouts('Each additional year adds $500 of interest, but interest at the current settings is $1,800.00.', rows), [rows[0]]);
});

test('a sensitivity chart can reuse a calculator result name without replacing the active readout', () => {
  const prose = 'Net proceeds equal ticket price times attendance minus the fixed USD 60 cost. At USD 18 and 24 attendees, gross revenue is USD 432 and net proceeds are USD 372.';
  // Reconstruct the scenario shape from the hosted fallback. The rejected
  // provider program is deliberately absent from production-style evidence.
  const native = [
    'root = Col([Markdown(_xroga_answer), controls, gross, net, scenarios])',
    '$tickets = 24',
    '$price = 18',
    'controls = Controls([Input($price, "Ticket price (USD)", "number"), Input($tickets, "Paid attendance", "number"), Button("Reset inputs", @Reset($price, $tickets))], "Event inputs")',
    'gross = Metric("Gross ticket revenue", @Format($price * $tickets, "currency", 2, "USD"))',
    'net = Metric("Net proceeds", @Format($price * $tickets - 60, "currency", 2, "USD"))',
    'scenarios = Chart("bar", [{price:12,net:12 * $tickets - 60},{price:18,net:18 * $tickets - 60},{price:24,net:24 * $tickets - 60}], "price", ["net"], "currency", "USD", false, 240, {title:"Net proceeds at each ticket price",xLabel:"Ticket price",yLabel:"Net proceeds"})',
  ].join('\n');
  const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.match(answer.response, /Net proceeds: \$372\.00/);
  assert.match(answer.response, /\| 12 \| \$228\.00 \|/);
  assert.match(answer.response, /\| 24 \| \$516\.00 \|/);
  assert.match(answer.responseSource.text, /@Reset\(\$price, \$tickets\)/);
  const share = buildNativeOpenUiShare(answer.response, answer.responseSource.text);
  assert.ok(share);
  assert.equal(readNativeOpenUiShare(share)?.program, answer.responseSource.text);

  const falseCurrentResults = '| Metric | Current value |\n| --- | --- |\n| **Net proceeds** | **$999.00** |';
  const rejected = completeNativeWorkspaceAnswer(prose + '\n\n' + falseCurrentResults + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(rejected.completion, { status: 'partial', reason: 'data_review' });
  assert.doesNotMatch(rejected.response + rejected.responseSource.text, /999\.00/);
  assert.match(rejected.response, /\| 12 \| \$228\.00 \|/);
});

test('saved answer preserves calculator and readable computed values after a prose conflict', () => {
  const prose = [
    'This example assumes a fixed rate and excludes fees.',
    'Total interest: $4,331.83. Check whether your lender charges a fee for paying early.',
    '```text\nTotal interest: $4,331.83\n\nThis entire conflicting example block is withheld.\n```',
    'The schedule uses 60 monthly payments.',
  ].join('\n\n');
  const result = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop');
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.equal(result.responseSource.text, program);
  assert.match(result.response, /4,331\.67/);
  assert.match(result.response, /This example assumes a fixed rate and excludes fees/);
  assert.match(result.response, /Check whether your lender charges a fee for paying early/);
  assert.match(result.response, /The schedule uses 60 monthly payments/);
  assert.doesNotMatch(result.response, /4,331\.83|@Payment|\x60{3}|entire conflicting example block/);
  const snapshot = buildNativeOpenUiShare(result.response, result.responseSource.text);
  assert.ok(snapshot);
  assert.equal(readNativeOpenUiShare(snapshot)?.text, result.response);
});

test('an unrepaired visual cannot restore the conflicting readout', () => {
  const native = program.replace('root = Col([', 'root = Col([Quote("Total interest: $4,331.83"), Text("Payments are monthly."), ');
  const prose = 'Change either input and the totals update immediately. The calculation excludes fees.';
  const result = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + native,
    'stop', undefined, undefined, undefined, ['calculator']);
  assert.deepEqual(result.completion, { status: 'partial', reason: 'data_review' });
  assert.equal(result.responseSource.text, '');
  assert.match(result.response, /The calculation excludes fees/);
  assert.match(result.response, /worked example/);
  assert.doesNotMatch(result.response, /totals update immediately/);
  assert.match(result.response, /Payments are monthly/);
  assert.match(result.response, /4,331\.67/);
  assert.doesNotMatch(result.response, /4,331\.83/);
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

test('a more precise figure that rounds to the readout is not a conflict', () => {
  const rows = [{ label: 'Monthly payment', value: '$664.29' }];
  assert.deepEqual(conflictingNativeReadouts('The unrounded monthly payment is $664.2862.', rows), []);
  assert.deepEqual(conflictingNativeReadouts('The monthly payment is $664.2962.', rows), rows);
});
