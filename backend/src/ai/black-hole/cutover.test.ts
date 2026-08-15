import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CUTOVER_STAGES,
  isPermittedTransition,
  readCutoverPlan,
  servesBlackHoleFor,
  type CutoverStage,
} from './cutover.js';

const env = (over: Record<string, string> = {}) => over as NodeJS.ProcessEnv;

test('the stages are §39\'s, in order', () => {
  assert.deepEqual([...CUTOVER_STAGES], [
    'legacy_only', 'shadow', 'controlled', 'default', 'legacy_disabled',
  ]);
});

test('an unset flag leaves production doing what it already does', () => {
  // A new and unproven path defaults off; a typo results in "nothing changed".
  const plan = readCutoverPlan(env());
  assert.equal(plan.stage, 'legacy_only');
  assert.equal(plan.runsBlackHole, false);
  assert.equal(plan.servesBlackHole, false);
  assert.equal(plan.legacyAvailable, true);
});

test('an unrecognised stage falls back to legacy only', () => {
  const plan = readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: 'full-send' }));
  assert.equal(plan.stage, 'legacy_only');
  assert.equal(plan.runsBlackHole, false);
});

test('shadow runs Black Hole without serving it', () => {
  // Real routing decisions on real traffic with zero user-visible risk — the only way to find
  // out a chain is empty for 8% of requests before those users see it.
  const plan = readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: 'shadow' }));
  assert.equal(plan.runsBlackHole, true);
  assert.equal(plan.servesBlackHole, false);
  assert.equal(plan.legacyAvailable, true);
});

test('controlled serves a bounded percentage', () => {
  const plan = readCutoverPlan(env({
    BLACK_HOLE_CUTOVER_STAGE: 'controlled',
    BLACK_HOLE_ROLLOUT_PERCENT: '25',
  }));
  assert.equal(plan.servesBlackHole, true);
  assert.equal(plan.rolloutPercent, 25);
  assert.equal(plan.legacyAvailable, true);
});

test('a nonsensical percentage is clamped rather than trusted', () => {
  assert.equal(
    readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: 'controlled', BLACK_HOLE_ROLLOUT_PERCENT: '900' })).rolloutPercent,
    100,
  );
  assert.equal(
    readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: 'controlled', BLACK_HOLE_ROLLOUT_PERCENT: '-5' })).rolloutPercent,
    0,
  );
  assert.equal(
    readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: 'controlled', BLACK_HOLE_ROLLOUT_PERCENT: 'lots' })).rolloutPercent,
    0,
  );
});

test('the rollback path survives until the final stage', () => {
  for (const stage of ['shadow', 'controlled', 'default'] as CutoverStage[]) {
    assert.equal(
      readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: stage })).legacyAvailable,
      true,
      `${stage} removed the rollback path`,
    );
  }
  assert.equal(
    readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: 'legacy_disabled' })).legacyAvailable,
    false,
  );
});

test('bucketing is stable, so a user does not flip paths mid-conversation', () => {
  // A session where half the answers came from a different system is confusing to the user and
  // unreadable in a bug report.
  const plan = readCutoverPlan(env({
    BLACK_HOLE_CUTOVER_STAGE: 'controlled',
    BLACK_HOLE_ROLLOUT_PERCENT: '50',
  }));
  const first = servesBlackHoleFor(plan, 'conversation-abc');
  for (let index = 0; index < 20; index += 1) {
    assert.equal(servesBlackHoleFor(plan, 'conversation-abc'), first);
  }
});

test('bucketing approximates the requested percentage', () => {
  const plan = readCutoverPlan(env({
    BLACK_HOLE_CUTOVER_STAGE: 'controlled',
    BLACK_HOLE_ROLLOUT_PERCENT: '30',
  }));
  let served = 0;
  const total = 2_000;
  for (let index = 0; index < total; index += 1) {
    if (servesBlackHoleFor(plan, `conversation-${index}`)) served += 1;
  }
  const ratio = served / total;
  assert.ok(ratio > 0.2 && ratio < 0.4, `bucketed ${Math.round(ratio * 100)}% for a 30% rollout`);
});

test('nothing is served while the stage does not serve', () => {
  const shadow = readCutoverPlan(env({ BLACK_HOLE_CUTOVER_STAGE: 'shadow' }));
  assert.equal(servesBlackHoleFor(shadow, 'anything'), false);
});

test('skipping a stage forward is refused', () => {
  // Going from legacy_only straight to default is the big-bang deploy §39 forbids, whatever
  // it is called at the time.
  assert.equal(isPermittedTransition('legacy_only', 'shadow'), true);
  assert.equal(isPermittedTransition('shadow', 'controlled'), true);
  assert.equal(isPermittedTransition('controlled', 'default'), true);
  assert.equal(isPermittedTransition('default', 'legacy_disabled'), true);

  assert.equal(isPermittedTransition('legacy_only', 'default'), false);
  assert.equal(isPermittedTransition('shadow', 'default'), false);
  assert.equal(isPermittedTransition('controlled', 'legacy_disabled'), false);
});

test('rolling back any distance is always allowed', () => {
  // An incident is the worst moment to discover the safety control only travels one way.
  assert.equal(isPermittedTransition('legacy_disabled', 'legacy_only'), true);
  assert.equal(isPermittedTransition('default', 'shadow'), true);
  assert.equal(isPermittedTransition('controlled', 'legacy_only'), true);
  assert.equal(isPermittedTransition('shadow', 'shadow'), true);
});
