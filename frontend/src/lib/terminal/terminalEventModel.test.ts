import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMPTY_RUN_STATE, type TerminalEvent } from './terminalEvent';
import { adaptTerminalEvent } from './terminalEventAdapter';
import { terminalRunReducer } from './terminalRunReducer';
import { containsSecret, redactTerminalText } from './terminalRedaction';

const CTX = { fromSeq: 0, now: 1_000 };

function adapt(event: string, payload: Record<string, unknown>, fromSeq = 0) {
  return adaptTerminalEvent(event, payload, { fromSeq, now: 1_000 });
}

/* ---------------------------------------------------------------- adapter */

test('keepalive produces no row', () => {
  // The 15s keepalive carries message:'Working…'. Rendering it made an idle
  // stream look like active work, which is the core defect being removed.
  assert.deepEqual(adapt('progress', { keepalive: true, message: 'Working…' }), []);
});

test('empty payload produces no row', () => {
  assert.deepEqual(adapt('progress', {}), []);
  assert.deepEqual(adapt('progress', { message: '   ' }), []);
});

test('done produces no row because complete already recorded the outcome', () => {
  assert.deepEqual(adapt('done', { complete: true }), []);
});

test('unknown event names are ignored rather than rendered', () => {
  assert.deepEqual(adapt('some_future_event', { message: 'hello' }), []);
});

test('swarmActivity wins over generic message', () => {
  const [row] = adapt('progress', { message: 'Working…', swarmActivity: 'Wrote src/app/page.tsx' });
  assert.equal(row.text, 'Wrote src/app/page.tsx');
});

test('falls back through message then label then status', () => {
  assert.equal(adapt('progress', { message: 'm', swarmStatusLabel: 'l' })[0].text, 'm');
  assert.equal(adapt('progress', { swarmStatusLabel: 'l', status: 's' })[0].text, 'l');
  assert.equal(adapt('progress', { status: 's' })[0].text, 's');
});

test('event names map to the documented kinds', () => {
  assert.equal(adapt('start', { message: 'x' })[0].kind, 'session');
  assert.equal(adapt('pipeline', { message: 'x' })[0].kind, 'session');
  assert.equal(adapt('progress', { message: 'x' })[0].kind, 'status');
  assert.equal(adapt('delta', { delta: 'x' })[0].kind, 'output');
  assert.equal(adapt('preview', { success: true })[0].kind, 'artifact');
  assert.equal(adapt('complete', { success: true })[0].kind, 'result');
  assert.equal(adapt('error', { error: 'x' })[0].kind, 'failure');
});

test('failed complete is an error row, not a success row', () => {
  const [row] = adapt('complete', { success: false });
  assert.equal(row.level, 'error');
  assert.equal(row.text, 'Run finished with errors');
});

test('slow_request is a warning, not a failure', () => {
  const [row] = adapt('slow_request', { message: 'Still working' });
  assert.equal(row.level, 'warn');
  assert.equal(row.kind, 'status');
});

test('error without a message still yields a row', () => {
  // A failure must never be silent; an unlabelled error is still a failure.
  const [row] = adapt('error', {});
  assert.equal(row.text, 'Run failed');
  assert.equal(row.level, 'error');
});

test('sequence numbers continue from fromSeq', () => {
  const rows = adapt('progress', { message: 'a', needsGitHub: true }, 40);
  assert.deepEqual(rows.map((r) => r.seq), [41, 42]);
});

test('agent name is carried as source when present', () => {
  assert.equal(adapt('progress', { message: 'x', agent: 'builder' })[0].source, 'builder');
  assert.equal(adapt('progress', { message: 'x' })[0].source, null);
});

