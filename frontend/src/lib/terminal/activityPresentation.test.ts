import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coalesceActivity, hasInternalPresentationLeak, presentTerminalEvent, publicActivityText } from './activityPresentation';
import type { TerminalEvent } from './terminalEvent';

function event(seq: number, text: string, type = 'activity.updated', activityId?: string): TerminalEvent {
  return {
    seq,
    kind: 'status',
    level: 'info',
    source: 'builder',
    text,
    body: null,
    at: seq,
    rawEvent: 'progress',
    canonical: {
      schemaVersion: 1,
      eventId: `event-${seq}`,
      activityId,
      sequence: seq,
      timestamp: new Date(seq).toISOString(),
      type: type as NonNullable<TerminalEvent['canonical']>['type'],
      status: 'running',
      title: text,
      source: 'swarm-sse',
    },
  };
}

test('web, connected app, and build events share one public semantic grammar', () => {
  assert.equal(presentTerminalEvent(event(1, 'Searching the web')).kind, 'search');
  assert.equal(presentTerminalEvent(event(2, 'Searching Slack messages')).kind, 'connected-app-read');
  assert.equal(presentTerminalEvent(event(3, 'Updating project files', 'file.updated')).kind, 'write-file');
});

test('presentation boundary removes internal capability and runtime markers', () => {
  const unsafe = 'builder: business.read via runtimeSessionId';
  assert.equal(hasInternalPresentationLeak(unsafe), true);
  const safe = publicActivityText(unsafe);
  assert.equal(hasInternalPresentationLeak(safe), false);
  assert.doesNotMatch(safe, /builder:/i);
});

test('activity updates coalesce by stable activity identity', () => {
  const rows = coalesceActivity([
    event(1, 'Searching the web', 'activity.started', 'research-1'),
    event(2, 'Reading sources', 'activity.updated', 'research-1'),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.label, 'Reading sources');
});
