import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantContext } from '../security/tenantContext.js';
import { SupabaseBuilderStore } from './store.js';
import { closeBuilderRun } from './swarmBridge.js';
import type { BuilderRunBinding } from './service.js';

const owner = '11111111-1111-4111-8111-111111111111';
const context = createTenantContext({ userId: owner, via: 'remote_getuser' });
const binding = () => ({ projectId: 'synthetic-project', runId: 'synthetic-run', saved: () => null,
  noChange: () => false } as unknown as BuilderRunBinding);

test('a failed terminal write remains retryable without replaying model work', async t => {
  const run = binding();
  let writes = 0;
  t.mock.method(SupabaseBuilderStore.prototype, 'setStateForRun', async (userId: string, projectId: string, runId: string, state: string) => {
    assert.equal(userId, owner);
    assert.equal(projectId, run.projectId);
    assert.equal(runId, run.runId);
    assert.equal(state, 'cancelled');
    if (++writes === 1) throw new Error('synthetic database unavailable');
    return null; // A superseded run is a safe no-op, never an unconditional update.
  });
  await closeBuilderRun(context, run, { ok: false, cancelled: true });
  await closeBuilderRun(context, run, { ok: false, cancelled: true });
  assert.equal(writes, 2);
  await closeBuilderRun(context, run, { ok: true });
  assert.equal(writes, 2, 'a successful close cannot later be relabelled');
});

test('a failed unsaved-result write can be retried', async t => {
  const run = binding();
  let writes = 0;
  t.mock.method(SupabaseBuilderStore.prototype, 'setStateForRun', async (_owner: string, _project: string, _run: string, state: string) => {
    assert.equal(state, 'failed');
    if (++writes === 1) throw new Error('synthetic database unavailable');
    return null;
  });
  await closeBuilderRun(context, run, { ok: false });
  await closeBuilderRun(context, run, { ok: false });
  assert.equal(writes, 2);
});

test('concurrent callers wait for the same terminal write', async t => {
  const run = binding();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  t.after(() => finish());
  let writes = 0;
  t.mock.method(SupabaseBuilderStore.prototype, 'setStateForRun', async () => {
    writes++;
    await pending;
    return null;
  });
  const first = closeBuilderRun(context, run, { ok: false, cancelled: true });
  let secondFinished = false;
  const second = closeBuilderRun(context, run, { ok: false, cancelled: true }).then(() => { secondFinished = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 1);
  assert.equal(secondFinished, false);
  finish();
  await Promise.all([first, second]);
});

test('a shared failed close does not reject callers and remains retryable', async t => {
  const run = binding();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  t.after(() => finish());
  let writes = 0;
  t.mock.method(SupabaseBuilderStore.prototype, 'setStateForRun', async () => {
    if (++writes === 1) {
      await pending;
      throw new Error('synthetic database unavailable');
    }
    return null;
  });
  const first = closeBuilderRun(context, run, { ok: false });
  const second = closeBuilderRun(context, run, { ok: false });
  finish();
  await Promise.all([first, second]);
  await closeBuilderRun(context, run, { ok: false });
  assert.equal(writes, 2);
});
