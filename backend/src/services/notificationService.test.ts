import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCompletionNotification, failureNotificationMessage } from './notificationService.js';

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

describe('public failure notification copy',()=>{
  for(const kind of ['build','video'] as const) it(`provides a truthful safe next action for ${kind} without claiming completion or durable save`,()=>{
    const message=failureNotificationMessage(kind);
    assert.match(message,/could not finish/i);assert.match(message,/Open Workspace/);assert.match(message,/retry/);
    assert.doesNotMatch(message,/coming soon|success|saved|stack|token|password|SQL|SUPABASE/i);
  });
});
