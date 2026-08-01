import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOutputHasArtifacts, requireBuildArtifacts } from './buildOutputValidation.js';

describe('build output boundary', () => {
  it('rejects prose-only refusals so the provider chain can continue', () => {
    assert.throws(
      () => requireBuildArtifacts('I cannot create files because credentials are unavailable.', false),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { code?: string }).code === 'INVALID_BUILD_OUTPUT',
    );
  });

  it('accepts real project files and complete classic sites', () => {
    assert.equal(buildOutputHasArtifacts('```tsx path="app/page.tsx"\nexport default function Page(){return <main/>}\n```', false), true);
    assert.equal(buildOutputHasArtifacts('```html\n<!doctype html><html><body><main>Dashboard</main></body></html>\n```', false), true);
  });

  it('accepts patches only for repository updates', () => {
    const patch = '*** Update File: src/app.ts\n<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE';
    assert.equal(buildOutputHasArtifacts(patch, true), true);
    assert.equal(buildOutputHasArtifacts(patch, false), false);
  });
});
