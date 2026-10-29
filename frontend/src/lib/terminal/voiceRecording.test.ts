import assert from 'node:assert/strict';
import test from 'node:test';
import {appendVoiceTranscript, captureVoiceRecording} from './voiceRecording';
class Track extends EventTarget { stopped = false; stop() { this.stopped = true; } }
class Recorder {
  static latest: Recorder;
  static isTypeSupported() { return true; }
  onstart: (() => void) | null = null;
  state = 'inactive'; mimeType = 'audio/webm'; stops = 0;
  ondataavailable: ((event: {data: Blob}) => void) | null = null;
  onstop: (() => void) | null = null; onerror: (() => void) | null = null;
  constructor() { Recorder.latest = this; }
  start() { this.state = 'recording'; this.onstart?.(); }
  stop() { this.stops++; this.state = 'inactive'; }
  chunk(text: string) { this.ondataavailable?.({data: new Blob([text])}); }
}
function fixture(limitMs = 120000) {
 const track = new Track(), abort = new AbortController();
 const capture = captureVoiceRecording({getTracks: () => [track]} as unknown as MediaStream, abort.signal, Recorder as unknown as typeof MediaRecorder, limitMs);
 return {track, abort, ...capture, recorder: Recorder.latest};
}
test('preserves typed formatting, repeats and mixed-language words without heuristic deduplication', () => {
 assert.equal(appendVoiceTranscript('send\n', 'send send اور CRM automation'), 'send\nsend send اور CRM automation');
 assert.equal(appendVoiceTranscript('edited while pending', 'نیا متن'), 'edited while pending نیا متن');
 assert.equal(appendVoiceTranscript('keep  spacing', ''), 'keep  spacing');
});
test('awaits last chunk and stop event, publishes complete recording once, releases tracks', async () => {
 const f = fixture(); f.recorder.chunk('a'.repeat(512)); f.stop(); f.stop();
 let settled = false; void f.audio.then(() => {settled = true;}); await Promise.resolve(); assert.equal(settled,false);
 f.recorder.chunk('b'.repeat(512)); f.recorder.onstop?.();
 assert.equal(await (await f.audio).text(),'a'.repeat(512)+'b'.repeat(512));
 assert.equal(f.recorder.stops,1); assert.equal(f.track.stopped,true); assert.equal(f.recorder.onstop,null);
});
test('cancel rejects and discards late events', async () => {
 const f=fixture(); const rejected=assert.rejects(f.audio,{name:'AbortError'}); f.abort.abort(); await rejected;
 f.recorder.chunk('late'.repeat(512)); assert.equal(f.track.stopped,true);
});
test('unexpected recorder termination fails instead of publishing partial speech', async () => {
 const f=fixture(); const rejected=assert.rejects(f.audio,{name:'RecordingInterruptedError'});
 f.recorder.chunk('partial'.repeat(512)); f.recorder.onstop?.(); await rejected; assert.equal(f.track.stopped,true);
});
test('duration and size limits discard incomplete audio without submitting', async () => {
 const f=fixture(5); await assert.rejects(f.audio,{name:'RecordingLimitError'}); assert.equal(f.track.stopped,true);
 const large=fixture(); const rejected=assert.rejects(large.audio,{name:'RecordingLimitError'});
 large.recorder.chunk('x'.repeat(8*1024*1024+1)); await rejected;
});
