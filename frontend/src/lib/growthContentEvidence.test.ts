import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const evidence = readFileSync(new URL('../components/seo/GrowthEvidence.tsx', import.meta.url), 'utf8');
const github = readFileSync(new URL('./seoPhase2Content.ts', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../app/tools/production-readiness-checker/page.tsx', import.meta.url), 'utf8');

test('growth evidence uses optimized images with descriptive alt and captions', () => {
  assert.match(evidence, /from 'next\/image'/);
  assert.match(evidence, /alt={visual\.alt}/);
  assert.match(evidence, /<figcaption>/);
});

test('release workflow is accessible HTML rather than explanatory image text', () => {
  assert.match(evidence, /role="list"/);
  assert.match(evidence, /role="listitem"/);
  assert.match(evidence, /Release evidence workflow/);
});

test('data charts require real points and retain an accessible table and source', () => {
  assert.match(evidence, /if \(!points\.length\) return null/);
  assert.match(evidence, /<table>/);
  assert.match(evidence, /Source: {source}/);
});

test('GitHub FIX page uses public-safe product evidence and explicit limitations', () => {
  assert.match(github, /xroga-existing-repo-review-20260902\.png/);
  assert.match(github, /visuals: \[\{ type: 'ILLUSTRATION', src: '\/homepage\/all-in-one\/xroga-existing-repo-review-20260902\.png'/);
  assert.match(github, /no customer or private repository data/i);
  assert.match(github, /Repository access does not imply permission to merge or deploy/);
});

test('readiness tool gives a direct answer without inventing certification', () => {
  assert.match(readiness, /<DirectAnswer>/);
  assert.match(readiness, /does not certify the software/i);
  assert.match(readiness, /ReleaseEvidenceWorkflow/);
  assert.match(readiness, /href="\/auth\/signup">Use Xroga on your project/);
});
