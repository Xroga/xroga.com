import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { conversationActivityV2 } from '@/components/response-experience-v2/conversation';
import { sanitizeChatMessages } from '../sanitizeChatMessages';
import { coalesceActivity, type XrogaActivityPresentation } from './activityPresentation';
import { buildProcessingStream, type StreamEntry } from './processingStream';
import { adaptTerminalEvent } from './terminalEventAdapter';

type Status = XrogaActivityPresentation['status'];
const row = (id: string, kind: XrogaActivityPresentation['kind'], status: Status, extra: Partial<XrogaActivityPresentation> = {}): XrogaActivityPresentation =>
  ({ id, kind, label: id, status, startedAt: 1, updatedAt: 1, ...extra });
const step = (id: string, planStage: 'search' | 'answer') => row(id, 'understand', 'complete', { note: true, planStep: true, planStage });
const plan = [step('look up', 'search'), step('compare', 'answer'), step('recommend', 'answer')];
const answer = (status: Status) => row(':preparing-answer', 'understand', status);
const search = (status: Status) => row('find', 'search', status);

const ticks = (rows: XrogaActivityPresentation[], running: boolean) => buildProcessingStream(rows, running)
  .filter((e): e is Extract<StreamEntry, { type: 'note' }> => e.type === 'note' && Boolean(e.plan)).map(e => e.planStatus);

test('search steps tick only when a search really finishes, the rest only when the answer arrives', () => {
  assert.deepEqual(ticks([answer('active'), search('active'), ...plan], true), ['active', 'pending', 'pending']);
  assert.deepEqual(ticks([answer('active'), search('complete'), ...plan], true), ['done', 'active', 'active']);
  assert.deepEqual(ticks([answer('complete'), search('complete'), ...plan], false), ['done', 'done', 'done']);
});

test('nothing is ticked that nothing reported', () => {
  // No search ever ran: the search step stays open even though the answer arrived.
  assert.deepEqual(ticks([answer('complete'), ...plan], false), ['pending', 'done', 'done']);
  // Stopped or interrupted runs keep unfinished steps unticked.
  assert.deepEqual(ticks([answer('interrupted'), search('complete'), ...plan], false), ['done', 'pending', 'pending']);
  assert.deepEqual(ticks([answer('active'), search('complete'), ...plan], false), ['done', 'pending', 'pending']);
  assert.deepEqual(ticks([answer('error'), search('error'), ...plan], false), ['failed', 'pending', 'pending']);
});

test('a plan saved without stages stays a numbered plan with no progress marks', () => {
  const old = plan.map(({ planStage: _stage, ...rest }) => rest);
  assert.deepEqual(ticks([answer('complete'), ...old], false), [undefined, undefined, undefined]);
});

test('the stage travels from the stream frame through save and reload', () => {
  const events = adaptTerminalEvent('progress', { agent: 'session', status: 'reasoning_summary', message: 'Look up releases', planStep: true, planStage: 'search' }, { fromSeq: 0 });
  assert.equal(coalesceActivity(events)[0]!.planStage, 'search');
  const saved = JSON.parse(JSON.stringify([{ id: 'a', role: 'assistant', content: 'x', executionActivity: [answer('complete'), search('complete'), ...plan] }]));
  const reloaded = conversationActivityV2(sanitizeChatMessages(saved)[0]!.executionActivity);
  assert.deepEqual(ticks(reloaded, false), ['done', 'done', 'done']);
});

test('the plan card shows ticks, a spinner and open circles with spoken states', () => {
  const nodeRequire = createRequire(__filename);
  nodeRequire.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
  const { ProcessingStream } = nodeRequire('../../components/activity/ProcessingStream.tsx') as typeof import('@/components/activity/ProcessingStream');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try {
    const html = renderToStaticMarkup(createElement(ProcessingStream, {
      entries: buildProcessingStream([answer('active'), search('complete'), ...plan], true), rows: { ids: new Set<string>(), toggle: () => {} },
    }));
    assert.match(html, /1 of 3 done/);
    assert.deepEqual([...html.matchAll(/data-status="(\w+)"/g)].map(m => m[1]), ['done', 'active', 'active']);
    assert.match(html, /in progress/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'React', previous);
    else Reflect.deleteProperty(globalThis, 'React');
  }
});
