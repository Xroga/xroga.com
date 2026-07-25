import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routePrompt, isBuildPrompt } from './router.js';

describe('routePrompt', () => {
  it('routes complex crypto builds to Kimi', () => {
    const r = routePrompt('build a crypto staking dashboard with wallet connect');
    assert.equal(r.builder, 'kimi_k3');
    assert.equal(r.converter, 'deepseek_v4_flash');
  });

  it('routes long-horizon refactors to GLM', () => {
    const r = routePrompt('build and refactor this large codebase repository suite');
    assert.equal(r.builder, 'glm_5_2');
  });

  it('routes simple landing pages to DeepSeek Pro', () => {
    const r = routePrompt('build a simple landing page for a coffee shop');
    assert.equal(r.builder, 'deepseek_v4_pro');
  });

  it('routes file analysis to Grok 4.3', () => {
    const r = routePrompt('analyze this PDF document upload');
    assert.equal(r.kind, 'file_analysis');
    assert.equal(r.builder, 'grok_4_3');
  });

  it('detects build prompts', () => {
    assert.equal(isBuildPrompt('build me a website'), true);
    assert.equal(isBuildPrompt('what is staking'), false);
  });

  it('routes unknown categories by requested operation instead of a whitelist', () => {
    const r = routePrompt('build a lunar moss accounting engine');
    assert.equal(r.kind.startsWith('build'), true);
    assert.equal(r.classification.primaryIntent, 'build');
  });

  it('does not route pure data research into a website build', () => {
    const r = routePrompt('research current public transport data APIs with sources');
    assert.equal(r.kind, 'research');
    assert.equal(r.classification.requiresCoding, false);
  });
});
