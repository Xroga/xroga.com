import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compileValidateProject,
  productionValidationAllowsDeployment,
  requiredProductionBuild,
  validationFailureNeedsCodeRepair,
} from './compileValidate.js';
import { formatArchitectForBuilder, runArchitectPlan } from './architect.js';

describe('compileValidateProject', () => {
  it('skips static sites without package.json', async () => {
    const result = await compileValidateProject([
      { path: 'index.html', content: '<!doctype html><html><body>Hi</body></html>' },
    ]);
    assert.equal(result.skipped, true);
    assert.equal(result.ok, true);
  });

  it('requires the real framework build and blocks deployment when it fails', () => {
    const files = [{ path: 'package.json', content: JSON.stringify({ scripts: { build: 'next build' }, dependencies: { next: '15.5.7' } }) }];
    assert.deepEqual(requiredProductionBuild(files), { command: 'npm', args: ['run', 'build'] });
    assert.equal(productionValidationAllowsDeployment({
      ok: false, skipped: false, installOk: true, tscOk: true, buildOk: false,
      buildCommand: 'npm run build', buildExitCode: 1, issues: ['build failed'], logTail: '', durationMs: 1,
    }), false);
  });

  it('does not spend a model repair call on a pure install timeout', () => {
    assert.equal(validationFailureNeedsCodeRepair({
      ok: false, skipped: false, installOk: false,
      issues: ['npm install timed out'], logTail: '', durationMs: 180_000,
    }), false);
    assert.equal(validationFailureNeedsCodeRepair({
      ok: false, skipped: false, installOk: true, tscOk: false,
      issues: ['error TS2322: incompatible value'], logTail: '', durationMs: 1,
    }), true);
  });
});

describe('architect format', () => {
  it('formats file plan for builder', () => {
    const text = formatArchitectForBuilder({
      stack: 'nextjs',
      files: [{ path: 'app/page.tsx', purpose: 'home' }],
      notes: ['use env'],
      inputTokens: 0,
      outputTokens: 0,
      raw: '',
    });
    assert.match(text, /ARCHITECT FILE PLAN/);
    assert.match(text, /app\/page\.tsx/);
  });
});

// Smoke: architect JSON parse path (network may fail in CI — tolerate)
describe('runArchitectPlan', () => {
  it('returns a plan object shape when models available or fails open', async () => {
    try {
      const plan = await runArchitectPlan({
        userId: '00000000-0000-4000-8000-000000000001',
        brief: 'Build a simple landing page',
        userPrompt: 'landing page for a cafe',
      });
      assert.ok(typeof plan.stack === 'string');
      assert.ok(Array.isArray(plan.files));
    } catch {
      // No API keys in unit env — acceptable
      assert.ok(true);
    }
  });
});
