import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildRequirements, parseCommandRequirements, renderOutputs, root, validateFamilyOwnershipReview, validateHistoricalOwnershipReview } from './reconcile-requirements.mjs';
import { validateLedger } from './requirements-schema.mjs';
import { validateRepositoryLedger } from './validate-requirements-ledger.mjs';

function fixture() { return buildRequirements(); }
test('reviewed family ownership preserves unresolved history, private transcripts and unverified journeys', () => {
  const { ledger, sources } = fixture();
  assert.equal(ledger.requirements.filter(row => row.implementation_owner_command === 'LATER_SOURCE_MAPPING_REVIEW').length, 8);
  assert.equal(ledger.requirements.filter(row => row.unresolved_questions.some(question=>question.startsWith('Original normative requirement title'))).length,80);
  assert.equal(ledger.requirements.filter(row => row.requirement_id.startsWith('XR-HIST-')).length, 211);
  assert.ok(ledger.requirements.filter(row => row.requirement_id.startsWith('XR-HIST-')).every(row => row.current_state !== 'IMPLEMENTED_AND_REACHABLE'));
  const families = ledger.requirements.filter(row => row.requirement_id.startsWith('XR-FAMILY-'));
  assert.ok(families.every(row => row.implementation_owner_command !== 'LATER_SOURCE_MAPPING_REVIEW'));
  assert.ok(families.every(row => row.current_state !== 'IMPLEMENTED_AND_REACHABLE'));
  assert.equal(sources.filter(row => row.notes.includes('HASH_VERIFIED_SEMANTIC_REVIEW_PENDING') && !row.analyzed).length, 2);
  assert.ok(ledger.coverage.deferred.some(value => value.includes('transcript')));
  const matrix = JSON.parse(readFileSync(resolve(root, 'docs/xroga/golden-journey-matrix.json'), 'utf8'));
  const ids = new Set(ledger.requirements.map(row => row.requirement_id));
  assert.equal(matrix.journeys.length, 12);
  for (const journey of matrix.journeys) {
    assert.equal(journey.state, 'BLOCKED_KNOWN_GAP');
    for (const owner of journey.blockers.flatMap(row => row.ownerCommands)) {
      assert.ok(ids.has(owner.startsWith('MISSION-') ? `XR-${owner}` : `XB01-C${owner}`), owner);
    }
  }
});
test('historical ownership requires exact source bytes and complete nonduplicate row-specific review', () => {
  const review = JSON.parse(readFileSync(resolve(root, 'docs/xroga/research/historical-ownership-review.json'), 'utf8'));
  const original = JSON.parse(readFileSync(resolve(root, 'docs/xroga/research/derived-original-requirements.json'), 'utf8'));
  const readSource = path => {const text=readFileSync(resolve(root,path),'utf8').replace(/\r\n/g,'\n');return {text,document:JSON.parse(text)};};
  assert.equal(validateHistoricalOwnershipReview(review,original.missions,readSource).sources.flatMap(source=>source.groups.flatMap(group=>group.rows)).length,203);
  for(const mutate of [value=>{value.sources[0].sha256='0'.repeat(64);},value=>value.sources[0].groups[0].rows.pop(),value=>value.sources[0].groups[0].rows.push('R2.1'),value=>{value.sources[0].groups[0].primary=999;}]) {
    const bad=structuredClone(review);mutate(bad);assert.throws(()=>validateHistoricalOwnershipReview(bad,original.missions,readSource));
  }
});
test('family ownership rejects missing, duplicate, unknown and unsupported mission claims', () => {
  const review = JSON.parse(readFileSync(resolve(root, 'docs/xroga/research/family-ownership-review.json'), 'utf8'));
  const original = JSON.parse(readFileSync(resolve(root, 'docs/xroga/research/derived-original-requirements.json'), 'utf8'));
  const families = review.reviews.map(row => row.family);
  assert.equal(validateFamilyOwnershipReview(review, original.missions, families).reviews.length, 32);
  for (const mutate of [value => value.reviews.pop(), value => value.reviews.push(value.reviews[0]), value => {value.reviews[0].primary = 999;}, value => {value.reviews[0].reason = 'name match';}]) {
    const bad = structuredClone(review); mutate(bad);
    assert.throws(() => validateFamilyOwnershipReview(bad, original.missions, families));
  }
});
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
  assert.equal(sources.filter(item => item.parse_status === 'INACCESSIBLE_PENDING_EXPORT').length, 1);
  assert.equal(ledger.coverage.historical_coverage_complete, true);
  assert.equal(ledger.coverage.historical_feature_rows_mapped,119);
  assert.equal(ledger.coverage.historical_missions_mapped,72);
  assert.equal(ledger.requirements.filter(item=>item.requirement_id.startsWith('XR-ORIGINAL-')).length,119);
  assert.ok(ledger.requirements.filter(item=>item.requirement_id.startsWith('XR-ORIGINAL-')).every(item=>item.current_state==='UNKNOWN_BLOCKED'));
  validateRepositoryLedger(ledger, sources, repositories);
});
test('multiple source references and explicit aliases survive validation', () => {
  const { ledger, sources, repositories } = fixture();
  const requirement = ledger.requirements.find(item => item.requirement_id.startsWith('XR-FAMILY-'));
  assert.ok(requirement.source_refs.length > 1);
  const alias = structuredClone(ledger.source_mappings[0]); alias.source_row_id = 'EXPLICIT-TEST-ALIAS';
  ledger.source_mappings.push(alias); ledger.coverage.imported_available_rows++; ledger.coverage.mapped_available_rows++;
  assert.ok(validateLedger(ledger, sources, repositories));
  assert.throws(() => validateRepositoryLedger(ledger, sources, repositories), /source row|original source mappings/);
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
  assert.throws(() => validateRepositoryLedger(ledger, sources, repositories), /source row|original source mappings/);
});
test('inaccessible sources or incomplete original row mappings cannot claim analyzed or full coverage', () => {
  const { ledger, sources, repositories } = fixture();
  const dishonest = structuredClone(sources); dishonest.find(item => item.parse_status === 'INACCESSIBLE_PENDING_EXPORT').analyzed = true;
  assert.throws(() => validateLedger(ledger, dishonest, repositories), /falsely analyzed/);
  const full = structuredClone(ledger); full.coverage.historical_feature_rows_mapped = 118;
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
