import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_MODEL_REVISION } from './voiceLocalProtocol';

test('WASM and model-download permissions are limited to the isolated voice runtime', async () => {
  const config = (await import('../../next.config.mjs')).default;
  const rules = await config.headers();
  const policy = (source: string) => rules.find(rule => rule.source === source)?.headers.find(header => header.key === 'Content-Security-Policy')?.value ?? '';
  const worker = policy('/voice-runtime/:path*'), page = policy('/');
  assert.match(worker, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.ok(worker.includes(`/resolve/${VOICE_MODEL_REVISION}/`));
  assert.match(worker, /worker-src 'none'/);
  assert.doesNotMatch(worker, /'unsafe-eval'|https:\/\/\*/);
  assert.doesNotMatch(page, /wasm-unsafe-eval|huggingface|cdn\.hf/);
});
