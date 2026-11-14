import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitExplicitBusinessWorkflow, clarifyPendingBusinessWorkflowStep } from './businessWorkflow.js';

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
  assert.throws(() => clarifyPendingBusinessWorkflowStep(steps, 1, 'bad\\nnewline'), /Invalid action clarification|too long/);
});
