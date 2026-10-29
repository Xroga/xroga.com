import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as protocol from './voiceLocalProtocol';

test('upstream model failure cannot log private input tensors from the actual worker', async () => {
  const logs: unknown[] = [], messages: unknown[] = [];
  const context = vm.createContext({
    exports: {}, onmessage: null, Float32Array,
    console: { error: (...values: unknown[]) => logs.push(values), warn: (...values: unknown[]) => logs.push(values) },
    postMessage: (value: unknown) => messages.push(value),
  });
  const pipeline = vm.runInContext('(async () => { console.error("PRIVATE_AUDIO_FEATURES"); console.warn("PRIVATE_INPUT"); throw new Error("PRIVATE_MODEL_ERROR"); })', context);
  context.require = (name: string) => name === '@huggingface/transformers'
    ? { env: { backends: { onnx: { wasm: {} } } }, pipeline }
    : protocol;
  const source = readFileSync(new URL('./voiceTranscription.worker.ts', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  await context.onmessage({ data: new Float32Array(16000).fill(0.1) });
  assert.deepEqual(logs, []);
  assert.equal(JSON.stringify(messages), '[{"type":"progress","stage":"loading"},{"type":"error"}]');
});
