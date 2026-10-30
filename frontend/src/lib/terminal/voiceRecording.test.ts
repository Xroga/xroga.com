import assert from 'node:assert/strict';
import test from 'node:test';
import {appendVoiceTranscript} from './voiceRecording';

test('preserves typed formatting, repeats and mixed-language words without heuristic deduplication', () => {
 assert.equal(appendVoiceTranscript('send\n', 'send send اور CRM automation'), 'send\nsend send اور CRM automation');
 assert.equal(appendVoiceTranscript('edited while pending', 'نیا متن'), 'edited while pending نیا متن');
 assert.equal(appendVoiceTranscript('keep  spacing', ''), 'keep  spacing');
});
test('a repeated phrase said twice is kept twice', () => {
 assert.equal(appendVoiceTranscript('', 'please call me please call me'), 'please call me please call me');
});
