import { z } from 'zod';
import { states } from './inventory-schema.mjs';

const strings = z.array(z.string());
export const sourceSchema = z.object({ source_id: z.string(), filename: z.string(), path_or_url: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), byte_size: z.number().int().nonnegative(), modified_timestamp: z.string().nullable(),
  parse_status: z.enum(['PARSED_JSON', 'TEXT_READ', 'AST_METADATA', 'PINNED_SOURCE_METADATA', 'INACCESSIBLE_PENDING_EXPORT', 'PARSE_FAILED']),
  category: z.string(), authority: z.enum(['AUTHORITATIVE', 'ADVISORY', 'HISTORICAL', 'CURRENT_CODE']),
  analyzed: z.boolean(), notes: z.string() }).strict();
const requirementSchema = z.object({ requirement_id: z.string(), title: z.string(), description: z.string(), user_need: z.string(),
  source_refs: z.array(z.object({ source_id: z.string(), locator: z.string() }).strict()).min(1), feature_category: z.string(),
  classification: z.enum(['backend', 'frontend', 'infrastructure', 'security']), current_state: z.enum(states), current_paths: strings,
  implementation_owner_command: z.string().min(1), priority: z.enum(['P0', 'P1', 'P2']), dependencies: strings,
  provider_dependencies: strings, security_implications: strings, data_implications: strings, authority_implications: strings,
  cost_implications: strings, verification_method: z.string(), acceptance_criteria: strings.min(1), external_repo_candidates: strings,
  disposition: z.enum(['KEEP', 'EXTEND', 'REPLACE', 'DEPRECATE', 'NEW']), rationale: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']), unresolved_questions: strings, source_reported_states: strings }).strict();
export const ledgerSchema = z.object({ version: z.literal('1.0'), source_sha: z.string().regex(/^[a-f0-9]{40}$/),
  assessment: z.enum(['AVAILABLE_SOURCE_RECONCILIATION', 'FULL_HISTORICAL_COVERAGE']), requirements: z.array(requirementSchema),
  source_mappings: z.array(z.object({ source_id: z.string(), source_row_id: z.string(), requirement_id: z.string() }).strict()),
  coverage: z.object({ imported_available_rows: z.number().int(), mapped_available_rows: z.number().int(),
    historical_feature_rows_expected: z.literal(119), historical_feature_rows_supplied: z.number().int(), historical_feature_rows_mapped: z.number().int(),
    historical_missions_expected: z.literal(72), historical_missions_supplied: z.number().int(), historical_missions_mapped: z.number().int(),
    historical_coverage_complete: z.boolean(), deferred: strings }).strict(),
  contradictions: z.array(z.object({ id: z.string(), sources: strings, issue: z.string(), resolution: z.string() }).strict()),
}).strict();

export function validateLedger(ledger, sources, candidates, pathExists = () => true) {
  const parsed = ledgerSchema.parse(ledger);
  const sourceList = z.array(sourceSchema).parse(sources);
  const sourceIds = new Set(), requirements = new Map(), rowIds = new Set();
  for (const source of sourceList) {
    if (sourceIds.has(source.source_id)) throw new Error(`Duplicate source: ${source.source_id}`);
    sourceIds.add(source.source_id);
    if (source.parse_status === 'INACCESSIBLE_PENDING_EXPORT') {
      if (source.analyzed || source.sha256) throw new Error(`Inaccessible source falsely analyzed: ${source.source_id}`);
    } else if (!source.sha256) throw new Error(`Missing source hash: ${source.source_id}`);
  }
  const candidateNames = new Set(candidates.map(item => item.name));
  for (const candidate of candidates) {
    if (!['REFERENCE_ONLY', 'REJECT', 'VENDOR', 'INTEGRATE'].includes(candidate.decision)) throw new Error(`Missing candidate adoption decision: ${candidate.name}`);
    if (candidate.decision !== 'REFERENCE_ONLY' && candidate.decision !== 'REJECT' && (!candidate.commit || !candidate.licenseUrl || ['UNVERIFIED', 'NOASSERTION'].includes(candidate.license))) throw new Error(`Unverified dependency adoption: ${candidate.name}`);
  }
  for (const requirement of parsed.requirements) {
    if (requirements.has(requirement.requirement_id)) throw new Error(`Duplicate requirement: ${requirement.requirement_id}`);
    requirements.set(requirement.requirement_id, requirement);
    for (const ref of requirement.source_refs) if (!sourceIds.has(ref.source_id)) throw new Error(`Unknown source: ${ref.source_id}`);
    for (const path of requirement.current_paths) if (!pathExists(path)) throw new Error(`Missing repository evidence: ${path}`);
    if (requirement.current_state === 'IMPLEMENTED_AND_REACHABLE' && !requirement.current_paths.length) throw new Error(`Implemented requirement lacks repository evidence: ${requirement.requirement_id}`);
    for (const name of requirement.external_repo_candidates) if (!candidateNames.has(name)) throw new Error(`Unknown repository candidate: ${name}`);
  }
  for (const requirement of parsed.requirements) for (const dependency of requirement.dependencies) if (!requirements.has(dependency)) throw new Error(`Unknown requirement dependency: ${dependency}`);
  for (const mapping of parsed.source_mappings) {
    const key = `${mapping.source_id}:${mapping.source_row_id}`;
    if (rowIds.has(key)) throw new Error(`Source row maps more than once: ${key}`);
    rowIds.add(key);
    if (!sourceIds.has(mapping.source_id) || !requirements.has(mapping.requirement_id)) throw new Error(`Unresolved source mapping: ${key}`);
  }
  if (parsed.coverage.imported_available_rows !== parsed.source_mappings.length || parsed.coverage.mapped_available_rows !== parsed.source_mappings.length) throw new Error('Imported row coverage gap');
  if (parsed.coverage.historical_coverage_complete && (parsed.coverage.historical_feature_rows_mapped !== 119 || parsed.coverage.historical_missions_mapped !== 72)) throw new Error('False historical coverage completion');
  if(parsed.coverage.historical_coverage_complete) {
    const featureRows=parsed.source_mappings.filter(item=>item.source_row_id.startsWith('FEATURE-'));
    const missionRows=parsed.source_mappings.filter(item=>item.source_row_id.startsWith('MISSION-'));
    if(featureRows.length!==119 || new Set(missionRows.map(item=>item.source_row_id)).size!==72 || parsed.coverage.historical_feature_rows_supplied!==119 || parsed.coverage.historical_missions_supplied!==72) throw new Error('False historical coverage: original source mappings missing');
  }
  if (parsed.assessment === 'FULL_HISTORICAL_COVERAGE' && !parsed.coverage.historical_coverage_complete) throw new Error('Full coverage falsely claimed');
  return parsed;
}
export const ledgerJsonSchema = z.toJSONSchema(ledgerSchema, { target: 'draft-7' });
