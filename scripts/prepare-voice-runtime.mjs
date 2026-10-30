// Build only the browser runtime, not model weights. Model data is pinned in voiceLocalProtocol.ts.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'frontend/package.json'));
const ort = path.dirname(path.dirname(require.resolve('onnxruntime-web')));
const destination = path.join(root, 'frontend/public/voice-runtime/v1');
await mkdir(destination, { recursive: true });
await build({ entryPoints: [path.join(root, 'frontend/src/lib/voiceTranscription.worker.ts')], outfile: path.join(destination, 'worker.js'),
  bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' } });
// ONNX loads its WASM and matching JS glue by name. No runtime CDN scripts or eval.
for (const name of await readdir(path.join(ort, 'dist'))) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(name)) await copyFile(path.join(ort, 'dist', name), path.join(destination, name));
}
console.log('Local voice worker and ONNX runtime prepared. No audio or model requests made.');
