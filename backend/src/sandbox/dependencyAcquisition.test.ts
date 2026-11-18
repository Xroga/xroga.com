import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AcquisitionError, buildAcquisitionPlan, classifyLicence, type RegistryGet } from './dependencyAcquisition.js';

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const INTEGRITY = `sha512-${'A'.repeat(86)}==`;

const registry: RegistryGet = async (url) => {
  if (url.includes('pypi.org/pypi/rich/')) return { info: { license: 'MIT License', classifiers: [] }, urls: [{ packagetype: 'bdist_wheel', digests: { sha256: H1 } }, { packagetype: 'sdist', digests: { sha256: H2 } }] };
  if (url.includes('pypi.org/pypi/gpl-thing/')) return { info: { license: 'GNU General Public License v3 (GPLv3)' }, urls: [{ packagetype: 'bdist_wheel', digests: { sha256: H2 } }] };
  if (url.includes('pypi.org/pypi/sdist-only/')) return { info: { license: 'MIT' }, urls: [{ packagetype: 'sdist', digests: { sha256: H1 } }] };
  if (url.includes('registry.npmjs.org/@scope%2Fmcp-thing/')) return { dist: { integrity: INTEGRITY }, license: 'SEE LICENSE IN LICENSE' };
  if (url.includes('registry.npmjs.org/left-pad/')) return { dist: { integrity: INTEGRITY }, license: 'MIT' };
  throw new AcquisitionError('NOT_FOUND', 'The registry does not list that exact version.');
};

test('licences: clearly permissive passes; copyleft, custom and undeclared need a human', () => {
  for (const ok of ['MIT', 'MIT License', 'Apache-2.0', '(MIT OR Apache-2.0)', 'BSD-3-Clause', 'ISC', 'Apache Software License']) assert.equal(classifyLicence(ok), 'permissive', ok);
  for (const review of ['GPL-3.0-only', 'GNU General Public License v3 (GPLv3)', 'AGPL-3.0', 'SEE LICENSE IN LICENSE', 'Proprietary', 'Business Source License 1.1', 'MIT but not for military use']) assert.equal(classifyLicence(review), 'review', review);
  assert.equal(classifyLicence(''), 'unknown');
});

test('pip: exact versions only; every wheel hash is pinned; the install refuses unhashed and source-built packages', async () => {
  const plan = await buildAcquisitionPlan({ ecosystem: 'pip', packages: [{ name: 'rich', version: '13.7.1' }], get: registry });
  assert.equal(plan.ready, true);
  assert.equal(plan.files[0].content, `rich==13.7.1 --hash=sha256:${H1}\n`, 'the sdist hash is not accepted: only wheels');
  assert.deepEqual(plan.stages[0].args.slice(0, 5), ['-m', 'pip', 'install', '--require-hashes', '--only-binary=:all:']);
  assert.equal(plan.stages[0].networkPolicy, 'registry-only');
  for (const bad of ['13', '>=13.0', '13.*', 'latest', '13.7.1 ; evil', '']) await assert.rejects(buildAcquisitionPlan({ ecosystem: 'pip', packages: [{ name: 'rich', version: bad }], get: registry }), (e: AcquisitionError) => e.code === 'UNPINNED', bad);
  await assert.rejects(buildAcquisitionPlan({ ecosystem: 'pip', packages: [{ name: 'sdist-only', version: '1.0.0' }], get: registry }), (e: AcquisitionError) => e.code === 'NO_DIGEST');
  await assert.rejects(buildAcquisitionPlan({ ecosystem: 'pip', packages: [{ name: 'rich; rm -rf /', version: '1.0.0' }], get: registry }), (e: AcquisitionError) => e.code === 'UNPINNED');
});

test('a copyleft or undeclared licence makes the plan not ready until it is acknowledged by name', async () => {
  const pending = await buildAcquisitionPlan({ ecosystem: 'pip', packages: [{ name: 'rich', version: '1.0.0' }, { name: 'gpl-thing', version: '1.0.0' }], get: registry });
  assert.equal(pending.ready, false);
  assert.deepEqual(pending.needsReview.map((p) => p.name), ['gpl-thing']);
  const accepted = await buildAcquisitionPlan({ ecosystem: 'pip', packages: [{ name: 'rich', version: '1.0.0' }, { name: 'gpl-thing', version: '1.0.0' }], acknowledgedLicences: ['gpl-thing'], get: registry });
  assert.equal(accepted.ready, true);
});

test('npm: exact versions, registry integrity recorded, scripts never run, and an offline verify stage compares what npm installed', async () => {
  const plan = await buildAcquisitionPlan({ ecosystem: 'npm', packages: [{ name: 'left-pad', version: '1.3.0' }, { name: '@scope/mcp-thing', version: '2.2.1' }], get: registry });
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.needsReview.map((p) => p.name), ['@scope/mcp-thing']);
  assert.deepEqual(JSON.parse(plan.files[0].content).dependencies, { 'left-pad': '1.3.0', '@scope/mcp-thing': '2.2.1' });
  assert.ok(plan.stages[0].args.includes('--ignore-scripts'));
  assert.deepEqual(plan.stages.map((s) => [s.id, s.networkPolicy]), [['acquire:npm', 'registry-only'], ['verify:npm', 'none'], ['licences:npm', 'none']]);
  assert.ok(plan.files[1].content.includes(INTEGRITY));
  for (const bad of ['^1.3.0', '1.3', 'latest', '~1.0.0']) await assert.rejects(buildAcquisitionPlan({ ecosystem: 'npm', packages: [{ name: 'left-pad', version: bad }], get: registry }), (e: AcquisitionError) => e.code === 'UNPINNED', bad);
});

test('a version the registry does not list is refused, and the package count is bounded', async () => {
  await assert.rejects(buildAcquisitionPlan({ ecosystem: 'npm', packages: [{ name: 'left-pad', version: '9.9.9' }], get: async () => { throw new AcquisitionError('NOT_FOUND', 'x'); } }), (e: AcquisitionError) => e.code === 'NOT_FOUND');
  await assert.rejects(buildAcquisitionPlan({ ecosystem: 'npm', packages: [], get: registry }), (e: AcquisitionError) => e.code === 'INVALID');
});

test('weak copyleft (MPL) is a review item, not a silent pass', () => {
  assert.equal(classifyLicence('MPL-2.0'), 'review');
  assert.equal(classifyLicence('Mozilla Public License 2.0 (MPL 2.0)'), 'review');
});
