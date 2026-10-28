import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {encodeVoicePcm} from './voicePcm';
import {requireVoicePcm} from '../../../backend/src/ai/voicePcm.js';

test('actual browser voice encoder produces server-validated fixed PCM and preserves stereo samples', () => {
  const left = new Float32Array(48000).fill(0.5), right = new Float32Array(48000).fill(-0.25);
  const encoded = encodeVoicePcm(48000, [left, right]);
  assert.deepEqual(requireVoicePcm(Buffer.from(encoded)), {frames: 22050, seconds: 1});
  assert.equal(new DataView(encoded.buffer).getInt16(44, true), Math.round(0.125 * 32767));
  for (const run of [
    () => encodeVoicePcm(0, [left]), () => encodeVoicePcm(48000, []),
    () => encodeVoicePcm(48000, [left, right.subarray(1)]),
    () => encodeVoicePcm(8000, [new Float32Array(8000 * 126)]),
    () => encodeVoicePcm(48000, [new Float32Array(48000).fill(NaN)]),
  ]) assert.throws(run);
  const corrupt = Buffer.from(encoded); corrupt.writeUInt32LE(22050 * 2, 24);
  assert.throws(() => requireVoicePcm(corrupt), 'Sample-rate metadata cannot create cheaper accounting');
});

test('real isolated Chromium decodes a recording and normalizes it without a provider or saved artifacts', async () => {
  const backendRequire = createRequire(resolve(process.cwd(), 'backend/package.json'));
  const {chromium} = backendRequire('playwright');
  const ts = createRequire(resolve(process.cwd(), 'package.json'))('typescript');
  const javascript = ts.transpileModule(readFileSync(resolve(process.cwd(), 'frontend/src/lib/voicePcm.ts'), 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route: {abort: () => Promise<void>}) => route.abort());
    const channel = new Float32Array(44100);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.sin(i * 2 * Math.PI * 440 / 44100) * 0.25;
    const source = Array.from(encodeVoicePcm(44100, [channel]));
    const result = await page.evaluate(async ({javascript, source}: {javascript: string; source: number[]}) => {
      const exported: {normalizeVoiceAudio?: (audio: Blob) => Promise<Blob>} = {};
      new Function('exports', javascript)(exported);
      if (!exported.normalizeVoiceAudio) throw Error('Missing actual module export');
      const normalized = await exported.normalizeVoiceAudio(new Blob([new Uint8Array(source)], {type: 'audio/wav'}));
      return {type: normalized.type, bytes: Array.from(new Uint8Array(await normalized.arrayBuffer()))};
    }, {javascript, source});
    assert.equal(result.type, 'audio/wav');
    assert.deepEqual(requireVoicePcm(Buffer.from(result.bytes)), {frames: 22050, seconds: 1});
  } finally { await browser.close(); }
});
