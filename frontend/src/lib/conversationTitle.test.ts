import assert from 'node:assert/strict';
import test from 'node:test';
import { stableConversationTitle } from './conversationTitle';

test('a legacy Terminal label recovers the first user prompt, not the assistant or the latest turn', () => {
  assert.equal(stableConversationTitle('Terminal', [
    { role: 'assistant', content: 'Welcome' },
    { role: 'user', content: 'Compare PostgreSQL and SQLite' },
    { role: 'user', content: 'Make it shorter' },
  ], 'Make it shorter'), 'Compare PostgreSQL and SQLite');
  assert.equal(stableConversationTitle('Terminal #2', [], 'Compare PostgreSQL and SQLite'), 'Compare PostgreSQL and SQLite');
  assert.equal(stableConversationTitle('Terminal', [], 'Terminal'), 'Untitled conversation');
});

test('established titles stay fixed on subsequent saves and renames persist as stored', () => {
  const title = stableConversationTitle('', [{ role: 'user', content: 'Plan the Q4 launch' }]);
  assert.equal(stableConversationTitle(title, [], 'Add a checklist'), title);
  assert.equal(stableConversationTitle('Q4 launch plan #1', [], 'Add a checklist'), 'Q4 launch plan #1');
  assert.match(stableConversationTitle('', [], 'Compare PostgreSQL, MySQL and SQLite for a small SaaS with multiple customer workspaces and global usage'), /…$/);
});
