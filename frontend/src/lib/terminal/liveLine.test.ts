import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { XrogaActivityPresentation } from './activityPresentation';
import { buildActivityTimeline } from './activityTimeline';
import { buildProcessingStream } from './processingStream';

const nodeRequire = createRequire(__filename);
nodeRequire.extensions['.css'] = module => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
const { ActivityTimeline } = nodeRequire('../../components/activity/ActivityTimeline.tsx') as typeof import('@/components/activity/ActivityTimeline');

const row = (id: string, label: string, status: XrogaActivityPresentation['status'], extra: Partial<XrogaActivityPresentation> = {}): XrogaActivityPresentation =>
  ({ id, kind: 'search', label, status, startedAt: 1, updatedAt: 1, ...extra });

const render = (rows: XrogaActivityPresentation[]) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  try {
    return renderToStaticMarkup(createElement(ActivityTimeline, {
      model: buildActivityTimeline(rows, { runActive: true, outcome: null }), now: 5000, runStartedAt: 1000,
      stream: buildProcessingStream(rows, true),
    }));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'React', previous);
    else Reflect.deleteProperty(globalThis, 'React');
  }
};

test('the working line sits under the work, unboxed, and names the running step', () => {
  const html = render([
    row('n', 'Version numbers must come from the search.', 'complete', { kind: 'understand', note: true }),
    row('a', 'Comparing both runtimes', 'active'),
  ]);
  assert.doesNotMatch(html, /workingPanel/);
  assert.ok(html.indexOf('data-testid="processing-stream"') < html.indexOf('data-testid="live-line"'));
  assert.equal(html.match(/>Comparing both runtimes</g)!.length, 2, 'once on screen and once for screen readers');
  assert.match(html, /Black Hole is working/);
  assert.match(html, /data-black-hole="" data-family="research"/);
});

test('a written note is never repeated as the working line', () => {
  const html = render([row('n', 'Weigh the support window first.', 'complete', { kind: 'understand', note: true })]);
  assert.match(html, /data-testid="live-line"[\s\S]*Thinking/);
});
