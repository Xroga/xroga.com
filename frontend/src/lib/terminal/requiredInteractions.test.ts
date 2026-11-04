import assert from 'node:assert/strict';
import test from 'node:test';
import type { TerminalEvent } from './terminalEvent';
import { isConfirmationId, openInteractions, requiredInteractionsFromEvents } from './requiredInteractions';

const ID_A = '3f2b6c9e-8a41-4d7b-9c3e-1a2b3c4d5e6f';
const ID_B = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
let n = 0;
const ev = (type: string, id: unknown, extra: Record<string, string | number | boolean | null> = {}, status = 'waiting', at = 1000 + ++n): TerminalEvent => ({
  seq: n, kind: 'status', level: 'info', source: null, text: 'ignored free text', body: null, at, rawEvent: 'test',
  canonical: { schemaVersion: 1, eventId: `e${n}`, sequence: n, timestamp: new Date(at).toISOString(), type: type as never, status: status as never,
    title: 'Send the email to everyone', runId: 'run-1', activityId: 'step-2', metadata: { confirmationId: id as string, ...extra }, source: 'client' },
} as TerminalEvent);

test('only a UUID confirmation id is trusted; free text and malformed ids create nothing', () => {
  assert.equal(isConfirmationId(ID_A), true);
  for (const bad of ['', 'abc', ID_A + 'x', `../${ID_A}`, 42, null, undefined]) assert.equal(isConfirmationId(bad), false);
  const list = requiredInteractionsFromEvents([ev('approval.requested', 'not-a-uuid'), ev('approval.requested', null)]);
  assert.deepEqual(list, []);
});

test('a requested approval is open and carries only ids, never event text', () => {
  const list = requiredInteractionsFromEvents([ev('approval.requested', ID_A)]);
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ['confirmationId', 'runId', 'status', 'stepId', 'updatedAt']);
  assert.equal(list[0].status, 'requested');
  assert.deepEqual(openInteractions(list).map(i => i.confirmationId), [ID_A]);
});

test('approve, decline, expire and cancel each close the interaction', () => {
  const cases: Array<[Parameters<typeof ev>, string]> = [
    [['approval.resolved', ID_A, { outcome: 'approved' }, 'completed'], 'approved'],
    [['approval.resolved', ID_A, { outcome: 'declined' }, 'failed'], 'declined'],
    [['approval.resolved', ID_A, { outcome: 'expired' }, 'failed'], 'expired'],
    [['approval.cancelled', ID_A, {}, 'cancelled'], 'cancelled'],
  ];
  for (const [args, expected] of cases) {
    const list = requiredInteractionsFromEvents([ev('approval.requested', ID_A, {}, 'waiting', 100), ev(...args, 200)]);
    assert.equal(list[0].status, expected);
    assert.equal(openInteractions(list).length, 0);
  }
});

test('replayed or duplicated events collapse, and a replayed request never reopens a resolved one', () => {
  const events = [ev('approval.requested', ID_A, {}, 'waiting', 100), ev('approval.requested', ID_A, {}, 'waiting', 101),
    ev('approval.resolved', ID_A, { outcome: 'declined' }, 'failed', 200), ev('approval.requested', ID_A, {}, 'waiting', 150)];
  const list = requiredInteractionsFromEvents(events);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'declined');
  assert.equal(openInteractions(list).length, 0);
});

test('two confirmations in one turn stay independent and keep their order', () => {
  const list = requiredInteractionsFromEvents([ev('approval.requested', ID_A), ev('approval.requested', ID_B), ev('approval.resolved', ID_A, { outcome: 'approved' }, 'completed')]);
  assert.deepEqual(list.map(i => [i.confirmationId, i.status]), [[ID_A, 'approved'], [ID_B, 'requested']]);
  assert.deepEqual(openInteractions(list).map(i => i.confirmationId), [ID_B]);
});

test('events without a canonical payload or with other types are ignored', () => {
  const plain = { seq: 1, kind: 'status', level: 'info', source: null, text: 'x', body: null, at: 1, rawEvent: 'x' } as TerminalEvent;
  assert.deepEqual(requiredInteractionsFromEvents([plain, ev('tool.started', ID_A)]), []);
});

import { readFileSync } from 'node:fs';
const source = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('the V2 turn shows open approvals through the existing server-backed confirmation review, in the controls slot', () => {
  const log = source('../../components/terminal/SwarmMessageLog.tsx');
  assert.match(log, /RequiredInteractionCards/);
  assert.match(log, /openInteractionsForTurn\(terminalRun\.events, msg\.content\)/);
  assert.match(log, /controls=\{/);
  assert.match(log, /<RequiredInteractionCards interactions=\{openInteractionsForTurn\(terminalRun\.events, msg\.content\)\}/);
  const card = source('../../components/terminal/RequiredInteractionCards.tsx');
  assert.match(card, /BusinessActionConfirmationInline confirmationId=\{item\.confirmationId\}/);
  assert.match(card, /aria-label="Needs your decision"/);
  assert.doesNotMatch(card, /fetch\(|apiFetch|confirm\(/, 'the card never decides or calls the server itself');
});

import { adaptTerminalEvent } from './terminalEventAdapter';
import { confirmationIdFromPayload } from '../xrogaEventAdapter';

const REVIEW = (id: string) => `Review the exact Supabase setup: [Review action](/dashboard/actions/confirm/${id}). Schema and storage changes require confirmation.`;

test('a pipeline confirmation_required progress event becomes a canonical approval.requested with only the id', () => {
  const rows = adaptTerminalEvent('progress', { agent: 'deploy', status: 'confirmation_required', message: REVIEW(ID_A) } as never, { fromSeq: 0, now: 5000 } as never);
  const approval = rows.find(row => row.canonical?.type === 'approval.requested');
  assert.ok(approval, 'approval event emitted');
  assert.equal(approval!.canonical!.status, 'waiting');
  assert.equal(approval!.canonical!.metadata?.confirmationId, ID_A);
  const list = requiredInteractionsFromEvents(rows);
  assert.deepEqual(openInteractions(list).map(i => i.confirmationId), [ID_A]);
});

test('anything that is not exactly one well-formed confirmation link stays an ordinary update', () => {
  const none = { status: 'confirmation_required', message: 'Review the request, no link here' };
  const two = { status: 'confirmation_required', message: `${REVIEW(ID_A)} ${REVIEW(ID_B)}` };
  const forged = { status: 'confirmation_required', message: '[x](/dashboard/actions/confirm/not-a-uuid) and https://evil.example/dashboard/actions/confirm/' + 'zz' };
  const wrongStatus = { status: 'running', message: REVIEW(ID_A) };
  for (const payload of [none, two, forged, wrongStatus]) assert.equal(confirmationIdFromPayload(payload), null);
  const rows = adaptTerminalEvent('progress', { agent: 'deploy', ...two } as never, { fromSeq: 0, now: 5000 } as never);
  assert.equal(requiredInteractionsFromEvents(rows).length, 0);
});

import { openInteractionsForTurn } from './requiredInteractions';

test('an approval already shown inline in the answer is not rendered a second time', () => {
  const events = [ev('approval.requested', ID_A), ev('approval.requested', ID_B)];
  const shown = openInteractionsForTurn(events, `Review: [Review action](/dashboard/actions/confirm/${ID_A.toUpperCase()})`);
  assert.deepEqual(shown.map(i => i.confirmationId), [ID_B]);
  assert.equal(openInteractionsForTurn(events, 'No link here').length, 2);
});
