import assert from 'node:assert/strict';
import test from 'node:test';
import {describeVoiceFailure, describeVoiceStartFailure} from './voiceMessages';

const named = (name: string) => Object.assign(new Error(name), {name});

test('a microphone that never started is not reported as a lost transcription', () => {
  for (const error of [new Error('The microphone did not start.'), new TypeError('addModule failed'), named('AbortError'), named('InvalidStateError'), named('NotSupportedError')]) {
    const message = describeVoiceStartFailure(error);
    assert.match(message, /microphone could not start/i);
    assert.doesNotMatch(message, /recording is kept|could not be transcribed/i);
  }
});

test('permission, device and sign-in problems keep their own instructions', () => {
  assert.match(describeVoiceStartFailure(named('NotAllowedError')), /Allow microphone access/);
  assert.match(describeVoiceStartFailure(named('NotFoundError')), /No microphone was found/);
  assert.match(describeVoiceStartFailure(named('NotReadableError')), /busy or unavailable/);
  assert.match(describeVoiceStartFailure(Object.assign(new Error(), {status: 401})), /sign in/);
});

test('upload failures still say the recording is kept', () => {
  assert.match(describeVoiceFailure(new TypeError('Failed to fetch')), /recording is kept/);
  assert.match(describeVoiceFailure(new Error('other')), /could not be transcribed/);
});
