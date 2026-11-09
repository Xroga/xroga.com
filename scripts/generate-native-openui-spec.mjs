import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const { outputFiles } = await build({
  entryPoints: ['frontend/src/components/native-openui/library.tsx'],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  jsx: 'automatic', loader: { '.css': 'empty' }, write: false,
});
const module = { exports: {} };
const run = new Function('require', 'module', 'exports', outputFiles[0].text);
run(createRequire(new URL('../frontend/package.json', import.meta.url)), module, module.exports);
const { library } = module.exports;
const spec = library.toSpec();
const expected = JSON.stringify({ spec, schema: library.toJSONSchema() }, null, 2) + '\n';
const file = new URL('../backend/src/ai/nativeOpenUiCatalog.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== expected) throw new Error('Native OpenUI registry and server schema differ');
  const coverage = JSON.parse(readFileSync(new URL('../docs/operations/native-openui/coverage.json', import.meta.url), 'utf8'));
  assert.deepEqual([...coverage.nativeComponents].sort(), Object.keys(spec.components).sort(), 'Component audit must match the model-facing registry');
  assert.deepEqual([...coverage.nativeFunctions].sort(), Object.keys(spec.functions).sort(), 'Function audit must match the model-facing registry');
  for (const component of coverage.intelligentUiComponentAudit) {
    if (component.disposition === 'registered') assert.ok(Object.hasOwn(spec.components, component.native), component.name);
  }
  for (const fn of coverage.intelligentUiFunctionAudit) {
    assert.equal(fn.discoverable, Object.hasOwn(spec.functions, fn.name), fn.name);
  }
} else {
  writeFileSync(file, expected);
}
