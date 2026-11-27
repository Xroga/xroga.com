import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XrogaActivityPresentation } from './activityPresentation';
import { buildProcessingStream, groupStream, pastTense, splitLiveStep } from './processingStream';
import { adaptTerminalEvent } from './terminalEventAdapter';
import { coalesceActivity } from './activityPresentation';

const row = (id: string, label: string, status: XrogaActivityPresentation['status'], note?: boolean): XrogaActivityPresentation =>
  ({ id, kind: note ? 'understand' : 'search', label, status, startedAt: 1, updatedAt: 1, note });

test('past tense only changes a known leading verb', () => {
  assert.equal(pastTense('Searching the web'), 'Searched the web');
  assert.equal(pastTense('Running checks'), 'Ran checks');
  assert.equal(pastTense('Billing review'), 'Billing review');
});

test('one live line, past tense only when completed, notes as written updates', () => {
  const rows = [
    row('n', 'Compare both release lines first.', 'complete', true),
    row('a', 'Searching the web', 'complete'),
    row('b', 'Routing the request', 'active'),
    row('c', 'Reading sources', 'active'),
    row('d', 'Running checks', 'error'),
  ];
  const stream = buildProcessingStream(rows, true);
  assert.deepEqual(stream.map(e => [e.type, e.text, e.type === 'step' ? e.state : '']), [
    ['note', 'Compare both release lines first.', ''],
    ['step', 'Searched the web', 'done'],
    ['step', 'Routing the request', 'reported'],
    ['step', 'Reading sources', 'live'],
    ['step', 'Running checks', 'failed'],
  ]);
  assert.equal(buildProcessingStream(rows, false).some(e => e.type === 'step' && e.state === 'live'), false);
});

test('backend step frames start live and settle into one finished line', () => {
  const frame = (activityStatus: string, text: string) => ({ agent: 'session', status: 'step', activityId: 'step-1', activityStatus, message: text, swarmActivity: text });
  const first = adaptTerminalEvent('progress', frame('running', 'Searching the web'), { fromSeq: 0 });
  const second = adaptTerminalEvent('progress', frame('completed', 'Searched the web: 4 sources from nodejs.org'), { fromSeq: first.at(-1)!.seq });
  assert.equal(buildProcessingStream(coalesceActivity(first), true)[0]?.type === 'step' && (buildProcessingStream(coalesceActivity(first), true)[0] as { state: string }).state, 'live');
  const settled = buildProcessingStream(coalesceActivity([...first, ...second]), true);
  assert.equal(settled.length, 1);
  assert.equal(settled[0]!.text, 'Searched the web: 4 sources from nodejs.org');
});

test('the whole-answer step gives way to real steps and every written note stays', () => {
  const wrapper = row(':preparing-answer', 'Preparing your answer', 'active');
  const first = row('n1', 'The request compares two releases.', 'complete', true);
  assert.deepEqual(buildProcessingStream([wrapper, first], true).map(e => e.text), ['Preparing your answer', 'The request compares two releases.']);
  const more = [wrapper, first, row('n2', 'Stability matters more than novelty here.', 'complete', true), row('a', 'Searching the web', 'active')];
  assert.deepEqual(buildProcessingStream(more, true).map(e => e.text), ['The request compares two releases.', 'Stability matters more than novelty here.', 'Searching the web']);
});

test('finished steps fold into one summary; the live line stays out; evidence is only what the row holds', () => {
  const rows: XrogaActivityPresentation[] = [
    { ...row('a', 'Searching the web', 'complete'), sources: [{ title: 'Node.js', url: 'https://nodejs.org/' }] },
    { ...row('b', 'Running a command', 'complete'), kind: 'command', detail: 'npm test', body: '12 passing', exitCode: 0 },
    row('c', 'Reading sources', 'complete'),
    row('d', 'Searching the web', 'active'),
  ];
  const grouped = groupStream(buildProcessingStream(rows, true));
  assert.equal(grouped.length, 2);
  const group = grouped[0]!;
  assert.equal(group.type, 'group');
  if (group.type !== 'group') return;
  assert.equal(group.text, 'Searched the web, ran a command');
  assert.equal(group.steps.length, 3);
  assert.equal(group.steps[1]!.text, 'Ran npm test');
  assert.equal(group.steps[1]!.evidence?.command, 'npm test');
  assert.equal(group.steps[1]!.evidence?.output, '12 passing');
  assert.equal(group.steps[0]!.evidence?.sources?.[0]?.url, 'https://nodejs.org/');
  assert.equal(group.steps[2]!.evidence, undefined);
  assert.equal(grouped[1]!.type, 'step');
});

test('step sources keep only web addresses', () => {
  const frame = { agent: 'session', status: 'step', activityId: 's', activityStatus: 'completed', swarmActivity: 'Searched the web',
    sources: [{ title: 'ok', url: 'https://example.com/a' }, { title: 'bad', url: 'javascript:alert(1)' }] };
  const rows = coalesceActivity(adaptTerminalEvent('progress', frame, { fromSeq: 0 }));
  assert.deepEqual(rows[0]?.sources, [{ title: 'ok', url: 'https://example.com/a' }]);
});

test('plan steps are numbered in the order written and never carry a progress state', () => {
  const plan = (id: string, label: string) => ({ ...row(id, label, 'complete', true), planStep: true });
  const stream = buildProcessingStream([plan('a', 'Look up both releases.'), row('n', 'A note.', 'complete', true), plan('b', 'Recommend one.')], true);
  assert.deepEqual(stream.map(e => e.type === 'note' ? e.planNumber : null), [1, undefined, 2]);
});

test('consecutive plan steps form one plan card and notes stay prose', () => {
  const plan = (id: string, label: string) => ({ ...row(id, label, 'complete', true), planStep: true });
  const blocks = groupStream(buildProcessingStream([plan('a', 'First.'), plan('b', 'Second.'), row('n', 'A note.', 'complete', true)], true));
  assert.deepEqual(blocks.map(b => b.type), ['plan', 'note']);
  assert.deepEqual(blocks[0]!.type === 'plan' && blocks[0]!.steps.map(s => [s.planNumber, s.text]), [[1, 'First.'], [2, 'Second.']]);
});

test('the running step moves to the live line unless it has something to open', () => {
  const plain = splitLiveStep(buildProcessingStream([row('a', 'Searching the web', 'complete'), row('b', 'جواب لکھا جا رہا ہے', 'active')], true));
  assert.equal(plain.live?.text, 'جواب لکھا جا رہا ہے');
  assert.deepEqual(plain.entries.map(e => e.text), ['Searched the web']);
  const command = buildProcessingStream([{ ...row('c', 'Running a command', 'active'), kind: 'command', detail: 'npm test', body: '1 passing' }], true);
  const kept = splitLiveStep(command);
  assert.equal(kept.entries.length, 1);
  assert.equal(kept.live?.text, 'Running npm test');
  assert.equal(splitLiveStep([]).live, undefined);
});
