import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coalesceActivity } from './activityPresentation';
import { adaptTerminalEvent } from './terminalEventAdapter';

const kindOf = (text: string) => coalesceActivity(adaptTerminalEvent('progress', {
  agent: 'session', status: 'step', activityId: 's', activityStatus: 'completed', swarmActivity: text,
}, { fromSeq: 0 }))[0]?.kind;

test('progress wording picks the matching kind of work', () => {
  assert.equal(kindOf('Searched the web for "database deploy": 2 sources'), 'search');
  assert.equal(kindOf('Read connected app Notion: fetch page'), 'connected-app-read');
  assert.equal(kindOf('Connected app Linear: list issues needs your approval'), 'connected-app-read');
  assert.equal(kindOf('Sent the request to connected app Gmail: send email'), 'connected-app-write');
  assert.equal(kindOf('Received 2 attached files: a.pdf, b.png'), 'read-file');
});
