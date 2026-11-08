import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const { outputFiles } = await build({
  entryPoints: ['frontend/src/components/native-openui/library.tsx'],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', loader: { '.css': 'empty' }, write: false,
});
const module = { exports: {} };
const run = new Function('require', 'module', 'exports', outputFiles[0].text);
run(createRequire(new URL('../frontend/package.json', import.meta.url)), module, module.exports);
const { library } = module.exports;
const expected = JSON.stringify({ spec: library.toSpec(), schema: library.toJSONSchema() }, null, 2) + '\n';
const file = new URL('../backend/src/ai/nativeOpenUiCatalog.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== expected) throw new Error('Native OpenUI registry and server schema differ');
} else {
  writeFileSync(file, expected);
}
