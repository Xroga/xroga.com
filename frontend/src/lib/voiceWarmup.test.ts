import assert from 'node:assert/strict';
import test from 'node:test';
import {createVoiceWarmup, VOICE_WARMUP_GAP_MS} from './voiceWarmup';

function setup(token: () => Promise<string | null>) {
  const state = {woke: 0, clock: 0, visible: true};
  const wake = createVoiceWarmup({
    warm: () => { state.woke++; },
    token,
    visible: () => state.visible,
    now: () => state.clock,
  });
  return {state, wake};
}

test('a signed-in person gets the voice server woken before they tap the mic', async () => {
  const {state, wake} = setup(async () => 'token');
  await wake();
  assert.equal(state.woke, 1);
});

test('repeated activity wakes it again only after the gap', async () => {
  const {state, wake} = setup(async () => 'token');
  await Promise.all([wake(), wake(), wake()]);
  state.clock = VOICE_WARMUP_GAP_MS - 1;
  await wake();
  assert.equal(state.woke, 1);
  state.clock = VOICE_WARMUP_GAP_MS;
  await wake();
  assert.equal(state.woke, 2);
});

test('signed-out visitors and unreadable sessions never wake it, and may try again once signed in', async () => {
  let current: string | null = null;
  const {state, wake} = setup(async () => current);
  await wake();
  assert.equal(state.woke, 0);
  current = 'token';
  await wake();
  assert.equal(state.woke, 1);
  const broken = setup(async () => { throw new Error('session unavailable'); });
  await broken.wake();
  assert.equal(broken.state.woke, 0);
});

test('a hidden page sends nothing', async () => {
  const {state, wake} = setup(async () => 'token');
  state.visible = false;
  await wake();
  assert.equal(state.woke, 0);
  state.visible = true;
  await wake();
  assert.equal(state.woke, 1);
});