test('permission flags emit rows even on a keepalive', () => {
  // A run blocked on GitHub must surface that while otherwise idle.
  const rows = adapt('progress', { keepalive: true, needsGitHub: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'permission');
  assert.equal(rows[0].text, 'GitHub authorisation required');
});

test('all three permission gates are recognised', () => {
  const rows = adapt('progress', { needsGitHub: true, needsVercel: true, needsRepoPick: true });
  assert.deepEqual(rows.map((r) => r.text), [
    'GitHub authorisation required',
    'Vercel authorisation required',
    'Repository selection required',
  ]);
});

test('rawEvent is retained so a row can be traced to its origin', () => {
  assert.equal(adapt('progress', { message: 'x' })[0].rawEvent, 'progress');
});

/* -------------------------------------------------------------- redaction */

test('adapter redacts secrets at the boundary', () => {
  const [row] = adapt('progress', { message: 'export GITHUB_TOKEN=ghp_' + 'a'.repeat(36) });
  assert.ok(!row.text.includes('ghp_'), row.text);
});

test('provider key formats are masked', () => {
  for (const secret of [
    'ghp_' + 'a'.repeat(36),
    'sk-ant-' + 'b'.repeat(40),
    'xoxb-123456789-abcdefghij',
    'AKIA' + 'C'.repeat(16),
    'AIza' + 'd'.repeat(35),
    'eyJhbGciOi.eyJzdWIiOiJ4.' + 'e'.repeat(20),
  ]) {
    assert.ok(containsSecret(secret), `not masked: ${secret}`);
  }
});

test('named assignments keep the key but mask the value', () => {
  const out = redactTerminalText('SUPABASE_SERVICE_ROLE_KEY=super-secret-value-here');
  assert.ok(out.includes('SUPABASE_SERVICE_ROLE_KEY'), out);
  assert.ok(!out.includes('super-secret-value-here'), out);
});

test('authorization headers and cookies are masked', () => {
  assert.ok(containsSecret('Authorization: Bearer abcdefghijklmnop'));
  assert.ok(containsSecret('cookie: session=abcdefghijklmnop'));
});

test('database URIs with inline credentials are masked', () => {
  const out = redactTerminalText('postgres://admin:hunter2xyz@db.internal:5432/app');
  assert.ok(!out.includes('hunter2xyz'), out);
});

test('private key blocks are masked whole', () => {
  const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----';
  assert.ok(!redactTerminalText(pem).includes('MIIEow'));
});

test('ordinary output is left untouched', () => {
  // Over-masking would hide the operations the terminal exists to show.
  for (const line of [
    'Wrote src/app/page.tsx',
    'npm run build exited 0',
    'Created branch xroga/template-saas-a1b2c3',
    '42 tests passed in 3.1s',
  ]) {
    assert.equal(redactTerminalText(line), line);
  }
});

test('redaction is idempotent', () => {
  // Two patterns can match the same substring — a provider key inside a named
  // assignment. Without guarding, the second pass re-masks the first pass's
  // output and emits `TOKEN=[redacted]]`. Caught by rendering it, not by review.
  const once = redactTerminalText('GITHUB_TOKEN=ghp_' + 'a'.repeat(36));
  assert.equal(once, 'GITHUB_TOKEN=[redacted]');
  assert.equal(redactTerminalText(once), once);
});

test('redaction is stable across repeated calls', () => {
  // The patterns carry /g, so a leaked lastIndex would make results order-dependent.
  const input = 'token=abcdefghijklmnop';
  assert.equal(redactTerminalText(input), redactTerminalText(input));
});

/* ---------------------------------------------------------------- reducer */

function row(seq: number, over: Partial<TerminalEvent> = {}): TerminalEvent {
  return {
    seq,
    kind: 'status',
    level: 'info',
    source: null,
    text: `row ${seq}`,
    body: null,
    at: 1_000,
    rawEvent: 'progress',
    ...over,
  };
}

test('run-started clears the previous run', () => {
  const prior = terminalRunReducer(EMPTY_RUN_STATE, { type: 'events', events: [row(1)] });
  const next = terminalRunReducer(prior, { type: 'run-started' });
  assert.deepEqual(next.events, []);
  assert.equal(next.active, true);
  assert.equal(next.outcome, null);
});

test('events append in order and advance lastSeq', () => {
  const state = terminalRunReducer(EMPTY_RUN_STATE, {
    type: 'events',
    events: [row(1), row(2), row(3)],
  });
  assert.deepEqual(state.events.map((e) => e.seq), [1, 2, 3]);
  assert.equal(state.lastSeq, 3);
});

test('replayed events are dropped by sequence number', () => {
  // Reconnection resumes from lastSeq and overlap is normal, not exceptional.
  let state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'events', events: [row(1), row(2)] });
  state = terminalRunReducer(state, { type: 'events', events: [row(1), row(2), row(3)] });
  assert.deepEqual(state.events.map((e) => e.seq), [1, 2, 3]);
});

test('a fully duplicate batch returns the identical state object', () => {
  // Referential stability keeps React from re-rendering the log on every replay.
  const state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'events', events: [row(1)] });
  assert.equal(terminalRunReducer(state, { type: 'events', events: [row(1)] }), state);
});

test('existing rows are never mutated', () => {
  let state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'events', events: [row(1)] });
  const first = state.events[0];
  state = terminalRunReducer(state, { type: 'events', events: [row(2)] });
  assert.equal(state.events[0], first);
  assert.equal(state.events[0].text, 'row 1');
});

test('result row ends the run as success', () => {
  const state = terminalRunReducer(
    { ...EMPTY_RUN_STATE, active: true },
    { type: 'events', events: [row(1, { kind: 'result', level: 'success' })] },
  );
  assert.equal(state.active, false);
  assert.equal(state.outcome, 'success');
});

test('failure row ends the run as failure', () => {
  const state = terminalRunReducer(
    { ...EMPTY_RUN_STATE, active: true },
    { type: 'events', events: [row(1, { kind: 'failure', level: 'error' })] },
  );
  assert.equal(state.outcome, 'failure');
});

