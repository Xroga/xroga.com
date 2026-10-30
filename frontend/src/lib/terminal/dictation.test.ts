import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  DictationController,
  composeDraft,
  dictationLanguage,
  draftBaseFrom,
  getDictationConstructor,
  joinSpoken,
  type DictationErrorCode,
  type DictationEvent,
  type DictationRecognition,
  type DictationSnapshot,
  type DictationState,
} from './dictation';

const tick = (ms = 12) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeRecognition implements DictationRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = '';
  onstart: (() => void) | null = null;
  onresult: ((event: DictationEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() { this.started = true; this.onstart?.(); }
  stop() { this.stopped = true; queueMicrotask(() => this.onend?.()); }
  abort() { this.aborted = true; }
  say(parts: Array<[string, boolean]>) {
    const results = parts.map(([transcript, isFinal]) => ({ isFinal, 0: { transcript } }));
    this.onresult?.({ resultIndex: 0, results });
  }
  silenceEnd() { this.onend?.(); }
  fail(error: string) { this.onerror?.({ error }); this.onend?.(); }
}

function harness(extra: { maxIdleRestarts?: number } = {}) {
  FakeRecognition.instances = [];
  const log = { states: [] as DictationState[], spoken: [] as Array<[DictationSnapshot, boolean]>, errors: [] as DictationErrorCode[] };
  const controller = new DictationController({
    Recognition: FakeRecognition,
    lang: 'en-IN',
    onState: (s) => log.states.push(s),
    onSpoken: (snap, done) => log.spoken.push([snap, done]),
    onError: (e) => log.errors.push(e),
    restartDelayMs: 1,
    stopTimeoutMs: 20,
    ...extra,
  });
  const last = () => log.spoken[log.spoken.length - 1];
  return { controller, log, last, engine: () => FakeRecognition.instances[FakeRecognition.instances.length - 1] };
}

test('language defaults to the browser language with regional defaults for bare tags', () => {
  assert.equal(dictationLanguage(['hi-IN', 'en-US'], 'en-US'), 'hi-IN');
  assert.equal(dictationLanguage(['en-IN'], 'en-IN'), 'en-IN');
  assert.equal(dictationLanguage([], 'hi'), 'hi-IN');
  assert.equal(dictationLanguage(undefined, 'en'), 'en-US');
  assert.equal(dictationLanguage(undefined, 'fr'), 'fr');
  assert.equal(dictationLanguage([], ''), 'en-US');
});

test('support detection prefers the standard constructor then webkit, else null', () => {
  assert.equal(getDictationConstructor(undefined), null);
  assert.equal(getDictationConstructor({}), null);
  assert.equal(getDictationConstructor({ webkitSpeechRecognition: FakeRecognition }), FakeRecognition);
});

test('joinSpoken trims engine padding, keeps punctuation tight and skips spaces for CJK', () => {
  assert.equal(joinSpoken(' hello ', ' world'), 'hello world');
  assert.equal(joinSpoken('hello', '.'), 'hello.');
  assert.equal(joinSpoken('', ' hi'), 'hi');
  assert.equal(joinSpoken('你好', '世界'), '你好世界');
  assert.equal(joinSpoken('नमस्ते', 'how are you'), 'नमस्ते how are you');
});

test('composeDraft appends at the caret without overwriting existing text', () => {
  assert.deepEqual(composeDraft(draftBaseFrom('Build me', 8), 'a landing page'), { text: 'Build me a landing page', caret: 23 });
  assert.deepEqual(composeDraft(draftBaseFrom('', 0), 'hello'), { text: 'hello', caret: 5 });
  assert.deepEqual(composeDraft(draftBaseFrom('Hello world', 5), 'there'), { text: 'Hello there world', caret: 11 });
  assert.deepEqual(composeDraft(draftBaseFrom('line one\n', 9), 'line two'), { text: 'line one\nline two', caret: 17 });
  assert.deepEqual(composeDraft(draftBaseFrom('keep this', null), ''), { text: 'keep this', caret: 9 });
  assert.equal(composeDraft(draftBaseFrom('abc def', 0, 3), 'x').text, 'x def');
});

test('interim text is shown live and replaced by the final result without duplication', () => {
  const { controller, last, engine } = harness();
  controller.start();
  assert.equal(engine().continuous, true);
  assert.equal(engine().interimResults, true);
  assert.equal(engine().lang, 'en-IN');
  engine().say([['build a', false]]);
  assert.deepEqual(last(), [{ final: '', interim: 'build a' }, false]);
  engine().say([['build a landing', false]]);
  assert.equal(last()[0].interim, 'build a landing');
  engine().say([['build a landing page', true]]);
  assert.deepEqual(last(), [{ final: 'build a landing page', interim: '' }, false]);
  engine().say([['build a landing page', true], [' for dogs', false]]);
  assert.deepEqual(last()[0], { final: 'build a landing page', interim: 'for dogs' });
  controller.abort();
});

test('a revised result never duplicates or drops earlier phrases', () => {
  const { controller, last, engine } = harness();
  controller.start();
  engine().say([['hello', true], ['wor', false]]);
  engine().say([['hello', true], ['world', true], ['how are', false]]);
  assert.deepEqual(last()[0], { final: 'hello world', interim: 'how are' });
  controller.abort();
});

test('browser ending recognition on silence restarts it and keeps earlier speech', async () => {
  const { controller, log, last } = harness();
  controller.start();
  const first = FakeRecognition.instances[0];
  first.say([['namaste', true]]);
  first.silenceEnd();
  await tick();
  assert.equal(FakeRecognition.instances.length, 2);
  assert.equal(controller.getState(), 'listening');
  FakeRecognition.instances[1].say([['how are you', true]]);
  assert.deepEqual(last(), [{ final: 'namaste how are you', interim: '' }, false]);
  assert.ok(!log.spoken.some(([, done]) => done));
  controller.abort();
});

test('unfinalised interim speech is kept when the engine ends it', async () => {
  const { controller, last } = harness();
  controller.start();
  FakeRecognition.instances[0].say([['half a sentence', false]]);
  FakeRecognition.instances[0].silenceEnd();
  assert.equal(last()[0].final, 'half a sentence');
  await tick();
  controller.abort();
});

test('stop delivers the full transcript once, does not restart, and releases the engine', async () => {
  const { controller, log, last, engine } = harness();
  controller.start();
  engine().say([['first', true], ['second', false]]);
  controller.stop();
  assert.equal(controller.getState(), 'stopping');
  await tick();
  assert.equal(controller.getState(), 'idle');
  assert.deepEqual(last(), [{ final: 'first second', interim: '' }, true]);
  assert.equal(log.spoken.filter(([, done]) => done).length, 1);
  assert.equal(FakeRecognition.instances.length, 1);
  assert.equal(engine().stopped, true);
  assert.deepEqual(log.states, ['requesting', 'listening', 'stopping', 'idle']);
});

test('stop still finishes if the engine never reports end', async () => {
  const { controller, last, engine } = harness();
  controller.start();
  engine().say([['stuck engine', true]]);
  engine().stop = () => { engine().stopped = true; };
  controller.stop();
  await tick(40);
  assert.equal(controller.getState(), 'idle');
  assert.equal(last()[1], true);
  assert.equal(last()[0].final, 'stuck engine');
  assert.equal(engine().aborted, true);
});

test('start is ignored while already running, and abort drops text and ends the session', () => {
  const { controller, log, engine } = harness();
  controller.start();
  controller.start();
  assert.equal(FakeRecognition.instances.length, 1);
  engine().say([['secret words', true]]);
  const spokenBefore = log.spoken.length;
  controller.abort();
  assert.equal(controller.getState(), 'idle');
  assert.equal(engine().aborted, true);
  assert.equal(log.spoken.length, spokenBefore);
  engine().say([['late', true]]);
  assert.equal(log.spoken.length, spokenBefore);
});

test('permission denied, no microphone and network errors stop with an honest code', () => {
  const cases = [
    ['not-allowed', 'permission-denied'],
    ['service-not-allowed', 'permission-denied'],
    ['audio-capture', 'no-microphone'],
    ['network', 'network'],
    ['language-not-supported', 'unsupported-language'],
  ] as const;
  for (const [engineError, code] of cases) {
    const { controller, log, engine } = harness();
    controller.start();
    engine().fail(engineError);
    assert.deepEqual(log.errors, [code]);
    assert.equal(controller.getState(), 'idle');
    assert.equal(FakeRecognition.instances.length, 1);
  }
});

test('repeated silence gives up with no-speech instead of listening forever', async () => {
  const { controller, log } = harness({ maxIdleRestarts: 2 });
  controller.start();
  FakeRecognition.instances[0].fail('no-speech');
  await tick();
  FakeRecognition.instances[1].fail('no-speech');
  await tick();
  assert.deepEqual(log.errors, ['no-speech']);
  assert.equal(controller.getState(), 'idle');
});

test('resetSpeech forgets spoken text and listens afresh', () => {
  const { controller, last, engine } = harness();
  controller.start();
  engine().say([['already in the box', true]]);
  controller.resetSpeech();
  assert.equal(FakeRecognition.instances.length, 2);
  assert.equal(FakeRecognition.instances[0].aborted, true);
  engine().say([['new words', true]]);
  assert.equal(last()[0].final, 'new words');
  controller.abort();
});

test('a speech start failure reports failed instead of throwing', () => {
  FakeRecognition.instances = [];
  class Throwing extends FakeRecognition {
    start(): void { throw new Error('InvalidStateError'); }
  }
  const errors: DictationErrorCode[] = [];
  const controller = new DictationController({
    Recognition: Throwing,
    lang: 'en-US',
    onState: () => undefined,
    onSpoken: () => undefined,
    onError: (e) => errors.push(e),
  });
  controller.start();
  assert.deepEqual(errors, ['failed']);
  assert.equal(controller.getState(), 'idle');
});

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('the workspace mic records for local Whisper and only falls back to browser speech when the device cannot run it', () => {
  const control = read('../../components/terminal/XrogaVoiceControl.tsx');
  assert.match(control, /function localWhisperSupported\(\)/);
  assert.match(control, /if\(!localWhisperSupported\(\) && Recognition\)\{startSpeechFallback\(Recognition\);return;\}/);
  assert.match(control, /new DictationController\(\{/);
  assert.match(control, /speech\.current\?\.abort\(\)/);
  // Dictated text goes through the composer's own draft handler; nothing submits.
  assert.match(control, /publish\.current\(snapshot\.final\)/);
  assert.doesNotMatch(control, /requestSubmit|onVoiceSend/);
});

test('browser-speech fallback adds no network, storage, logging or auto-send', () => {
  const lib = read('./dictation.ts');
  assert.doesNotMatch(lib, /fetch\(|XMLHttpRequest|localStorage|sessionStorage|console\.|requestSubmit|getUserMedia/);
});
