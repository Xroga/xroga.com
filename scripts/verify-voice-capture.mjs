// Real-browser check of the dictation capture path: Chromium's fake microphone
// feeds getUserMedia -> AudioContext -> AudioWorklet -> segmenter -> WAV encoder.
// Every WAV is then validated by the backend's own requireVoicePcm. No speech
// provider is called; transcription is replaced by a labelled stub in the page.
// Run: npx tsx scripts/verify-voice-capture.mjs
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { requireVoicePcm } from '../backend/src/ai/voicePcm.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(path.join(os.tmpdir(), 'xroga-voice-capture-'));
const seconds = Number(process.env.VOICE_CAPTURE_SECONDS ?? 32);

// 48 kHz mono fixture: 3 s of loud modulated tone then a 0.6 s pause, repeating.
function fixture() {
  const rate = 48000, total = rate * 60, data = Buffer.alloc(44 + total * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) {
    const t = i / rate, inPause = (t % 3.6) >= 3;
    const value = inPause ? 0 : 0.35 * Math.sin(2 * Math.PI * (180 + 60 * Math.sin(t * 3)) * t) * (0.6 + 0.4 * Math.sin(t * 9));
    data.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return data;
}
const wavPath = path.join(work, 'fake-mic.wav');
writeFileSync(wavPath, fixture());

const bundle = await build({
  stdin: {
    contents: `import {openVoiceCapture} from './frontend/src/lib/voiceCapture';
import {createVoiceSegmenter} from './frontend/src/lib/voiceSegmenter';
import {createDictationPipeline} from './frontend/src/lib/voiceDictation';
window.xv = {openVoiceCapture, createVoiceSegmenter, createDictationPipeline};`,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', tsconfig: path.join(root, 'frontend/tsconfig.json'),
});
const script = bundle.outputFiles[0].text;
const worklet = readFileSync(path.join(root, 'frontend/public/voice-capture-worklet.js'));
const server = http.createServer((req, res) => {
  if (req.url === '/voice-capture-worklet.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(worklet); return; }
  if (req.url === '/bundle.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(script); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>capture</title><button id=go>go</button><script src=/bundle.js></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ args: [
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${wavPath}`, '--autoplay-policy=no-user-gesture-required',
] });
let failed = false;
try {
  const page = await browser.newPage();
  await page.goto(url);
  const report = await page.evaluate(async (recordSeconds) => {
    const { openVoiceCapture, createVoiceSegmenter, createDictationPipeline } = window.xv;
    const clickAt = performance.now(), abort = new AbortController(), uploads = [];
    const capture = await openVoiceCapture(() => {}, abort.signal);
    const pipeline = createDictationPipeline({ signal: abort.signal, transcribe: async (wav) => {
      uploads.push(new Uint8Array(await wav.arrayBuffer())); return 'segment-' + uploads.length;
    } });
    const segments = [];
    const segmenter = createVoiceSegmenter(capture.rate, segment => {
      segments.push({ seq: segment.seq, start: segment.startSeconds, end: segment.endSeconds,
        edgeRms: Math.sqrt([...segment.samples.slice(-2400)].reduce((sum, v) => sum + v * v, 0) / 2400) });
      pipeline.add(segment);
    });
    await capture.begin(samples => segmenter.push(samples));
    const recordingMs = performance.now() - clickAt;
    await new Promise(resolve => setTimeout(resolve, recordSeconds * 1000));
    capture.stop(); segmenter.flush();
    const stopAt = performance.now();
    await pipeline.settle();
    const result = pipeline.result();
    return { rate: capture.rate, recordingMs, capturedSeconds: segmenter.seconds, segments, text: result.text,
      complete: result.complete, stopToTextMs: performance.now() - stopAt,
      uploads: uploads.map(bytes => Array.from(bytes)) };
  }, seconds);

  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) failed = true; };
  check('microphone started', report.recordingMs < 3000, `${Math.round(report.recordingMs)} ms click to first audio`);
  check('captured about the recorded time', Math.abs(report.capturedSeconds - seconds) < 2, `${report.capturedSeconds.toFixed(2)} s captured for ${seconds} s`);
  check('long recording was cut into segments', report.segments.length >= 2 || seconds < 25, `${report.segments.length} segments`);
  check('segments are contiguous', report.segments.every((s, i) => i === 0 || Math.abs(s.start - report.segments[i - 1].end) < 1e-6), 'no gap or overlap');
  const cut = report.segments.find(s => s.seq === 0 && s.end < report.capturedSeconds - 0.5);
  if (cut) check('first cut lands in a pause', cut.edgeRms < 0.05, `edge RMS ${cut.edgeRms.toFixed(4)} (tone RMS is about 0.2)`);
  let accepted = 0;
  for (const bytes of report.uploads) { try { requireVoicePcm(Buffer.from(bytes)); accepted++; } catch { /* counted below */ } }
  check('backend accepts every uploaded WAV', accepted === report.uploads.length && accepted > 0, `${accepted}/${report.uploads.length} accepted by requireVoicePcm`);
  check('transcript is merged in order', report.complete && report.text === report.uploads.map((_, i) => 'segment-' + (i + 1)).join(' '), report.text);
  console.log(JSON.stringify({ sampleRate: report.rate, stopToTextMs: Math.round(report.stopToTextMs), checks }, null, 2));
} finally {
  await browser.close();
  server.close();
  rmSync(work, { recursive: true, force: true });
}
if (failed) process.exit(1);
