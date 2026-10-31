import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { responsePresentationCases, responsePresentationFixture } from './responsePresentationFixtures';
import { parseXrogaOutput } from './xrogaBlocks';
import { calculateValues } from './xrogaCalculations';

test('presentation specimens use the existing validated output contract', () => {
  for (const name of responsePresentationCases) {
    const messages = responsePresentationFixture(name)!;
    assert.equal(messages.length, 2);
    assert.match(messages[0].content, /Synthetic data, no model call/);
    const output = messages[1].featureOutput;
    if (output) assert.ok(parseXrogaOutput(output), name);
    if (['chart', 'calculator', 'diagram'].includes(name)) assert.ok(output, name);
  }
  assert.equal(responsePresentationFixture('__proto__'), undefined);
  assert.equal(responsePresentationFixture('<script>'), undefined);
});

test('calculator specimen has an honest, deterministic result', () => {
  const output = parseXrogaOutput(responsePresentationFixture('calculator')![1].featureOutput)!;
  const block = output.blocks.find((item) => item.type === 'calculator');
  assert.ok(block?.type === 'calculator');
  assert.equal(calculateValues(block.operation, block.inputs.map((input) => input.value)), 500);
  assert.match(block.description!, /Assumption/);
});

test('specimens are server gated from production and never replace existing messages', () => {
  const page = readFileSync('frontend/src/app/(workspace)/workspace/page.tsx', 'utf8');
  assert.match(page, /process.env.VERCEL_ENV === 'preview'/);
  assert.match(page, /process.env.NODE_ENV === 'development'/);
  const view = readFileSync('frontend/src/components/dashboard/DashboardView.tsx', 'utf8');
  assert.match(view, /hydrated && profile && !messages.length && !loading && !sessionRestoring/);
  const transcript = readFileSync('frontend/src/components/terminal/SwarmMessageLog.tsx', 'utf8');
  assert.match(transcript, /onPreviewUpdate=\{previewMessages \? undefined : updateFeatureOutput\}/);
});
