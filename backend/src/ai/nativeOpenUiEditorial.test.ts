import assert from 'node:assert/strict';
import test from 'node:test';
import { NATIVE_UI_MARKER, type NativeUiDiagnostic } from './nativeOpenUi.js';
import { reviewEditorialProse, reviewEditorialVisuals } from './nativeOpenUiEditorial.js';
import { completeNativeWorkspaceAnswer } from './nativeOpenUiWorkspace.js';

const stop = 'Damage to the seal or latch means the parcel leaves the dispatch path.';
const allowed = 'If the only fault is a latch with a cracked casing, a team member may dispatch the parcel.';

test('a narrower scenario cannot reopen a condition covered by an explicit stop', () => {
  const distinct = '## Records\n\nKeep the intake number in the custody log.';
  const answer = completeNativeWorkspaceAnswer(
    [stop, '## Scenario\n\n' + allowed, distinct].join('\n\n')
      + NATIVE_UI_MARKER + 'root = Col([Markdown(_xroga_answer)])',
    'stop',
  );
  assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
  assert.equal(answer.responseSource.text, '');
  assert.match(answer.response, /withheld the affected steps/);
  assert.ok(answer.response.includes(stop));
  assert.ok(answer.response.includes(distinct));
  assert.ok(!answer.response.includes(allowed));
});

test('distinct conditions and repaired or explicitly cleared items keep their own outcomes', () => {
  const prose = [
    stop,
    'If there is no damage to the latch, continue packing.',
    'If the latch is damaged but after a qualified inspection the stop is cleared, proceed.',
    'If the label is torn, replace the label.',
    'Trained volunteers may perform restricted tasks under the site policy.',
    '> If the latch is damaged, proceed.',
    'Bad example: if the latch is damaged, proceed.',
    '```markdown\nIf the latch is damaged, proceed.\n\nThis is quoted syntax.\n```',
  ].join('\n\n');
  assert.equal(reviewEditorialProse(prose), undefined);
});

test('the user-supplied decision remains binding even when the answer omits it', () => {
  const request = 'If the manifest is missing, stop.\n\nSign-off before dispatch.';
  assert.equal(reviewEditorialProse('If the manifest is missing, release the shipment.', request), '');
  assert.equal(reviewEditorialProse('Dispatch before sign-off.', request), '');
  assert.equal(reviewEditorialProse('Sign-off before dispatch.', request), undefined);
  assert.equal(reviewEditorialProse('Stop if it rains.'), undefined);
});

test('do not show an interactive representation with a conflicting decision or prerequisite', () => {
  const prose = ['## Depot workflow', '',
    '| Condition | Decision |', '| --- | --- |', '| Manifest missing | Stop and refer. |', '',
    'Verify manifest before dispatch.',
  ].join('\n');
  const conflictingTable = 'Table(["Condition", "Decision"], [["Manifest missing", "Dispatch the shipment"]])';
  const conflictingDiagram = 'Diagram("Dispatch", [{id:"dispatch",label:"Dispatch",level:0},{id:"verify",label:"Verify manifest",level:1}], [{from:"dispatch",to:"verify"}], "The depot workflow.")';
  for (const [visual, rule] of [[conflictingTable, 'decision_conflict'], [conflictingDiagram, 'prerequisite_conflict']]) {
    const seen: NativeUiDiagnostic[] = [];
    const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER
      + 'root = Col([Markdown(_xroga_answer), ' + visual + '])', 'stop', undefined, undefined, record => {
        if (record.stage !== 'assembly') seen.push(record);
      });
    assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' }, rule + ': ' + JSON.stringify(seen));
    assert.equal(answer.responseSource.text, '');
    assert.ok(answer.response.endsWith(prose));
    assert.equal(seen.at(-1)?.editorialIssue, rule);
    assert.doesNotMatch(JSON.stringify(seen), /manifest missing|shipment/i);
  }
});

