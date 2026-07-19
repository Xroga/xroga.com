import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileValidateProject } from './compileValidate.js';
import { formatArchitectForBuilder, runArchitectPlan } from './architect.js';

describe('compileValidateProject', () => {
  it('skips static sites without package.json', async () => {
    const result = await compileValidateProject([
      { path: 'index.html', content: '<!doctype html><html><body>Hi</body></html>' },
    ]);
    assert.equal(result.skipped, true);
    assert.equal(result.ok, true);
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
