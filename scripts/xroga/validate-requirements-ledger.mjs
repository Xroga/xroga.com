import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRequirements, renderOutputs, root } from './reconcile-requirements.mjs';
import { validateLedger } from './requirements-schema.mjs';

export function validateRepositoryLedger(ledger, sources, candidates) {
  validateLedger(ledger, sources, candidates, path => existsSync(resolve(root, path)));
  const actual = buildRequirements();
  const expected = actual.ledger.source_mappings.map(item => `${item.source_id}:${item.source_row_id}:${item.requirement_id}`).sort();
  const received = ledger.source_mappings.map(item => `${item.source_id}:${item.source_row_id}:${item.requirement_id}`).sort();
  if (JSON.stringify(expected) !== JSON.stringify(received)) throw new Error('An available authoritative/historical source row is unmapped or remapped without reconciliation');
  const owners=new Map(actual.ledger.requirements.map(r=>[r.requirement_id,r.implementation_owner_command]));
  for(const requirement of ledger.requirements)if(owners.get(requirement.requirement_id)!==requirement.implementation_owner_command)throw new Error(`Implementation command owner differs from source-grounded mapping: ${requirement.requirement_id}`);
  const actualHashes = new Map(actual.sources.map(item => [item.source_id, item.sha256]));
  for (const source of sources) if (actualHashes.get(source.source_id) !== source.sha256) throw new Error(`Source integrity drift: ${source.source_id}`);
  return true;
}
export function main() {
  const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const ledger = read('docs/xroga/requirements-ledger.json');
  const sources = read('docs/xroga/research/source-manifest.json').sources;
  const candidates = read('docs/xroga/research/repository-candidates.json');
  validateRepositoryLedger(ledger, sources, candidates);
  const fresh = buildRequirements();
  for (const [path, expected] of renderOutputs(fresh)) {
    if (readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n') !== expected) throw new Error(`Canonical ledger/output drift: ${path}`);
  }
  const deferredOwners=ledger.requirements.filter(item=>item.implementation_owner_command.startsWith('LATER_')).length;
  const originalAcceptanceComplete=ledger.coverage.historical_feature_rows_mapped===119&&ledger.coverage.historical_missions_mapped===72
    &&deferredOwners===0&&sources.every(source=>source.parse_status==='INACCESSIBLE_PENDING_EXPORT'?!source.analyzed&&!source.sha256:!!source.sha256);
  console.log(JSON.stringify({ result: 'PASS_AVAILABLE_SOURCE_GATE', requirements: ledger.requirements.length,
    mappedAvailableRows: ledger.source_mappings.length, registeredCandidates: candidates.length, emptyOwnerFields: 0,
    deferredOwnerAssignments: ledger.requirements.filter(item => item.implementation_owner_command === 'LATER_SOURCE_MAPPING_REVIEW').length,
    historicalFeatureCoverage: `${ledger.coverage.historical_feature_rows_mapped}/119 mapped (not implementation)`, historicalMissionCoverage: `${ledger.coverage.historical_missions_mapped}/72 mapped (not implementation)`,
    originalAcceptanceCriteriaComplete: originalAcceptanceComplete,
    fullHistoricalNarrativeReviewComplete:sources.filter(source=>source.notes.includes('HASH_VERIFIED_SEMANTIC_REVIEW_PENDING')).every(source=>source.analyzed),
    limitation:'Criterion-level source/row/owner integrity is distinct from complete historical narrative analysis and future feature implementation' }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