test('direct branches, inline notes and explicit decision records share the same condition', () => {
  const request = 'If the archive seal is broken, stop.';
  const labels = [
    { id: 'intake', label: 'Inspection' },
    { id: 'dispatch', label: 'Release item' },
  ];
  const diagram = { typeName: 'Diagram', props: {
    nodes: labels, links: [{ from: 'intake', to: 'dispatch', label: 'Broken archive seal' }],
  } };
  assert.equal(reviewEditorialVisuals('### Intake', [diagram], request)?.issue, 'decision_conflict');
  assert.equal(reviewEditorialVisuals('### Intake', [{ typeName: 'ListItem', props: {
    description: 'If the archive seal is broken, release the item.',
  } }], request)?.issue, 'decision_conflict');
  assert.equal(reviewEditorialVisuals('### Intake', [{ typeName: 'Table', props: {
    columns: ['Trigger', 'Disposition'], rows: [['Archive seal broken', 'Refer to the collection manager']],
  } }], request), undefined);
});

test('readable fallback withholds permissive prose contradicted by a visual stop', () => {
  const prose = [
    '## Check-in\n\nLog the custodian and arrival time.',
    '## Dispatch\n\nIf the archive seal is broken, release the item.',
  ].join('\n\n');
  const table = 'Table(["Condition", "Decision"], [["Archive seal broken", "Stop and refer"]])';
  for (const [program, finish] of [
    [`root = Col([Markdown(_xroga_answer), ${table}])`, 'stop'],
    [`layout = Col([Markdown(_xroga_answer), ${table}])`, 'stop'],
    [`root = Col([Markdown(_xroga_answer), ${table}, unavailableDetails])`, 'stop'],
    [`root = Col([Markdown(_xroga_answer), ${table}, Text("`, 'length'],
  ]) {
    const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, finish,
      'Show the intake procedure with a condition table.');
    assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
    assert.match(answer.response, /Log the custodian and arrival time/);
    assert.doesNotMatch(answer.response, /## Dispatch|release the item/);
    assert.equal(answer.responseSource.text, '');
  }
});

test('schema and reference repair preserve the original request as a publication constraint', () => {
  const prose = '## Intake\n\nRecord the custodian and arrival time.';
  const table = 'Table(["Condition", "Decision"], [["Archive seal broken", "Release the item"]])';
  const programs = [
    `layout = Col([Markdown(_xroga_answer), ${table}])`,
    `root = Col([Markdown(_xroga_answer), ${table}, unavailableDetails])`,
  ];
  for (const program of programs) {
    const diagnostics: string[] = [];
    const answer = completeNativeWorkspaceAnswer(prose + NATIVE_UI_MARKER + program, 'stop', undefined,
      'If the archive seal is broken, stop.', record => {
        if (record.stage === 'accuracy' && record.editorialIssue) diagnostics.push(record.editorialIssue);
      });
    assert.deepEqual(answer.completion, { status: 'partial', reason: 'factual_review' });
    assert.equal(answer.responseSource.text, '');
    assert.ok(answer.response.endsWith(prose));
    assert.deepEqual(diagnostics, ['decision_conflict']);
  }
});

test('an indirect reverse path conflicts while a documented retry loop does not', () => {
  const names = [{ id: 'a', label: 'Verify manifest' }, { id: 'b', label: 'Record audit ID' }, { id: 'c', label: 'Dispatch' }];
  const graph = (links: unknown[]) => [{ typeName: 'Diagram', props: { nodes: names, links } }];
  const prose = 'Verify manifest before dispatch.';
  assert.equal(reviewEditorialVisuals(prose, graph([
    { from: 'c', to: 'b' }, { from: 'b', to: 'a' },
  ]))?.issue, 'prerequisite_conflict');
  assert.equal(reviewEditorialVisuals(prose, graph([
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a', label: 'retry: manifest changed' },
  ])), undefined);
});

test('closed decision-form variations preserve unrelated sections without model work', () => {
  for (const subject of ['archive seal', 'display latch', 'intake label', 'sample holder']) {
    for (const word of ['broken', 'cracked', 'torn']) {
      const owner = `If the ${subject} is damaged, defer to the supervisor.`;
      const contradictory = `When the ${subject} is ${word}, proceed with intake.`;
      const unrelated = '### Records\n\nUse the record number, not the physical label, as the receipt key.';
      const draft = [owner, contradictory, unrelated].join('\n\n');
      assert.equal(reviewEditorialProse(draft), [owner, unrelated].join('\n\n'));
      assert.equal(reviewEditorialProse([owner, unrelated].join('\n\n')), undefined);
    }
  }
});
