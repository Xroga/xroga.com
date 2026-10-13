import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildRequirements, parseCommandRequirements, renderOutputs, root } from './reconcile-requirements.mjs';
import { validateLedger } from './requirements-schema.mjs';
import { validateRepositoryLedger } from './validate-requirements-ledger.mjs';

function fixture() { return buildRequirements(); }
test('full ten-command specifications retain exact acceptance criteria and mandatory family/source rows', () => {
  const report = readFileSync(resolve(root, 'docs/xroga/research/inputs/batch-one-report.txt'), 'utf8');
  const commands = parseCommandRequirements(report);
  assert.equal(commands.length, 10);
  assert.equal(commands[0].criteria.length, 10);
  assert.equal(commands[9].criteria.length, 12);
  const { ledger, sources, repositories, families } = fixture();
  assert.ok(families.includes('authority/approval'));
  assert.ok(families.includes('completion semantics'));
  assert.equal(ledger.source_mappings.length, ledger.coverage.imported_available_rows);
  assert.equal(repositories.length, 23);
  assert.ok(repositories.some(item => item.name === 'assistant-ui/tool-ui' && item.archived === true));
  assert.equal(sources.filter(item => item.parse_status === 'INACCESSIBLE_PENDING_EXPORT').length, 7);
  assert.equal(ledger.coverage.historical_coverage_complete, false);
  validateRepositoryLedger(ledger, sources, repositories);
});
test('multiple source references and explicit aliases survive validation', () => {
  const { ledger, sources, repositories } = fixture();
  const requirement = ledger.requirements.find(item => item.requirement_id.startsWith('XR-FAMILY-'));
  assert.ok(requirement.source_refs.length > 1);
  const alias = structuredClone(ledger.source_mappings[0]); alias.source_row_id = 'EXPLICIT-TEST-ALIAS';
  ledger.source_mappings.push(alias); ledger.coverage.imported_available_rows++; ledger.coverage.mapped_available_rows++;
  assert.ok(validateLedger(ledger, sources, repositories));
  assert.throws(() => validateRepositoryLedger(ledger, sources, repositories), /source row/);
});
test('duplicate requirement IDs, missing source hashes and unknown sources fail', () => {
  const { ledger, sources, repositories } = fixture();
  const duplicate = structuredClone(ledger); duplicate.requirements.push(duplicate.requirements[0]);
  assert.throws(() => validateLedger(duplicate, sources, repositories), /Duplicate requirement/);
  const missing = structuredClone(sources); missing.find(item => item.analyzed).sha256 = null;
  assert.throws(() => validateLedger(ledger, missing, repositories), /Missing source hash/);
  const unknown = structuredClone(ledger); unknown.requirements[0].source_refs[0].source_id = 'unknown';
  assert.throws(() => validateLedger(unknown, sources, repositories), /Unknown source/);
});
test('implemented-without-evidence and missing ownership fail', () => {
  const { ledger, sources, repositories } = fixture();
  const unsupported = structuredClone(ledger); unsupported.requirements[0].current_state = 'IMPLEMENTED_AND_REACHABLE'; unsupported.requirements[0].current_paths = [];
  assert.throws(() => validateLedger(unsupported, sources, repositories), /lacks repository evidence/);
  const unowned = structuredClone(ledger); unowned.requirements[0].implementation_owner_command = '';
  assert.throws(() => validateLedger(unowned, sources, repositories));
});
test('unmapped imported row fails even if someone edits the declared coverage counts', () => {
  const { ledger, sources, repositories } = fixture();
  ledger.source_mappings.pop(); ledger.coverage.imported_available_rows--; ledger.coverage.mapped_available_rows--;
  assert.throws(() => validateRepositoryLedger(ledger, sources, repositories), /source row/);
});
test('inaccessible sources and absent 119/72 input cannot be represented as analyzed or full coverage', () => {
  const { ledger, sources, repositories } = fixture();
  const dishonest = structuredClone(sources); dishonest.find(item => item.parse_status === 'INACCESSIBLE_PENDING_EXPORT').analyzed = true;
  assert.throws(() => validateLedger(ledger, dishonest, repositories), /falsely analyzed/);
  const full = structuredClone(ledger); full.coverage.historical_coverage_complete = true;
  assert.throws(() => validateLedger(full, sources, repositories), /False historical coverage/);
});
test('candidate adoption without a decision or proven license fails', () => {
  const { ledger, sources, repositories } = fixture();
  const missing = structuredClone(repositories); delete missing[0].decision;
  assert.throws(() => validateLedger(ledger, sources, missing), /Missing candidate adoption/);
  const unsafe = structuredClone(repositories); unsafe[0].decision = 'INTEGRATE'; unsafe[0].license = 'NOASSERTION';
  assert.throws(() => validateLedger(ledger, sources, unsafe), /Unverified dependency adoption/);
});
test('two reconciliations produce identical semantic and byte outputs', () => {
  assert.deepEqual(renderOutputs(fixture()), renderOutputs(fixture()));
});
