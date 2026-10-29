import { tmpdir } from 'node:os';
// Actual CPU/WASM inference, public JFK fixture. No paid API, microphone or customer audio.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const multilingual = process.argv.includes('--multilingual');
const medium = process.argv.includes('--medium');
const longRecording = process.argv.includes('--long');
const modelName = medium ? 'Xenova/whisper-medium' : 'onnx-community/whisper-small';
const modelRevision = medium ? '8c5b90880ab9f79487ab33613413431bf661d595' : '36050c46d777d46dc4b5f43f6d90574fc38f8732';
const candidateSource = text => medium ? text.replaceAll('onnx-community/whisper-small', modelName).replaceAll('36050c46d777d46dc4b5f43f6d90574fc38f8732', modelRevision).replaceAll('6650c62b74664a42ddfb297a', '647740e7f911e9e76c5f4eb7') : text;
const fixtures = [];
const unavailableFixtures = [];
const fixtureDirectory = process.argv.includes('--fixtures') ? process.argv[process.argv.indexOf('--fixtures')+1] : null;
if (fixtureDirectory) {
  for (const fixture of JSON.parse(await readFile(path.join(fixtureDirectory, 'manifest.json'), 'utf8'))) {
    const audio = await readFile(path.join(fixtureDirectory, fixture.file ?? `${fixture.language}.wav`));
    assert.equal(createHash('sha256').update(audio).digest('hex'), fixture.sha256);
    fixtures.push({...fixture, audio});
  }
}
for (const language of fixtureDirectory ? [] : multilingual ? ['ur_pk', 'hi_in', 'ar_eg'] : ['en']) {
  let fixtureUrl = 'https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac', expected = 'And so my fellow Americans ask not what your country can do for you ask what you can do for your country';
  if (language !== 'en') {
    const rows = await fetch(`https://datasets-server.huggingface.co/rows?dataset=google%2Ffleurs&config=${language}&split=test&offset=0&length=1`, { signal: AbortSignal.timeout(30000) });
    if (!rows.ok) { unavailableFixtures.push({language, reason: `Public corpus HTTP ${rows.status}`}); continue; }
    const row = (await rows.json()).rows[0].row;
    fixtureUrl = row.audio[0].src; expected = row.transcription;
  }
  const response = await fetch(fixtureUrl, { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok); const audio = Buffer.from(await response.arrayBuffer());
  fixtures.push({ language, fixtureUrl: language === 'en' ? fixtureUrl : `https://huggingface.co/datasets/google/fleurs/viewer/${language}/test?row=0`, expected, audio });
}
assert.ok(fixtures.length, 'No accessible public speech fixture');
let audio = fixtures[0].audio;
const bundle = await build({ stdin: { contents: `import {transcribeVoiceLocally,recognizeVoiceSamples} from './frontend/src/lib/voiceLocal';window.runVoice=async()=>{window.voiceStages=[];const audio=await (await fetch('/fixture.flac')).blob();const signal=new AbortController().signal;const progress=stage=>{window.voiceStages.push({stage,time:Date.now()});console.log('VOICE_STAGE',stage);};if(${longRecording}){const decoded=await new OfflineAudioContext(1,1,16000).decodeAudioData(await audio.arrayBuffer());const clip=decoded.getChannelData(0);const repeats=Math.ceil(135/decoded.duration);const samples=new Float32Array(clip.length*repeats);for(let i=0;i<repeats;i++)samples.set(clip,i*clip.length);window.longFixture={repeats,durationSeconds:samples.length/16000};return recognizeVoiceSamples(samples,signal,progress);}return transcribeVoiceLocally(audio,signal,progress);};`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser' });
const config = (await import('../frontend/next.config.mjs')).default;
const rules = await config.headers();
const workerHeaders = rules.find(rule => rule.source === '/voice-runtime/:path*').headers.map(header => ({ ...header, value: candidateSource(header.value) }));
// Diagnostics exist only in this isolated public-fixture build, never the shipped worker.
const diagnosticWorker = await build({ entryPoints: ['frontend/src/lib/voiceTranscription.worker.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', plugins: [{ name: 'fixture-errors', setup(builder) {
  builder.onLoad({ filter: /voiceTranscription\.worker\.ts$/ }, async ({ path: file }) => ({ loader: 'ts', contents: (await readFile(file, 'utf8')).replace("catch { reply({ type: 'error' }); }", "catch (failure) { console.error('FIXTURE_WORKER_FAILURE', String(failure)); reply({ type: 'error' }); }") }));
  builder.onLoad({ filter: /voiceLocalProtocol\.ts$/ }, async ({ path: file }) => ({ loader: 'ts', contents: candidateSource(await readFile(file, 'utf8')) }));
} }] });
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'"); res.setHeader('Content-Type', 'text/html'); res.end('<script>'+bundle.outputFiles[0].text+'</script>'); }
    else if (req.url === '/fixture.flac') { res.setHeader('Content-Type', audio.subarray(0,4).toString() === 'RIFF' ? 'audio/wav' : 'audio/flac'); res.end(audio); }
    else if (/^\/voice-runtime\/v1\/[a-zA-Z0-9.-]+$/.test(req.url)) {
      for (const header of workerHeaders) res.setHeader(header.key, header.value);
      res.setHeader('Content-Type', req.url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      res.end(req.url.endsWith('/worker.js') ? diagnosticWorker.outputFiles[0].text : await readFile(path.join(process.cwd(), 'frontend/public', req.url)));
    } else { res.statusCode = 404; res.end(); }
  } catch { res.statusCode = 500; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext(); const page = await context.newPage();
  const requests = [];
  context.on('request', request => { requests.push({ method: request.method(), origin: new URL(request.url()).origin }); });
  context.on('requestfailed', request => console.log('FIXTURE_NETWORK_FAILURE', new URL(request.url()).origin + new URL(request.url()).pathname, request.failure()?.errorText));
  page.on('console', message => { if (message.type() === 'error' || message.text().startsWith('VOICE_STAGE')) console.log(message.text().slice(0,500)); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const results = [];
  for (const fixture of fixtures) {
    audio = fixture.audio;
    const start = Date.now(); const transcript = await page.evaluate(() => window.runVoice());
    const longFixture = longRecording ? await page.evaluate(() => window.longFixture) : null;
    if (longFixture) assert.equal((transcript.toLowerCase().match(/ask not what your country can do for you/g) ?? []).length, longFixture.repeats, 'Every repeated speech segment must survive chunked recognition');
    if (!multilingual) {
      assert.match(transcript.toLowerCase(), /ask not what your country can do for you/);
      assert.match(transcript.toLowerCase(), /what you can do for your country/);
    }
    // Report measured errors, never turn a model-quality failure into a passing claim.
    const words = text => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/);
    const reference = words(fixture.expected), predicted = words(transcript);
    let previous = Array.from({length: predicted.length + 1}, (_, i) => i);
    for (let i = 1; i <= reference.length; i++) {
      const next = [i];
      for (let j = 1; j <= predicted.length; j++) next[j] = Math.min(next[j-1]+1, previous[j]+1, previous[j-1]+(reference[i-1] === predicted[j-1] ? 0 : 1));
      previous = next;
    }
    const stages = await page.evaluate(() => window.voiceStages);
    results.push({ language: fixture.language, fixtureUrl: fixture.fixtureUrl, fixtureSha256: createHash('sha256').update(audio).digest('hex'), reference: fixture.expected, transcript, wordErrorRate: longFixture ? null : previous[predicted.length]/reference.length, longFixture, durationMs: Date.now()-start, stages });
    console.log('FIXTURE_RECOGNIZED', fixture.language, results.at(-1).wordErrorRate, results.at(-1).durationMs);
  }
  assert.ok(requests.every(request => request.method === 'GET'), 'Audio must never be uploaded');
  const receipt = { scope: 'ACTUAL_LOCAL_WASM_RECOGNITION_PUBLIC_FIXTURES_NOT_BROAD_LANGUAGE_CERTIFICATION', model: modelName, revision: modelRevision, browser: browser.version(), results, unavailableFixtures, audioUploads: 0, paidRequests: 0, requestOrigins: [...new Set(requests.map(request => request.origin))] };
  await writeFile(path.join(tmpdir(), longRecording ? 'voice-long-receipt.json' : medium ? 'voice-medium-receipt.json' : multilingual ? 'voice-multilingual-receipt.json' : 'voice-local-receipt.json'), JSON.stringify(receipt, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
