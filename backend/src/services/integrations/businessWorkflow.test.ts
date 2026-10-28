import assert from 'node:assert/strict';
import { test } from 'node:test';

import { splitExplicitBusinessWorkflow, validateSourceBoundBusinessWorkflow } from './businessWorkflow.js';
import { mayNeedSemanticBusinessWorkflow } from './businessWorkflowPlanner.js';

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

test('marks a requested summary action as dependent on multiple app reads', () => {
  const steps = splitExplicitBusinessWorkflow('Find clients in my CRM and read their notes and email me a summary');
  assert.deepEqual(steps?.map((step) => step.kind), ['read', 'read', 'action']);
  assert.equal(steps?.[2]?.dependsOnPrevious, true);
});

test('keeps three explicitly separated app tasks as three steps', () => {
  const steps = splitExplicitBusinessWorkflow('List my calendar events; send an email to Jane; create a task for Friday');
  assert.deepEqual(steps?.map((step) => step.kind), ['read', 'action', 'action']);
  assert.equal(steps?.[2]?.request, 'create a task for Friday');
});

test('keeps public research, artifact creation, and dependent cell update separate', () => {
  const steps = splitExplicitBusinessWorkflow('Search the public web for the APOD title; create a new Google Sheets spreadsheet named Xroga Stage; update cell A1 of that spreadsheet with the title found in the web search');
  assert.deepEqual(steps?.map((step) => step.kind), ['web', 'action', 'action']);
  assert.deepEqual(steps?.map((step) => step.dependsOnPrevious), [false, false, true]);
});

test('keeps comma-separated read, spreadsheet write, and email as three dependent steps', () => {
  const message = 'Find prospective clients, add qualified ones to a spreadsheet, and email me the results.';
  assert.deepEqual(splitExplicitBusinessWorkflow(message), [
    { kind: 'read', request: 'Find prospective clients', dependsOnPrevious: false },
    { kind: 'action', request: 'add qualified ones to a spreadsheet', dependsOnPrevious: true },
    { kind: 'action', request: 'email me the results', dependsOnPrevious: true },
  ]);
  assert.equal(validateSourceBoundBusinessWorkflow(message, [
    { kind: 'read', request: 'Find prospective clients' },
    { kind: 'action', request: 'email me the results' },
  ], new Set(['read', 'action'])), null);
});

test('passes a created artifact to the later request for its link', () => {
  assert.deepEqual(splitExplicitBusinessWorkflow('Create a spreadsheet for this project and email me its link'), [
    { kind: 'action', request: 'Create a spreadsheet for this project', dependsOnPrevious: false },
    { kind: 'action', request: 'email me its link', dependsOnPrevious: true },
  ]);
});

test('does not turn a public search, ordinary sentence, or ambiguous clause into an app workflow', () => {
  assert.equal(splitExplicitBusinessWorkflow('Search the web for flights and send me options'), null);
  assert.deepEqual(splitExplicitBusinessWorkflow('Search the public web for NASA APOD; create a new Google Sheets spreadsheet with its title'), [
    { kind: 'web', request: 'Search the public web for NASA APOD', dependsOnPrevious: false },
    { kind: 'action', request: 'create a new Google Sheets spreadsheet with its title', dependsOnPrevious: true },
  ]);
  assert.equal(splitExplicitBusinessWorkflow('Explain Gmail and calendar integrations'), null);
  assert.equal(splitExplicitBusinessWorkflow('Send the email and be concise'), null);
  assert.equal(splitExplicitBusinessWorkflow('Send an email to Jane, John, and Alex'), null);
});

test('segments six app tasks without knowing or hard-coding the app names', () => {
  const steps = splitExplicitBusinessWorkflow('Find entries in Acme CRM; put them in Example Sheet; draft a message; schedule a meeting; update the task; share the report');
  assert.deepEqual(steps?.map((step) => step.kind), ['read', 'action', 'action', 'action', 'action', 'action']);
  assert.equal(steps?.[1]?.dependsOnPrevious, true);
});

test('recognizes a multi-task candidate but leaves one email to multiple people alone', () => {
  assert.equal(mayNeedSemanticBusinessWorkflow('Find clients in a connected CRM and email them a summary'), true);
  assert.equal(mayNeedSemanticBusinessWorkflow('Send an email to Jane and John'), false);
  assert.equal(mayNeedSemanticBusinessWorkflow('Create a spreadsheet with two rows: header Item, Value; data test, 42. Do not modify existing files.'), false);
  assert.equal(splitExplicitBusinessWorkflow('Create a spreadsheet with two rows: header Item, Value; data test, 42. Do not modify existing files.'), null);
  assert.equal(mayNeedSemanticBusinessWorkflow('Create a spreadsheet; send its link to me'), true);
});

test('accepts only exact source-bound app and web steps, deriving dependencies on the server', () => {
  const message = 'Search the web for current fares and email them to Jane';
  assert.deepEqual(validateSourceBoundBusinessWorkflow(message, [
    { kind: 'web', request: 'Search the web for current fares', dependsOnPrevious: false },
    { kind: 'action', request: 'email them to Jane', dependsOnPrevious: false },
  ], new Set(['web', 'action'])), [
    { kind: 'web', request: 'Search the web for current fares', dependsOnPrevious: false },
    { kind: 'action', request: 'email them to Jane', dependsOnPrevious: true },
  ]);
  const publicWebMessage = 'Search the public web for NASA APOD; create a new Google Sheets spreadsheet with its title';
  const publicWebSteps = [
    { kind: 'web', request: 'Search the public web for NASA APOD' },
    { kind: 'action', request: 'create a new Google Sheets spreadsheet with its title' },
  ];
  assert.deepEqual(validateSourceBoundBusinessWorkflow(publicWebMessage, publicWebSteps, new Set(['web', 'read', 'action'])), [
    { ...publicWebSteps[0], dependsOnPrevious: false },
    { ...publicWebSteps[1], dependsOnPrevious: true },
  ]);
  assert.equal(validateSourceBoundBusinessWorkflow(publicWebMessage, [
    { ...publicWebSteps[0], kind: 'read' }, publicWebSteps[1],
  ], new Set(['web', 'read', 'action'])), null);
});

test('rejects paraphrases, unapproved kinds, and omitted middle or final actions', () => {
  const allowed = new Set(['read', 'action'] as const);
  assert.equal(validateSourceBoundBusinessWorkflow('Find clients in CRM and email them', [
    { kind: 'read', request: 'Find leads in CRM' }, { kind: 'action', request: 'email them' },
  ], allowed), null);
  assert.equal(validateSourceBoundBusinessWorkflow('Find clients in CRM and email them', [
    { kind: 'read', request: 'Find clients in CRM' }, { kind: 'web', request: 'email them' },
  ], allowed), null);
  assert.equal(validateSourceBoundBusinessWorkflow('Find clients and send a note and delete records', [
    { kind: 'read', request: 'Find clients' }, { kind: 'action', request: 'delete records' },
  ], allowed), null);
  assert.equal(validateSourceBoundBusinessWorkflow('Find clients and email them and delete records', [
    { kind: 'read', request: 'Find clients' }, { kind: 'action', request: 'email them' },
  ], allowed), null);
  assert.equal(validateSourceBoundBusinessWorkflow('Do not send an email; create a draft', [
    { kind: 'action', request: 'send an email' }, { kind: 'action', request: 'create a draft' },
  ], allowed), null);
});
