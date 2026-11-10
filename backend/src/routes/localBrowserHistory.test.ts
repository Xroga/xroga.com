import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTenantContext } from '../security/tenantContext.js';
import { BROWSER_HISTORY_REPO, browserHistoryMessages, browserHistorySessionId, sourcesOf, syncBrowserRunToHistory } from './localBrowserHistory.js';

const user = '11111111-1111-4111-8111-111111111111';
const context = createTenantContext({ userId: user, via: 'remote_getuser' });

function fakeDb(existingNumber = 0) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const row = (id: string) => ({ id, github_repo_name: BROWSER_HISTORY_REPO, terminal_number: existingNumber + 1, title: 't', preview: 'p', kind: 'chat', status: 'active', message_count: 2, created_at: 'c', updated_at: 'u' });
  let lastId = '';
  const chain = (table: string) => {
    const api: Record<string, unknown> = {
      select: (...a: unknown[]) => { calls.push({ op: `${table}.select`, args: a }); return api; },
      eq: (...a: unknown[]) => { calls.push({ op: `${table}.eq`, args: a }); return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: async () => (calls.some(c => c.op.endsWith('.update')) ? { data: row(lastId), error: null } : { data: existingNumber ? { terminal_number: existingNumber } : null, error: null }),
      upsert: async (value: { id: string }, o: unknown) => { lastId = value.id; calls.push({ op: `${table}.upsert`, args: [value, o] }); return { error: null }; },
      update: (value: unknown) => { calls.push({ op: `${table}.update`, args: [value] }); return api; },
    };
    return api;
  };
  return { db: { from: (t: string) => chain(t) } as never, calls };
}

describe('browser history sync', () => {
  it('reads the public addresses a result names', () => {
    assert.deepEqual(sourcesOf('Heading on https://example.com/page, and (https://www.iana.org/help).'), ['https://example.com/page', 'https://www.iana.org/help']);
    assert.deepEqual(sourcesOf('no links here'), []);
  });

  it('builds a user message and an assistant result with sources', () => {
    const messages = browserHistoryMessages({ runId: 'r1', goal: 'Go to example.com', result: 'Heading: Example Domain at https://example.com/' }, 1000);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'user');
    assert.equal(messages[1].role, 'assistant');
    assert.equal((messages[1] as { webSources?: Array<{ siteDomain: string }> }).webSources?.[0].siteDomain, 'example.com');
  });

  it('writes one owner-bound session per run under the browser-tasks project', async () => {
    const { db, calls } = fakeDb(2);
    const result = await syncBrowserRunToHistory(context, { runId: 'abc-123', goal: 'Go to example.com and read the heading', result: 'Example Domain' }, { db: () => db, now: () => 5000 });
    assert.equal(result.id, browserHistorySessionId('abc-123'));
    const upsert = calls.find(c => c.op === 'terminal_sessions.upsert')!;
    const row = upsert.args[0] as { user_id: string; github_repo_name: string; terminal_number: number; message_count: number; kind: string };
    assert.equal(row.user_id, user);
    assert.equal(row.github_repo_name, BROWSER_HISTORY_REPO);
    assert.equal(row.terminal_number, 3);
    assert.equal(row.message_count, 2);
    assert.equal(row.kind, 'chat');
    assert.deepEqual(upsert.args[1], { onConflict: 'id', ignoreDuplicates: true });
  });

  it('uses the same session id for the same run', () => {
    assert.equal(browserHistorySessionId('same'), browserHistorySessionId('same'));
    assert.notEqual(browserHistorySessionId('a'), browserHistorySessionId('b'));
  });
});
