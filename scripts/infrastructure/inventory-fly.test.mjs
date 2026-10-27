import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFlyReferences, classifyFlyPath } from './inventory-fly.mjs';

test('inventory detects active domains, identity, commands and private routing without emitting content', () => {
  const content = 'const url="https://xroga-api.fly.dev";\nXROGA_SANDBOX_FLY_TOKEN=PRIVATE_SECRET_CANARY\nFLY_APP_NAME=xroga-api\nfly deploy .\nreturn `${machineId}.vm.${app}.internal`;';
  const result = inspectFlyReferences('backend/src/runtime.ts', content);
  assert.equal(result.category, 'runtime');
  assert.deepEqual(result.references.map(reference => reference.line), [1, 2, 3, 4, 5]);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_SECRET_CANARY'));
  assert.ok(!JSON.stringify(result).includes('xroga-api'));
});

test('Scrapfly and ordinary text are not Fly.io infrastructure', () => {
  assert.equal(inspectFlyReferences('backend/src/scrapfly.ts', 'SCRAPFLY_API_KEY=https://api.scrapfly.io'), null);
  assert.equal(inspectFlyReferences('backend/src/other.ts', 'ordinary generated code'), null);
});

test('historical evidence stays visible and operational scripts are not silently exempted', () => {
  assert.equal(classifyFlyPath('docs/xroga/evidence/command-009/receipt.json'), 'preserved_evidence');
  assert.equal(classifyFlyPath('scripts/deploy.mjs'), 'operational_script');
  assert.equal(classifyFlyPath('.github/workflows/fly-deploy.yml'), 'deployment');
  assert.equal(classifyFlyPath('backend/src/runtime.test.ts'), 'test');
  assert.equal(inspectFlyReferences('fly.api.toml', 'app = "example"').flyNamedPath, true);
});
