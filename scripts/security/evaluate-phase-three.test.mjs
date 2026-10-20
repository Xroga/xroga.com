import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatePhaseThree, root } from './evaluate-phase-three.mjs';

const load = path => JSON.parse(readFileSync(`${root}/${path}`, 'utf8'));
const head = '1'.repeat(40);
const observations = {
  sourceSha: head,
  finalSourceCi: { status: 'PASS', sourceSha: head, url: 'https://github.com/Xroga/xroga.com/actions/runs/1' },
  integratedCi: { status: 'PASS', featureSha: head, url: 'https://github.com/Xroga/xroga.com/actions/runs/2' },
  productionKms: { status: 'BLOCKED_UNSPECIFIED_NOT_VERIFIED' },
};

test('Phase3 evaluator accepts complete software proof while preserving the production KMS blocker', () => {
  const result = evaluatePhaseThree({ evidence: load('docs/xroga/evidence/phase-3-manifest.json'), observations, head });
  assert.equal(result.result, 'CODE_READY_KMS_CUTOVER_BLOCKED');
  assert.equal(result.criteria, 22);
});

test('Phase3 evaluator rejects missing, rewritten and fabricated proof', () => {
  const evidence = load('docs/xroga/evidence/phase-3-manifest.json');
  assert.throws(() => evaluatePhaseThree({ evidence: { ...evidence, commandManifests: [evidence.commandManifests[0]] }, observations, head }));
  assert.throws(() => evaluatePhaseThree({ evidence, observations: { ...observations, sourceSha: '2'.repeat(40) }, head }), /current source/);
  const command = load('docs/xroga/evidence/command-008/manifest.json');
  command.criteria[0].originalText = 'Fabricated';
  const map = new Map([
    ['docs/xroga/batch-1/phases/PHASE-3-FROZEN-WORKLIST.json', load('docs/xroga/batch-1/phases/PHASE-3-FROZEN-WORKLIST.json')],
    ['docs/xroga/evidence/command-008/manifest.json', command],
    ['docs/xroga/evidence/command-009/manifest.json', load('docs/xroga/evidence/command-009/manifest.json')],
  ]);
  assert.throws(() => evaluatePhaseThree({ evidence, observations, head, loadJson: path => map.get(path),
    readText: path => readFileSync(`${root}/${path}`, 'utf8'), fileExists: () => true }), /Changed criterion text/);
});
