import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCompletionNotification } from './notificationService.js';

describe('buildCompletionNotification', () => {
  it('claims shipped only with push and verified deployment evidence', () => {
    const copy = buildCompletionNotification({
      projectName: 'DeFi dashboard',
      prompt: 'build it',
      githubPushConfirmed: true,
      fullyShipped: true,
      handoffReady: true,
      deployUrl: 'https://defi.vercel.app',
      deployVerified: true,
    });
    assert.equal(copy.type, 'success');
    assert.match(copy.title, /shipped/i);
    assert.match(copy.message, /verified/i);
  });

  it('does not claim ready or live without evidence', () => {
    const copy = buildCompletionNotification({
      projectName: 'DeFi dashboard',
      prompt: 'build it',
      githubPushConfirmed: false,
      fullyShipped: false,
      handoffReady: false,
      deployVerified: false,
    });
    assert.equal(copy.type, 'warning');
    assert.doesNotMatch(copy.title, /ready|live|shipped/i);
    assert.doesNotMatch(copy.message, /files pushed|live:/i);
  });
});
