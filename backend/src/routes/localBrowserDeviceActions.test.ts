import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocalBrowserAuth } from './localBrowserDevice.js';

const owner = '00000000-0000-4000-8000-000000000001';
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const token = 'xroga_browser_' + 'A'.repeat(43);
const run = '00000000-0000-4000-8000-0000000000aa';

async function call(method: string, path: string, withToken = true) {
  const before = process.env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS;
  process.env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS = owner;
  try {
    const db = () => ({ query: async () => ({ rows: [{ owner_id: owner, id: 'device-1' }], rowCount: 1 }) });
    const middleware = createLocalBrowserAuth(db as never, () => extensionId);
    let status = 0;
    let nextCalled = false;
    const res = { set() { return this; }, status(code: number) { status = code; return this; }, json() { return this; } };
    const req = { method, path, headers: { authorization: withToken ? 'Bearer ' + token : undefined, origin: 'chrome-extension://' + extensionId } };
    await middleware(req as never, res as never, (() => { nextCalled = true; }) as never);
    return { status, nextCalled };
  } finally {
    if (before === undefined) delete process.env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS;
    else process.env.XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS = before;
  }
}

test('the signed-in extension device can reach the approved-change routes, and only those new paths', async () => {
  for (const op of ['plugin-action-search', 'plugin-act', 'plugin-act-review', 'plugin-search', 'plugin-read', 'plugin-review']) {
    const result = await call('POST', `/runs/${run}/${op}`);
    assert.deepEqual(result, { status: 0, nextCalled: true }, op);
  }
  // Wrong verb, an invented operation, a non-run path, and a missing token stay refused.
  assert.equal((await call('GET', `/runs/${run}/plugin-act`)).status, 401);
  assert.equal((await call('POST', `/runs/${run}/plugin-act-anything`)).status, 401);
  assert.equal((await call('POST', `/runs/${run}/plugin-act/extra`)).status, 401);
  assert.equal((await call('POST', `/admin/plugin-act`)).status, 401);
  assert.equal((await call('POST', `/runs/${run}/plugin-act`, false)).nextCalled, false);
});
