import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationActivityV2 } from '../../components/response-experience-v2/conversation';
import { coalesceActivity } from './activityPresentation';
import { buildActivityTimeline } from './activityTimeline';
import { CLIENT_READ, READING, isRoutineTurn, thoughtDone, thoughtFrame, thoughtStopped, workingText } from './clientSteps';
import { buildProcessingStream, groupStream } from './processingStream';
import { adaptTerminalEvent } from './terminalEventAdapter';
import type { TerminalEvent } from './terminalEvent';

function run(frames: Array<Record<string, unknown>>) {
  let seq = 0;
  const events: TerminalEvent[] = [];
  for (const frame of frames) {
    const rows = adaptTerminalEvent('progress', frame, { fromSeq: seq });
    seq = rows.at(-1)?.seq ?? seq;
    events.push(...rows);
  }
  return coalesceActivity(events);
}

test('a plain prompt shows one live Thinking line that settles into the measured time', () => {
  const live = buildProcessingStream(run([thoughtFrame('running', READING)]), true);
  assert.deepEqual(live.map(e => [e.text, e.type === 'step' ? e.state : '']), [['Thinking', 'live']]);
  const done = run([thoughtFrame('running', READING), thoughtFrame('completed', thoughtDone(9200).text)]);
  assert.deepEqual(buildProcessingStream(done, false).map(e => e.text), ['Thought for 9s']);
  assert.equal(conversationActivityV2(done).length, 1, 'it stays with the saved answer');
});

test('real work appears under the line, which is never folded into a group', () => {
  const step = (id: string, text: string) => ({ agent: 'session', status: 'step', activityId: id, activityStatus: 'completed', swarmActivity: text });
  const rows = run([thoughtFrame('running', READING), step('a', 'Searched the web'), step('b', 'Read sources')]);
  const grouped = groupStream(buildProcessingStream(rows, true));
  assert.deepEqual(grouped.map(e => e.type), ['step', 'group']);
});

test('the finished line counts only real web pages and composes nothing about the request', () => {
  const done = thoughtDone(75_000, [{ title: 'Node', url: 'https://nodejs.org/' }, { title: 'x', url: 'javascript:1' }]);
  assert.equal(done.text, 'Thought for 1m 15s · 1 source');
  assert.equal(done.sources?.length, 1);
  assert.equal(thoughtDone(200).text, 'Thought for 1s');
});

test('the mechanical reading of a request is not shown', () => {
  const rows = adaptTerminalEvent('progress', { agent: 'session', status: 'understanding_request', swarmActivity: 'Reads as "a question answered".' }, { fromSeq: 0 });
  assert.equal(rows.length, 0);
});

test('each request reads in its own words, and the finished stream drops the filler line', () => {
  assert.equal(workingText({ goalContract: { deliverables: [{ description: 'A concise four-step launch checklist.' }] } }), 'Preparing: A concise four-step launch checklist');
  assert.equal(workingText({ goalContract: { desiredOutcome: 'Python palindrome function' } }), 'Preparing: Python palindrome function');
  assert.equal(workingText({ goalContract: { desiredOutcome: 'HTML page' } }), 'Preparing: HTML page');
  assert.equal(workingText({}), 'Writing your answer');
  const rows = run([
    thoughtFrame('running', READING, {}, CLIENT_READ),
    thoughtFrame('completed', 'Read your message', {}, CLIENT_READ),
    thoughtFrame('running', 'Preparing a comparison table'),
    thoughtFrame('completed', thoughtDone(8000).text),
  ]);
  assert.deepEqual(buildProcessingStream(rows, false).map(e => e.text), ['Thought for 8s']);
  assert.equal(conversationActivityV2(rows).length, 2);
});

test('a stopped reply reports its time and one failure is counted once', () => {
  assert.equal(thoughtStopped(5200), 'Stopped after 5s');
  const failed = run([thoughtFrame('running', READING), thoughtFrame('failed', 'Could not finish the answer')]);
  const error = adaptTerminalEvent('error', { error: 'Service unavailable' }, { fromSeq: 10 });
  const rows = [...failed, ...coalesceActivity(error)];
  assert.equal(buildActivityTimeline(rows, { outcome: 'failure' }).failed, 1);
  assert.equal(buildActivityTimeline(failed, { outcome: 'failure' }).failed, 1);
});

test('an ordinary chat turn only says it is thinking and keeps no work history', () => {
  for (const contextComplexity of ['low', 'medium']) assert.equal(workingText({ goalContract: { contextComplexity, desiredOutcome: 'Explain vaccines' } }), 'Thinking');
  assert.equal(workingText({ goalContract: { contextComplexity: 'high', desiredOutcome: 'Prove the bound' } }), 'Preparing: Prove the bound');
  const plain = run([thoughtFrame('running', READING, {}, CLIENT_READ), thoughtFrame('completed', thoughtDone(900).text), thoughtFrame('completed', 'Prepared your answer', {}, 'preparing-answer')]);
  assert.equal(isRoutineTurn(plain), true);
  assert.equal(isRoutineTurn([...plain, { id: 'n1', label: 'The user is only saying hello.', note: true }]), true);
  assert.equal(isRoutineTurn([...plain, { id: 'p1', label: 'Create the repository', note: true, planStep: true }]), false);
  assert.equal(isRoutineTurn(run([thoughtFrame('running', READING), thoughtFrame('completed', 'Searched the web', {}, 'web-1')])), false);
  assert.equal(isRoutineTurn(run([thoughtFrame('completed', 'Thought for 9s', { sources: [{ title: 'A', url: 'https://a.example' }] })])), false);
  assert.equal(isRoutineTurn(run([thoughtFrame('failed', 'Could not finish the answer')])), false);
});
