import test from 'node:test';
import assert from 'node:assert/strict';
import type { XrogaActivityKind, XrogaActivityPresentation, XrogaActivityStatus } from './activityPresentation';
import { coalesceActivity } from './activityPresentation';
import { buildActivityTimeline } from './activityTimeline';
import { buildProcessingView, checklistFromTodos } from './processingView';
import type { TerminalEvent } from './terminalEvent';

let n = 0;
const row = (kind: XrogaActivityKind, label: string, status: XrogaActivityStatus = 'active', extra: Partial<XrogaActivityPresentation> = {}): XrogaActivityPresentation =>
  ({ id: `p${++n}`, kind, label, status, startedAt: 1000 + n, updatedAt: 1000 + n, ...extra });

test('heading and paragraph come from the real active row and count only finished steps', () => {
  const rows = [row('read-file', 'Read the project', 'complete'), row('search', 'Searching the web', 'active', { detail: 'xroga pricing' })];
  const view = buildProcessingView({ active: rows[1], rows });
  assert.equal(view.heading, 'Searching the web');
  assert.equal(view.paragraph, 'Searching the web: xroga pricing. 1 step finished so far.');
  assert.equal(view.family, 'research');
  assert.equal(view.tone, 'brand');
  assert.ok(!/%/.test(view.paragraph), 'no percentages');
});

test('before any event there is no invented progress, only the pending label', () => {
  const view = buildProcessingView({ active: null, rows: [], pendingLabel: 'Waiting for a reply' });
  assert.equal(view.heading, 'Getting started');
  assert.equal(view.paragraph, 'Waiting for a reply.');
  assert.equal(view.checklist, null);
  assert.equal(view.finishedSteps, 0);
});

test('tone follows function: model work purple, approval amber, error red', () => {
  assert.equal(buildProcessingView({ active: row('understand', 'Reading your request'), rows: [] }).tone, 'model');
  assert.equal(buildProcessingView({ active: row('approval', 'Waiting for your approval', 'waiting'), rows: [] }).tone, 'warning');
  assert.equal(buildProcessingView({ active: row('error', 'Could not complete this step', 'error'), rows: [] }).tone, 'error');
});

test('parallel work and failures are reported truthfully', () => {
  const rows = [row('command', 'Ran build', 'error'), row('test', 'Ran checks', 'complete'), row('code', 'Editing components')];
  const view = buildProcessingView({ active: rows[2], otherActive: 2, rows });
  assert.match(view.paragraph, /2 more steps are running alongside\./);
  assert.match(view.paragraph, /1 step finished, 1 step failed so far\./);
  assert.equal(view.failedSteps, 1);
});

test('secrets and internal markers never reach the surface text', () => {
  const view = buildProcessingView({
    active: row('command', 'Running with token sk-ant-abcdefghijklmnopqrstuvwxyz123456', 'active', { detail: 'business.read selectedModel' }),
    rows: [],
  });
  assert.ok(!/sk-ant-/.test(view.paragraph));
  assert.ok(!/business\.read|selectedModel/.test(view.paragraph));
});

test('checklist is shown only for three or more backend steps and never promotes status', () => {
  assert.equal(checklistFromTodos([{ id: 'a', label: 'A', status: 'done' }, { id: 'b', label: 'B', status: 'active' }]), null);
  const items = checklistFromTodos([
    { id: 'a', label: '[Phase 1] Plan', status: 'done' },
    { id: 'b', label: 'Build', status: 'active' },
    { id: 'c', label: 'Verify', status: 'pending' },
    { id: 'd', label: 'Ship', status: 'skipped' },
  ]);
  assert.deepEqual(items?.map(item => item.status), ['done', 'active', 'pending', 'skipped']);
  assert.equal(items?.[0].label, 'Plan');
});

test('a failed or interrupted run does not leave its step looking active or done', () => {
  const todos = [
    { id: 'a', label: 'A', status: 'done' as const },
    { id: 'b', label: 'B', status: 'active' as const },
    { id: 'c', label: 'C', status: 'pending' as const },
  ];
  assert.equal(checklistFromTodos(todos, 'failure')?.[1].status, 'failed');
  assert.equal(checklistFromTodos(todos, 'interrupted')?.[1].status, 'pending');
});

test('provider independence: swarm SSE and Agent V2 canonical events drive the same view; no reasoning needed', () => {
  const mk = (seq: number, source: 'swarm-sse' | 'software-agent-v2', type: string, text: string, status: 'running' | 'completed'): TerminalEvent => ({
    seq, kind: 'status', level: 'info', source: null, text, body: null, at: 5000 + seq, rawEvent: 'progress',
    canonical: {
      schemaVersion: 1, eventId: `e${seq}`, sequence: seq, timestamp: new Date(5000 + seq).toISOString(),
      type: type as never, status, title: text, source, metadata: {},
    },
  });
  const events = [
    mk(1, 'swarm-sse', 'activity.started', 'Searching the web', 'running'),
    mk(2, 'swarm-sse', 'activity.updated', 'Searching the web', 'running'),
    mk(3, 'software-agent-v2', 'file.read', 'Reading project files', 'completed'),
    mk(4, 'software-agent-v2', 'tool.started', 'Running npm test', 'running'),
  ];
  const rows = coalesceActivity(events);
  const timeline = buildActivityTimeline(rows, { runActive: true });
  const view = buildProcessingView({ active: timeline.active, otherActive: timeline.otherActive, rows });
  assert.ok(timeline.active);
  assert.equal(typeof view.heading, 'string');
  assert.ok(view.paragraph.length > 0);
  // duplicates (same eventId) collapse, so finished count is real.
  const replay = coalesceActivity([...events, ...events]);
  assert.equal(replay.length, rows.length);
});

test('a settled run produces no live view (handoff to the folded history)', () => {
  const rows = [row('search', 'Searched the web', 'complete')];
  const timeline = buildActivityTimeline(rows, { runActive: false, outcome: 'success' });
  assert.equal(timeline.active, null);
  assert.equal(timeline.state, 'done');
});
