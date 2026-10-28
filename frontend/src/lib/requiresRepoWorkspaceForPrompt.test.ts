import assert from 'node:assert/strict';
import test from 'node:test';
import { requiresRepoWorkspaceForPrompt } from './requiresRepoWorkspaceForPrompt';

test('connected-app and ordinary tasks do not demand GitHub', () => {
  for (const prompt of [
    'Using my connected Canva account, create a private logo design.',
    'Create a Google Sheet with sample rows, then copy the results to Canva.',
    'Transfer random test data between my connected apps.',
    'What is 2 + 2?',
  ]) assert.equal(requiresRepoWorkspaceForPrompt(prompt), false, prompt);
});

test('repository-scoped software builds retain the repo gate', () => {
  assert.equal(requiresRepoWorkspaceForPrompt('Build a working web app from this idea.'), true);
  assert.equal(requiresRepoWorkspaceForPrompt('Fix this TypeScript code bug.'), true);
});