test('a late error does not overwrite a reported success', () => {
  const state = terminalRunReducer(
    { ...EMPTY_RUN_STATE, active: true },
    {
      type: 'events',
      events: [row(1, { kind: 'result', level: 'success' }), row(2, { kind: 'failure' })],
    },
  );
  assert.equal(state.outcome, 'success');
});

test('permission rows accumulate without duplicating', () => {
  let state = terminalRunReducer(EMPTY_RUN_STATE, {
    type: 'events',
    events: [row(1, { kind: 'permission', text: 'GitHub authorisation required' })],
  });
  state = terminalRunReducer(state, {
    type: 'events',
    events: [row(2, { kind: 'permission', text: 'GitHub authorisation required' })],
  });
  assert.deepEqual(state.pendingPermissions, ['GitHub authorisation required']);
});

test('interrupted marks the run interrupted', () => {
  const state = terminalRunReducer({ ...EMPTY_RUN_STATE, active: true }, { type: 'interrupted' });
  assert.equal(state.active, false);
  assert.equal(state.outcome, 'interrupted');
});

test('a finished run cannot become interrupted', () => {
  const done = terminalRunReducer(
    { ...EMPTY_RUN_STATE, active: true },
    { type: 'events', events: [row(1, { kind: 'result', level: 'success' })] },
  );
  assert.equal(terminalRunReducer(done, { type: 'interrupted' }).outcome, 'success');
});

test('a dropped stream is interrupted, never left appearing to run', () => {
  const state = terminalRunReducer({ ...EMPTY_RUN_STATE, active: true }, { type: 'stream-closed' });
  assert.equal(state.active, false);
  assert.equal(state.outcome, 'interrupted');
});

test('stream-closed after a real outcome keeps that outcome', () => {
  const done = terminalRunReducer(
    { ...EMPTY_RUN_STATE, active: true },
    { type: 'events', events: [row(1, { kind: 'result', level: 'success' })] },
  );
  assert.equal(terminalRunReducer(done, { type: 'stream-closed' }).outcome, 'success');
});

test('reset returns the empty state', () => {
  const state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'events', events: [row(1)] });
  assert.deepEqual(terminalRunReducer(state, { type: 'reset' }), EMPTY_RUN_STATE);
});

/* ------------------------------------------------------------ integration */

test('a full stream produces only real rows and one outcome', () => {
  const stream: Array<[string, Record<string, unknown>]> = [
    ['start', { message: 'Xroga AI execution started', engine: 'xroga' }],
    ['pipeline', { message: 'Understand → Build → Review', stage: 'init' }],
    ['progress', { agent: 'builder', swarmActivity: 'Wrote src/app/page.tsx' }],
    ['progress', { keepalive: true, message: 'Working…' }],
    ['progress', { keepalive: true, message: 'Working…' }],
    ['progress', { agent: 'reviewer', swarmActivity: 'npm run build exited 0' }],
    ['preview', { success: true, shipPending: true }],
    ['complete', { runId: 'r1', success: true }],
    ['done', { complete: true }],
  ];

  let state = { ...EMPTY_RUN_STATE, active: true };
  for (const [event, payload] of stream) {
    const events = adaptTerminalEvent(event, payload, { fromSeq: state.lastSeq, now: 1_000 });
    state = terminalRunReducer(state, { type: 'events', events });
  }

  // Nine payloads in; the two keepalives and `done` yield nothing.
  assert.equal(state.events.length, 6);
  assert.equal(state.outcome, 'success');
  assert.equal(state.active, false);
  assert.ok(!state.events.some((e) => e.text === 'Working…'));
  assert.deepEqual(state.events.map((e) => e.seq), [1, 2, 3, 4, 5, 6]);
});

test('a stream that dies mid-build does not claim success', () => {
  let state = { ...EMPTY_RUN_STATE, active: true };
  state = terminalRunReducer(state, {
    type: 'events',
    events: adaptTerminalEvent('progress', { swarmActivity: 'Building' }, { fromSeq: 0, now: 1 }),
  });
  state = terminalRunReducer(state, { type: 'stream-closed' });
  assert.equal(state.outcome, 'interrupted');
});

test('reconnect mid-run resumes without duplicating rows', () => {
  let state = { ...EMPTY_RUN_STATE, active: true };
  for (const text of ['a', 'b', 'c']) {
    state = terminalRunReducer(state, {
      type: 'events',
      events: adaptTerminalEvent('progress', { message: text }, { fromSeq: state.lastSeq, now: 1 }),
    });
  }
  // Server replays from seq 2 after a drop.
  const replay = ['b', 'c', 'd'].map((text, i) => row(2 + i, { text }));
  state = terminalRunReducer(state, { type: 'events', events: replay });
  assert.deepEqual(state.events.map((e) => e.text), ['a', 'b', 'c', 'd']);
});

test('adapter context is honoured so rows are deterministic in tests', () => {
  assert.equal(adaptTerminalEvent('progress', { message: 'x' }, CTX)[0].at, 1_000);
});
