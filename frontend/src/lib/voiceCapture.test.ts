import assert from 'node:assert/strict';
import test from 'node:test';
import {openVoiceCapture, prepareVoiceAudioContext} from './voiceCapture';

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
function install(options: {constraints: unknown[]; fail?: Array<string | null>}) {
  const created: FakeContext[] = [];
  class FakeContext {
    state = 'suspended'; sampleRate = 48000; closed = false; resumed = 0; onstatechange: (() => void) | null = null;
    audioWorklet = {addModule: async () => {}};
    constructor() { created.push(this); }
    async resume() { this.resumed++; this.state = 'running'; }
    async close() { this.closed = true; }
  }
  const track = {stopped: false, addEventListener() {}, stop() { this.stopped = true; }};
  const stream = {getTracks: () => [track], getAudioTracks: () => [track]};
  const saved = {AudioContext: g.AudioContext, AudioWorkletNode: g.AudioWorkletNode, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'), window: g.window};
  g.AudioContext = FakeContext; g.AudioWorkletNode = class {}; g.window = globalThis;
  let call = 0;
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {mediaDevices: {getUserMedia: async (c: unknown) => {
    options.constraints.push(c);
    const name = options.fail?.[call++];
    if (name) throw Object.assign(new Error(name), {name});
    return stream;
  }}}});
  return {created, track, restore() {
    g.AudioContext = saved.AudioContext; g.AudioWorkletNode = saved.AudioWorkletNode; g.window = saved.window;
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete g.navigator;
  }};
}

test('the audio context is created and started synchronously, before any await, and then reused', async () => {
  const constraints: unknown[] = [];
  const env = install({constraints});
  try {
    const prepared = prepareVoiceAudioContext();
    assert.ok(prepared, 'context exists immediately for the tap handler');
    assert.equal(env.created.length, 1);
    assert.equal((env.created[0] as unknown as {resumed: number}).resumed, 1, 'resume() called inside the gesture');
    const capture = await openVoiceCapture(() => {}, new AbortController().signal, prepared);
    assert.equal(env.created.length, 1, 'no second context is created after the awaits');
    assert.equal(capture.rate, 48000);
    capture.stop();
    assert.equal(env.track.stopped, true);
    assert.equal((env.created[0] as unknown as {closed: boolean}).closed, true);
  } finally { env.restore(); }
});

test('unsupported audio constraints retry with plain audio, but permission and device errors are not hidden', async () => {
  for (const name of ['OverconstrainedError', 'TypeError', 'ConstraintNotSatisfiedError']) {
    const constraints: unknown[] = [];
    const env = install({constraints, fail: [name]});
    try {
      const capture = await openVoiceCapture(() => {}, new AbortController().signal, prepareVoiceAudioContext());
      assert.equal(constraints.length, 2, name);
      assert.deepEqual(constraints[1], {audio: true});
      capture.stop();
    } finally { env.restore(); }
  }
  for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
    const constraints: unknown[] = [];
    const env = install({constraints, fail: [name]});
    try {
      const prepared = prepareVoiceAudioContext();
      await assert.rejects(openVoiceCapture(() => {}, new AbortController().signal, prepared), {name});
      assert.equal(constraints.length, 1, 'no silent retry for ' + name);
      assert.equal((env.created[0] as unknown as {closed: boolean}).closed, true, 'unused context is released');
    } finally { env.restore(); }
  }
});

test('an unsupported browser gets no context instead of an exception', () => {
  const saved = g.AudioContext;
  try {
    delete g.AudioContext;
    assert.equal(prepareVoiceAudioContext(), undefined);
    g.AudioContext = class { constructor() { throw new Error('blocked'); } };
    assert.equal(prepareVoiceAudioContext(), undefined);
  } finally { g.AudioContext = saved; }
});

test('a suspended or interrupted context ends capture and keeps what was heard', async () => {
  const constraints: unknown[] = [];
  const env = install({constraints});
  try {
    let interrupted = 0;
    const capture = await openVoiceCapture(() => { interrupted++; }, new AbortController().signal, prepareVoiceAudioContext());
    const context = env.created[0] as unknown as {state: string; onstatechange: (() => void) | null};
    context.state = 'interrupted';
    context.onstatechange?.();
    assert.equal(interrupted, 1);
    capture.stop();
    context.state = 'suspended';
    context.onstatechange?.();
    assert.equal(interrupted, 1, 'no further callbacks after stop');
  } finally { env.restore(); }
});
