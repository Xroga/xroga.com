import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptMicStream, preferredSpeechLanguage, requiresVoiceReview, spokenReply } from './voiceConversation';

test('negations and consequential targets require review rather than automatic execution', () => {
  for (const utterance of [
    "Build the app but don't deploy it",
    'یہ بناؤ مگر ابھی پبلش مت کرنا',
    'أعطني خطة فقط، لا تنفذ',
    'ऐप बनाओ लेकिन अभी प्रकाशित मत करना',
    'Send an email to the team',
  ]) assert.equal(requiresVoiceReview(utterance), true, utterance);
  assert.equal(requiresVoiceReview('What changed in this report?'), false);
});

test('permission granted after End immediately stops every microphone track', () => {
  let stopped = 0;
  const tracks = [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }];
  assert.equal(acceptMicStream(tracks, 4, 5, false), false);
  assert.equal(stopped, 2);
  assert.equal(acceptMicStream(tracks, 5, 5, true), false);
  assert.equal(stopped, 4);
  assert.equal(acceptMicStream(tracks, 5, 5, false), true);
  assert.equal(stopped, 4);
});

test('spoken responses stay concise and never read raw code fences or URLs', () => {
  assert.equal(spokenReply('**Done.** [Open report](https://example.com)\n```js\nsecret()\n```'), 'Done. Open report Code details are in the chat.');
  assert.equal(preferredSpeechLanguage('Hello'), 'en-US');
  assert.equal(preferredSpeechLanguage('میرے لیے بناؤ'), 'ur-PK');
  assert.equal(preferredSpeechLanguage('مرحبا'), 'ar-SA');
  assert.equal(preferredSpeechLanguage('नमस्ते'), 'hi-IN');
});
