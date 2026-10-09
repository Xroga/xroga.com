import assert from 'node:assert/strict';
import test from 'node:test';
import { advancePreviewRun, createPreviewReceipt, createPreviewRun, PREVIEW_FIXTURES } from './osPreview';

test('clinic fixture progresses from plan to a clearly simulated receipt', () => {
  let run = createPreviewRun('clinic');
  assert.equal(PREVIEW_FIXTURES.clinic.tasks.length, 4);
  assert.equal(createPreviewReceipt(run), null);
  for (const stage of ['queued', 'working', 'validating', 'verified']) {
    run = advancePreviewRun(run);
    assert.equal(run.status, stage);
  }
  const receipt = createPreviewReceipt(run);
  assert.equal(receipt?.label, 'DEMO / NOT EXECUTED');
  assert.equal(receipt?.actualExternalChanges, 0);
  assert.ok(receipt?.evidence.every((item) => item.demoState === 'not-executed'));
  assert.deepEqual(advancePreviewRun(run), run);
});

test('alternate path remains honest and gives no fake execution proof', () => {
  let run = createPreviewRun('crm-operations', 'needs-approval');
  for (let index = 0; index < 4; index += 1) run = advancePreviewRun(run);
  assert.equal(run.status, 'needs-approval');
  assert.equal(createPreviewReceipt(run)?.actualExternalChanges, 0);
});
