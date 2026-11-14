import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitExplicitBusinessWorkflow, clarifyPendingBusinessWorkflowStep, independentReadWave } from './businessWorkflow.js';

test('splits independent cross-app actions without needing provider names', () => {
  assert.deepEqual(splitExplicitBusinessWorkflow('Send an email to Jane about Friday and schedule a meeting with Alex tomorrow'), [
    { kind: 'action', request: 'Send an email to Jane about Friday', dependsOnPrevious: false },
    { kind: 'action', request: 'schedule a meeting with Alex tomorrow', dependsOnPrevious: false },
  ]);
});

test('marks a read-to-action data dependency rather than silently sending to retrieved people', () => {
  assert.deepEqual(splitExplicitBusinessWorkflow('Find clients in my CRM and email them an introduction'), [
    { kind: 'read', request: 'Find clients in my CRM', dependsOnPrevious: false },
    { kind: 'action', request: 'email them an introduction', dependsOnPrevious: true },
  ]);
});

test('keeps three explicitly separated app tasks as three steps', () => {
  const steps = splitExplicitBusinessWorkflow('List my calendar events; send an email to Jane; create a task for Friday');
  assert.deepEqual(steps?.map((step) => step.kind), ['read', 'action', 'action']);
  assert.equal(steps?.[2]?.request, 'create a task for Friday');
});

test('keeps two explicit read-only app tasks in one checkpointed workflow', () => {
  assert.deepEqual(splitExplicitBusinessWorkflow('List my Google Sheets spreadsheets and list my Canva designs'), [
    { kind: 'read', request: 'List my Google Sheets spreadsheets', dependsOnPrevious: false },
    { kind: 'read', request: 'list my Canva designs', dependsOnPrevious: false },
  ]);
});

test('does not turn a public search, ordinary sentence, or ambiguous clause into an app workflow', () => {
  assert.equal(splitExplicitBusinessWorkflow('Search the web for flights and send me options'), null);
  assert.equal(splitExplicitBusinessWorkflow('Explain Gmail and calendar integrations'), null);
  assert.equal(splitExplicitBusinessWorkflow('Send the email and be concise'), null);
});

test('clarification changes only the pending action while preserving earlier steps', () => {
  const steps = [
    { kind: 'read' as const, request: 'Find customers', dependsOnPrevious: false },
    { kind: 'action' as const, request: 'Create a sheet for them', dependsOnPrevious: true },
    { kind: 'action' as const, request: 'Notify the team', dependsOnPrevious: false },
  ];
  const updated = clarifyPendingBusinessWorkflowStep(steps, 1, 'Use the connected Google Sheets account and title Weekly Review');
  assert.deepEqual(updated[0], steps[0]);
  assert.deepEqual(updated[2], steps[2]);
  assert.match(updated[1]!.request, /User clarification: Use the connected Google Sheets/);
  assert.equal(steps[1]!.request, 'Create a sheet for them');
  assert.throws(() => clarifyPendingBusinessWorkflowStep(steps, 0, 'some details'), /No pending action/);
  assert.throws(() => clarifyPendingBusinessWorkflowStep(steps, 1, 'bad' + String.fromCharCode(10) + 'newline'), /Invalid action clarification|too long/);
});

test('plans bounded read concurrency, while never parallelizing writes or dependent reads', () => {
  const steps = [
    { kind: 'read' as const, request: 'List Gmail messages', dependsOnPrevious: false },
    { kind: 'read' as const, request: 'List Calendar events', dependsOnPrevious: false },
    { kind: 'read' as const, request: 'List CRM contacts', dependsOnPrevious: false },
    { kind: 'read' as const, request: 'Read connected files', dependsOnPrevious: false },
    { kind: 'action' as const, request: 'Create report', dependsOnPrevious: true },
    { kind: 'read' as const, request: 'Read the new report', dependsOnPrevious: true },
  ];
  assert.deepEqual(independentReadWave(steps, 0), [0, 1, 2]);
  assert.deepEqual(independentReadWave(steps, 1), [1, 2, 3]);
  assert.deepEqual(independentReadWave(steps, 4), []);
  assert.deepEqual(independentReadWave(steps, 5), []);
  assert.deepEqual(independentReadWave(steps, 0, 1), [0]);
  assert.deepEqual(independentReadWave(steps, -1), []);
});

test('splits up to eight explicit steps but rejects unbounded workflow clauses', () => {
  const commands = Array.from({length: 8}, (_, i) => `List item ${i + 1} from my CRM`).join('; ');
  assert.equal(splitExplicitBusinessWorkflow(commands)?.length, 8);
  assert.equal(splitExplicitBusinessWorkflow(commands + '; List a ninth item from CRM'), null);
});
