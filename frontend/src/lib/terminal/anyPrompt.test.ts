import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { coalesceActivity } from './activityPresentation';
import { buildActivityTimeline } from './activityTimeline';
import { thoughtFrame, CLIENT_READ } from './clientSteps';
import { buildProcessingStream } from './processingStream';
import { adaptTerminalEvent } from './terminalEventAdapter';
import type { TerminalEvent } from './terminalEvent';

const nodeRequire = createRequire(__filename);
nodeRequire.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
const { ActivityTimeline } = nodeRequire('../../components/activity/ActivityTimeline.tsx') as typeof import('@/components/activity/ActivityTimeline');

type Frame = Record<string, unknown>;
const step = (id: string, activityStatus: string, message: string): Frame => ({ agent: 'session', status: 'step', activityId: id, activityStatus, message, swarmActivity: message });
const note = (message: string, planStage?: 'search' | 'answer'): Frame => ({ agent: 'session', status: 'reasoning_summary', message, swarmActivity: message, ...(planStage ? { planStep: true, planStage } : {}) });
const reading = thoughtFrame('running', 'Reading your message', {}, CLIENT_READ);
const preparing = step('preparing-answer', 'running', 'Preparing your answer');

/** What each kind of prompt really streams. Wording is arbitrary on purpose: nothing may depend on it. */
const PROMPTS: Record<string, Frame[]> = {
  greeting: [reading],
  'guest chat': [reading, thoughtFrame('running', 'Writing your answer')],
  'plain question': [preparing, step('step-w', 'running', 'Writing the answer')],
  'web research': [preparing, step('step-s', 'completed', 'Searched the web: 4 sources'), note('Find it', 'search'), note('Compare', 'answer'), step('step-w', 'running', 'Writing the answer from 4 sources')],
  'attached files': [preparing, step('attached-files', 'completed', 'Received 2 attached files: a.pdf, b.csv'), step('step-w', 'running', 'Working through your files and writing the answer')],
  repository: [preparing, step('step-r', 'running', 'Reading the repository acme/site')],
  'connected app': [preparing, step('step-a', 'running', 'Reading connected app Gmail: fetch emails')],
  'right to left': [preparing, note('پہلا مرحلہ', 'answer'), note('דוגמה', 'answer'), step('step-w', 'running', 'جواب لکھا جا رہا ہے')],
  'very long text': [preparing, note('x'.repeat(2000)), step('step-w', 'running', 'y'.repeat(600))],
  'markup in text': [preparing, note('<img src=x onerror=alert(1)>'), step('step-w', 'running', '</button><script>1</script>')],
  'long plan': [preparing, ...Array.from({ length: 12 }, (_, i) => note(`Step ${i}`, 'answer'))],
};

const events = (frames: Frame[]) => {
  const out: TerminalEvent[] = [];
  for (const frame of frames) out.push(...adaptTerminalEvent('progress', frame, { fromSeq: out.at(-1)?.seq ?? 0 }));
  return out;
};

const render = (frames: Frame[]) => {
  const rows = coalesceActivity(events(frames));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try {
    return renderToStaticMarkup(createElement(ActivityTimeline, {
      model: buildActivityTimeline(rows, { runActive: true, outcome: null }), now: 9000, runStartedAt: 1000, stream: buildProcessingStream(rows, true),
    }));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'React', previous);
    else Reflect.deleteProperty(globalThis, 'React');
  }
};

for (const [name, frames] of Object.entries(PROMPTS)) {
  test(`${name}: one working line, a plan only when one was written, nothing unsafe`, () => {
    const html = render(frames);
    assert.equal(html.match(/data-testid="live-line"/g)?.length, 1);
    const planned = frames.some(frame => frame.planStep);
    assert.equal(/class="planCard"/.test(html), planned);
    assert.doesNotMatch(html, /<script|<img/);
    assert.doesNotMatch(html, /undefined|\[object/);
    const line = /class="liveText" dir="auto" title="([^"]*)"/.exec(html)![1]!;
    assert.ok(line.trim(), 'the working line always says something');
  });
}

test('a long running stage spins one step only and every text follows its own direction', () => {
  const html = render(PROMPTS['long plan']!.concat(step('step-w', 'running', 'Writing the answer')));
  assert.equal(html.match(/data-leading="true"/g)?.length, 1);
  assert.equal(html.match(/data-status="active"/g)?.length, 12);
  assert.ok(html.match(/class="planText" dir="auto"/g)!.length === 12);
});

test('a later update replaces the running line instead of adding another', () => {
  const rows = coalesceActivity(events([preparing, step('step-w', 'running', 'Writing the answer'), step('step-w', 'running', 'Still writing the answer')]));
  const lines = buildProcessingStream(rows, true).map(entry => entry.text);
  assert.ok(lines.includes('Still writing the answer'));
  assert.ok(!lines.includes('Writing the answer'));
});
