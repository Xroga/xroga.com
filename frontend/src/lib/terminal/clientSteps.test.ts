import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationActivityV2 } from '../../components/response-experience-v2/conversation';
import { coalesceActivity } from './activityPresentation';
import { CLIENT_ANSWER, CLIENT_UNDERSTAND, answeredStep, clientStepFrame, understandingDetail } from './clientSteps';
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

test('a plain question shows understanding and answering, openable, never folded away', () => {
  const rows = run([
    clientStepFrame(CLIENT_UNDERSTAND, 'running', 'Understanding your request'),
    clientStepFrame(CLIENT_UNDERSTAND, 'completed', 'Understood your request', { detail: 'Goal: explain why the sky is blue' }),
    clientStepFrame(CLIENT_ANSWER, 'running', 'Writing the answer'),
  ]);
  const live = buildProcessingStream(rows, true);
  assert.deepEqual(live.map(e => [e.text, e.type === 'step' ? e.state : '']), [['Understood your request', 'done'], ['Writing the answer', 'live']]);
  assert.match((live[0] as { evidence?: { notes?: string } }).evidence?.notes ?? '', /Goal: explain why the sky is blue/);
  const running = run([clientStepFrame(CLIENT_UNDERSTAND, 'running', 'Reading your request')]);
  assert.deepEqual(buildProcessingStream(running, true).map(e => e.text), ['Reading your request'], 'the first line is not filtered as filler');
  const lines = run([clientStepFrame(CLIENT_UNDERSTAND, 'completed', 'Understood your request', { detail: 'Goal: a thing\n\nWill be checked\n• one' })]);
  assert.match((buildProcessingStream(lines, false)[0] as { evidence?: { notes?: string } }).evidence?.notes ?? '', /thing\n\nWill be checked\n• one/);
  const done = run([
    clientStepFrame(CLIENT_UNDERSTAND, 'completed', 'Understood your request'),
    clientStepFrame(CLIENT_ANSWER, 'completed', 'Wrote the answer'),
  ]);
  assert.equal(groupStream(buildProcessingStream(done, false)).length, 2);
  assert.equal(conversationActivityV2(done).length, 2, 'both stay with the saved answer');
});

test('when real work steps arrive the generic answering line steps aside unless it carries sources', () => {
  const search = { agent: 'session', status: 'step', activityId: 's1', activityStatus: 'running', swarmActivity: 'Searching the web' };
  const rows = run([clientStepFrame(CLIENT_UNDERSTAND, 'completed', 'Understood your request'), clientStepFrame(CLIENT_ANSWER, 'running', 'Writing the answer'), search]);
  assert.deepEqual(buildProcessingStream(rows, true).map(e => e.text), ['Understood your request', 'Searching the web']);
  const answered = answeredStep([{ title: 'Node', url: 'https://nodejs.org/' }, { title: 'x', url: 'javascript:1' }]);
  assert.equal(answered.text, 'Wrote the answer using 1 source');
  const withSources = run([{ ...search, activityStatus: 'completed' }, clientStepFrame(CLIENT_ANSWER, 'completed', answered.text, { sources: answered.sources })]);
  assert.ok(buildProcessingStream(withSources, false).some(e => e.text === answered.text));
});

test('the understanding detail lists the plan in plain words and hides the generic capability', () => {
  const text = understandingDetail({ goalContract: { desiredOutcome: 'A comparison', acceptance: ['Both versions named'], requiredCapabilities: ['conversation.respond', 'research.public-web'], freshnessRequirement: 'CURRENT_REQUIRED' } });
  assert.match(text, /Goal: A comparison/);
  assert.match(text, /• Both versions named/);
  assert.match(text, /• research public web/);
  assert.doesNotMatch(text, /conversation respond/);
  assert.equal(understandingDetail({}), '');
});
