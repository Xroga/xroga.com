import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');
const json = path => JSON.parse(read(path));
const argument = (args, name) => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} is required`);
  const value = args[index + 1].replaceAll('\\', '/');
  if (value.startsWith('/') || value.includes('..')) throw new Error(`${name} must be a repository-local artifact`);
  return value;
};

export function evaluatePhaseThree({ evidence, observations, head, loadJson = json, readText = read, fileExists = existsSync }) {
  assert.equal(evidence.scope, 'PHASE3_COMMAND008_009_SOURCE_EVIDENCE_NOT_RELEASE_AUTHORIZATION');
  assert.equal(evidence.acceptedPhaseTwoSource, 'a21a82029276d38d53c9e17c580a15f57b653fe3');
  assert.equal(evidence.phase4Started, false);
  assert.equal(evidence.productionEffects, false);
  const frozen = loadJson(evidence.frozenWorklist);
  assert.equal(frozen.criteria.length, 22);
  assert.equal(frozen.interfaces.length, 20);
  assert.equal(frozen.actionClasses.length, 12);
  assert.deepEqual(evidence.commandManifests, [
    'docs/xroga/evidence/command-008/manifest.json',
    'docs/xroga/evidence/command-009/manifest.json',
  ]);
  const manifests = evidence.commandManifests.map(loadJson);
  assert.deepEqual(manifests.map(item => item.command), ['008', '009']);
  const criteria = manifests.flatMap(item => item.criteria);
  assert.equal(criteria.length, 22);
  assert.equal(new Set(criteria.map(item => item.id)).size, 22);
  const actual = new Map(criteria.map(item => [item.id, item]));
  for (const expected of frozen.criteria) {
    const item = actual.get(expected.id);
    assert.ok(item, `Missing criterion evidence:${expected.id}`);
    assert.equal(item.originalText, expected.originalText, `Changed criterion text:${expected.id}`);
    assert.equal(item.status, 'SOFTWARE_VERIFIED', `Incomplete software criterion:${expected.id}`);
    assert.ok(item.proof?.path && item.proof?.marker, `Missing proof binding:${expected.id}`);
    assert.ok(fileExists(resolve(root, item.proof.path)) && readText(item.proof.path).includes(item.proof.marker), `Unavailable proof marker:${expected.id}`);
  }
  assert.deepEqual(manifests[0].actionClasses, frozen.actionClasses);
  assert.equal(manifests[0].providerEvidence, 'SYNTHETIC_PROVIDER_ONLY_NO_LIVE_EFFECT');
  assert.equal(manifests[1].productionKms.developmentFallbackAllowed, false);
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.equal(observations.sourceSha, head, 'Observations are not bound to current source');
  assert.equal(observations.finalSourceCi?.status, 'PASS', 'Final-source CI is incomplete');
  assert.equal(observations.finalSourceCi?.sourceSha, head, 'Final-source CI used another source');
  assert.equal(observations.integratedCi?.status, 'PASS', 'Integrated CI is incomplete');
  assert.equal(observations.integratedCi?.featureSha, head, 'Integrated CI used another feature source');
  assert.match(observations.finalSourceCi?.url ?? '', /^https:\/\/github\.com\/Xroga\/xroga\.com\/actions\/runs\/\d+$/);
  assert.match(observations.integratedCi?.url ?? '', /^https:\/\/github\.com\/Xroga\/xroga\.com\/actions\/runs\/\d+$/);
  const kmsComplete = observations.productionKms?.status === 'VERIFIED_MANAGED_PROVIDER_AND_CUTOVER';
  assert.equal(manifests[1].productionKms.status, kmsComplete
    ? 'VERIFIED_MANAGED_PROVIDER_AND_CUTOVER'
    : 'CODE_READY_GOOGLE_CLOUD_KMS_NOT_PROVISIONED_OR_VERIFIED');
  return { result: kmsComplete ? 'B1_P3_VERIFIED' : 'CODE_READY_KMS_CUTOVER_BLOCKED', criteria: 22,
    command008: '10/10_SOFTWARE_VERIFIED', command009: '12/12_SOFTWARE_VERIFIED', productionKms: observations.productionKms?.status ?? 'MISSING' };
}

export function main(args = process.argv.slice(2)) {
  const evidencePath = argument(args, '--evidence');
  const observationsPath = argument(args, '--observations');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const result = evaluatePhaseThree({ evidence: json(evidencePath), observations: json(observationsPath), head });
  if (args.includes('--require-complete') && result.result !== 'B1_P3_VERIFIED') throw new Error(`Phase3 acceptance BLOCKED:${result.result}`);
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
