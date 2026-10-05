import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isQuickConversationPrompt,
  pendingExecutionIntent,
  pendingExecutionLabel,
} from './executionIntent';

test('greetings stay in the lightweight conversation lane', () => {
  for (const prompt of ['hi', 'Hello!', 'hey there'.replace(' there', ''), 'salam', 'good morning']) {
    assert.equal(isQuickConversationPrompt(prompt), true, prompt);
    assert.equal(pendingExecutionIntent({ prompt }), 'chat', prompt);
  }
  assert.equal(pendingExecutionLabel('chat'), 'Responding');
});

test('transient presentation follows the requested kind of work without recording evidence', () => {
  assert.equal(
    pendingExecutionIntent({ prompt: 'Search the web and compare the latest sources' }),
    'research',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'Read this PDF and summarize the contract' }),
    'document',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'Send an email from Gmail to the client' }),
    'business',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'Solve this probability problem carefully' }),
    'analysis',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'Explain why the sky is blue.' }),
    'analysis',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'Inspect this repo and find the cause of the bug.' }),
    'code',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'Build a responsive landing page, run it, test it, and verify it in the browser.' }),
    'code',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'Query the database and summarize the relevant records.' }),
    'business',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'hello', codeBuildActive: true }),
    'code',
  );
  assert.equal(
    pendingExecutionIntent({ prompt: 'hello', researchActive: true }),
    'research',
  );
});

test('labels describe preparation, not fabricated completed work', () => {
  assert.equal(pendingExecutionLabel('research'), 'Preparing research');
  assert.equal(pendingExecutionLabel('document'), 'Preparing document analysis');
  assert.equal(pendingExecutionLabel('code'), 'Preparing workspace');
  assert.equal(pendingExecutionLabel('business'), 'Preparing connected app');
  assert.equal(pendingExecutionLabel('analysis'), 'Working through the problem');
});
