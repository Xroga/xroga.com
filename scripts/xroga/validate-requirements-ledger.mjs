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
  console.log(JSON.stringify({ result: 'PASS_AVAILABLE_SOURCE_GATE', requirements: ledger.requirements.length,
    mappedAvailableRows: ledger.source_mappings.length, registeredCandidates: candidates.length, emptyOwnerFields: 0,
    deferredOwnerAssignments: ledger.requirements.filter(item => item.implementation_owner_command === 'LATER_SOURCE_MAPPING_REVIEW').length,
    historicalFeatureCoverage: `${ledger.coverage.historical_feature_rows_mapped}/119 mapped (not implementation)`, historicalMissionCoverage: `${ledger.coverage.historical_missions_mapped}/72 mapped (not implementation)`,
    originalUnmodifiedSpecificationComplete: false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
