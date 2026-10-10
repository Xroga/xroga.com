import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_ASSETS, DEMO_PROJECTS, FOUNDER_DEMO_FLOW, INITIAL_WORKFLOW, nextDemoStage, validateDemoWorkflow } from './osCommand2';
import { PREVIEW_DESTINATIONS } from './osPreviewNavigation';

test('clinic story has a consistent asset, worker, artifact and deterministic progression', () => {
  const clinic = DEMO_PROJECTS.find((project) => project.id === 'clinic')!;
  assert.equal(DEMO_ASSETS.find((asset) => asset.id === clinic.proposedAsset)?.trust, 'approved-demo');
  assert.equal(clinic.artifact, 'booking-concept');
  let stage = nextDemoStage('request');
  for (let index = 0; index < 4; index++) stage = nextDemoStage(stage);
  assert.equal(stage, 'example-complete');
  assert.equal(nextDemoStage(stage), stage);
});

test('browser and repair stories retain distinct fixtures and navigation targets', () => {
  assert.notEqual(DEMO_PROJECTS[1].artifact, DEMO_PROJECTS[2].artifact);
  for (const slug of ['browser','automations','coding','bench']) assert.ok(PREVIEW_DESTINATIONS.some((item) => item.slug === slug));
});

test('workflow dry-run validation detects missing approval, broken links and cycles', () => {
  assert.deepEqual(validateDemoWorkflow(INITIAL_WORKFLOW), []);
  assert.ok(validateDemoWorkflow(INITIAL_WORKFLOW.filter((node) => node.kind !== 'approval')).some((error) => error.includes('approval')));
  assert.ok(validateDemoWorkflow(INITIAL_WORKFLOW.map((node) => node.id === 'condition-1' ? { ...node, next:'output-1' } : node)).some((error) => error.includes('trigger path')));
  assert.ok(validateDemoWorkflow(INITIAL_WORKFLOW.map((node) => node.id === 'output-1' ? { ...node, next:'trigger-1' } : node)).some((error) => error.includes('cycle')));
});

test('public navigation contains no founder destination or diagnostics payload', () => {
  assert.equal(PREVIEW_DESTINATIONS.some((item) => /founder|diagnostic/i.test(item.slug)), false);
  assert.equal(DEMO_ASSETS.find((asset) => asset.id === 'restricted-kit')?.trust, 'rejected-license');
});

test('founder fictional story includes pain, repository, license, experiment and decision', () => {
  assert.deepEqual(FOUNDER_DEMO_FLOW.map((step) => step.id), ['pain','repository','license','experiment','decision']);
  assert.ok(FOUNDER_DEMO_FLOW.every((step) => !/https?:\/\//.test(step.detail)));
});
