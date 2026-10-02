import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adaptTerminalEvent } from './terminal/terminalEventAdapter';
import { isXrogaCanonicalEvent, parseXrogaCanonicalEvent } from './xrogaEvent';

test('existing swarm SSE is normalized into a versioned canonical event', () => {
  const [event] = adaptTerminalEvent('progress', {
    runId: 'run-7',
    sequence: 12,
    agent: 'reviewer',
    swarmActivity: 'Running tests',
  }, { fromSeq: 0, now: Date.parse('2026-10-02T10:00:00.000Z') });

  assert.ok(event.canonical);
  assert.equal(event.canonical.type, 'activity.updated');
  assert.equal(event.canonical.runId, 'run-7');
  assert.equal(event.canonical.sequence, 12);
  assert.equal(event.canonical.source, 'swarm-sse');
  assert.ok(isXrogaCanonicalEvent(event.canonical));
});

test('Agent V2 file events retain stable identity and evidence in canonical form', () => {
  const [event] = adaptTerminalEvent('progress', {
    softwareAgentV2: true,
    softwareEvent: {
      id: 'agent-event-4',
      runId: 'run-agent',
      sequence: 4,
      createdAt: '2026-10-02T10:00:00.000Z',
      type: 'file.renamed',
      status: 'success',
      title: 'Renamed src/a.ts to src/b.ts',
      evidence: { filePath: 'src/b.ts', diffId: 'diff-4', projectId: 'project-3' },
    },
  }, { fromSeq: 0, now: 1 });

  assert.equal(event.canonical?.eventId, 'agent-event-4');
  assert.equal(event.canonical?.type, 'file.renamed');
  assert.equal(event.canonical?.projectId, 'project-3');
  assert.deepEqual(event.canonical?.evidenceRefs, ['diff-4']);
});

test('connection gates become connection.required events', () => {
  const [event] = adaptTerminalEvent('progress', { runId: 'r', sequence: 8, needsGitHub: true }, { fromSeq: 0, now: 1 });
  assert.equal(event.canonical?.type, 'connection.required');
  assert.equal(event.kind, 'permission');
});

test('invalid restored canonical events are rejected safely', () => {
  assert.equal(parseXrogaCanonicalEvent({ schemaVersion: 1, type: 'unknown' }), null);
  assert.equal(parseXrogaCanonicalEvent(null), null);
});

test('canonical event metadata never contains provider reasoning payloads', () => {
  const [event] = adaptTerminalEvent('progress', {
    runId: 'r', sequence: 1, message: 'Inspecting files', reasoning_content: 'private scratchpad',
  }, { fromSeq: 0, now: 1 });
  assert.equal(JSON.stringify(event.canonical).includes('private scratchpad'), false);
  assert.equal(JSON.stringify(event.canonical).includes('reasoning_content'), false);
});
