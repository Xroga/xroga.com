import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitExplicitBusinessWorkflow } from './businessWorkflow.js';

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

test('does not turn a public search, ordinary sentence, or ambiguous clause into an app workflow', () => {
  assert.equal(splitExplicitBusinessWorkflow('Search the web for flights and send me options'), null);
  assert.equal(splitExplicitBusinessWorkflow('Explain Gmail and calendar integrations'), null);
  assert.equal(splitExplicitBusinessWorkflow('Send the email and be concise'), null);
});
