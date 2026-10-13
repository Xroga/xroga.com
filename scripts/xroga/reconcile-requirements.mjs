import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { candidates as expectedCandidates } from './research-candidates.mjs';
import { ledgerJsonSchema, validateLedger } from './requirements-schema.mjs';
import { validateDerivedResearch } from './import-private-research.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceId = path => `SRC-${hash(path).slice(0, 16)}`;
const sorted = values => [...new Set(values)].sort();
const read = path => {
  const value = readFileSync(resolve(root, path), 'utf8');
  return path === reportPath ? value : value.replace(/\r\n/g, '\n');
};
const emit = (path, content) => { mkdirSync(dirname(resolve(root, path)), { recursive: true }); writeFileSync(resolve(root, path), content); };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const reportPath = 'docs/xroga/research/inputs/batch-one-report.txt';
const sourceManifestPath = 'docs/xroga/research/source-manifest.json';
export const missingSources = [
  'https://chatgpt.com/share/6acd319b-8244-83ec-ae3f-dfe13f414569',
];
const reportSourceHash = 'a0926f4e47149450c3f9fc33c59782eac31d19be57789f11950b20b03c01b499';
const familyPaths = {
  'repository truth': /scripts\/xroga\/inventory/, 'research traceability': /scripts\/xroga\/(?:reconcile|requirements)/,
  'deterministic CI': /scripts\/ci\//, 'deployment dependencies': /runtimeContract|config\/(?:supabase|jobQueues|redis)/,
  'golden journeys': /e2e\//, 'engineering rules': /mission-check/,
  'tenant isolation': /middleware\/(?:auth|phase1Auth)|security\/tenant|ownership/,
  'authority/approval': /businessAction|operationsEngine|operations\/permissions/,
  'credentials': /oauthPkceStore|githubTokenStore|apiKeyVault|Credentials/,
  'egress security': /security\/egress|safeUrl|urlPolicy/,
  'canonical durable execution': /runStore|executionRuntime|SoftwareAgentRuntime|softwareAgentCheckpoint/,
  'schedulers': /taskGraphRunner|config\/jobQueues|ExecutionScheduler/,
  'cost/budget': /costLedger|costCeiling|providerBudget|quota/,
  'provenance/evidence': /measuredEvidence|verificationCompiler|researchEvidence/,
  'webhook replay/idempotency': /billingWebhook|businessActionConfirmations/,
  'long-running work': /runReconciler|runStore|softwareAgentCheckpoint/,
  'multi-intent requests': /semanticRequestPlanner|goalContract/,
  'user intent/relevance': /semanticRequestPlanner|capabilityRouter/,
  'Composio/dynamic tools': /composioClient|businessAction/,
  'browser execution': /browserVerificationAdapter|flyMachineSandbox|browserbase/,
  'GitHub coding': /githubMutation|githubAuth|softwareAgentImplementationAdapter/,
  'sandboxes': /sandbox\//, 'activity feeds': /terminalEventAdapter|xrogaEvent|runStore/,
  'Xroga Blocks': /xrogaBlocks|XrogaBlockView/,
  'rich AI UI': /xrogaRichResults|XrogaRichResultsView/,
  'products/flights/hotels/maps/cards/results': /xrogaRichResults|XrogaRichResultsView/,
  'file uploads': /projectFiles|routes\/media|ChatBarFileGrid/,
  'workflow/work packs': /dashboard\/automations|osCommand2/,
  'Activepieces': /dashboard\/automations/, 'AI Employees': /dashboard\/automations|osCommand2/,
  'app/site creation': /synthesis\/foundation|ai\/pipeline/,
  'deployment': /githubDeploy|deployVerify|shipVerify/,
  'Android/iOS publishing': /publish\/(?:easPublish|easCredentials|nonWebShip)/,
  'paid managed publishing': /routes\/(?:publish|billing)|BillingService/,
  'billing': /BillingService|billingWebhook|routes\/billing/,
  'web research/citations': /researchEvidence|webResearch|routes\/phase1/,
  'SEO': /organicIntelligence|growth-publishing/,
  'Drive/docs/slides/sheets': /dashboard\/library|xrogaDocument|artifactExport/,
  'security': /security\/|middleware\/auth/, 'observability': /metricsMiddleware|safeHealth|operationsEngine/,
  'verification': /verificationCompiler|webVerificationGate|measuredEvidence/,
  'recovery': /runReconciler|recovery|RepairLoop/,
  'completion semantics': /verificationLifecycle|completion|shipVerify/,
};
const familyOwners = { 'repository truth': '001', 'research traceability': '002', 'deterministic CI': '003',
  'deployment dependencies': '004', 'golden journeys': '005', 'engineering rules': '006', 'tenant isolation': '007',
  'authority/approval': '008', 'credentials': '009', 'egress security': '010', 'security': '010' };
const familyCandidates = { 'Activepieces': ['Activepieces'], 'workflow/work packs': ['Activepieces'], 'browser execution': ['Playwright'],
  'Android/iOS publishing': ['Expo EAS CLI', 'Fastlane'], 'golden journeys': ['Playwright', 'AppWorld', 'MCPMark'],
  'deterministic CI': ['Schemathesis', 'Pact JS', 'Testcontainers', 'Toxiproxy'], 'tenant isolation': ['OpenFGA', 'Open Policy Agent'],
  'authority/approval': ['OpenFGA', 'Open Policy Agent'], 'egress security': ['ToolHive', 'Snyk Agent Scan', 'Trivy'],
  'rich AI UI': ['Iconify', 'json-render', 'assistant-ui/tool-ui', 'Motion'], 'products/flights/hotels/maps/cards/results': ['MapLibre GL JS'],
  'file uploads': ['Uppy'], 'GitHub coding': ['Monaco Editor'], 'schedulers': ['LLMCompiler'] };

export function parseCommandRequirements(report) {
  const sections = report.split(/^COMMAND (\d{3}) — ([^\r\n]+)$/m);
  const records = [];
  for (let index = 1; index < sections.length; index += 3) {
    const number = sections[index], title = sections[index + 1], body = sections[index + 2];
    const acceptance = body.split('ACCEPTANCE CRITERIA')[1]?.split('EXACT EVIDENCE')[0] ?? '';
    const criteria = [...acceptance.matchAll(/^\d+\.\s+(.+)$/gm)].map(match => match[1].trim());
    if (!criteria.length) throw new Error(`Missing full acceptance criteria for Command ${number}`);
    records.push({ number, title, body, criteria, mission: (body.match(/Mission:\s*([\s\S]*?)(?=\n(?:GOAL|The LLM))/)?.[1] ?? title).trim(),
      goal: (body.match(/GOAL\s*\n([^\n]+)/)?.[1] ?? title).trim() });
  }
  if (records.length !== 10) throw new Error(`Expected ten actual command specifications, got ${records.length}`);
  return records;
}

export function buildRequirements() {
  const original=validateDerivedResearch(JSON.parse(read('docs/xroga/research/derived-original-requirements.json')));
  const report = read(reportPath);
  if (hash(report) !== reportSourceHash) throw new Error('Authoritative report integrity mismatch');
  const inventory = JSON.parse(read('docs/xroga/current-state.json'));
  const paths = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).sort();
  const previous = existsSync(resolve(root, sourceManifestPath)) ? JSON.parse(read(sourceManifestPath)) : null;
  const previousById = new Map((previous?.sources ?? []).map(item => [item.source_id, item]));
  const sourcePaths = sorted([reportPath, 'docs/xroga/current-state.json', 'docs/xroga/research/repository-candidates.json', 'docs/xroga/research/derived-original-requirements.json',
    ...paths.filter(path => /^docs\//.test(path) && !path.startsWith('docs/xroga/') && !path.startsWith('docs/implementation/batch-01/') && /\.(?:md|json|csv)$/.test(path)),
    ...['AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'DEPLOY.md', 'ROUTING.md', 'SECURITY.md', 'SHIP_COMPLETENESS.md', 'OWNER_SETUP.md'].filter(path => paths.includes(path))]);
  const sources = [], parsedDocuments = new Map();
  for (const path of sourcePaths) {
    const bytes = Buffer.from(read(path), 'utf8'), digest = hash(bytes), id = sourceId(path);
    let parseStatus = 'TEXT_READ';
    if (path.endsWith('.json')) {
      try { parsedDocuments.set(path, JSON.parse(bytes)); parseStatus = 'PARSED_JSON'; } catch { parseStatus = 'PARSE_FAILED'; }
    }
    sources.push({ source_id: id, filename: basename(path), path_or_url: path, sha256: digest, byte_size: bytes.length,
      modified_timestamp: previousById.get(id)?.sha256 === digest ? previousById.get(id).modified_timestamp : statSync(resolve(root, path)).mtime.toISOString(),
      parse_status: parseStatus, category: path === reportPath ? 'BATCH_SPECIFICATION' : 'REPOSITORY_DOCUMENT',
      authority: path === reportPath ? 'AUTHORITATIVE' : 'ADVISORY', analyzed: parseStatus !== 'PARSE_FAILED',
      notes: path === reportPath ? 'Exact attachment bytes; full ten-command report; source coverage amendment recorded in tracker' : 'Git-canonical LF text bytes ingested; historical completion claims are not current verification' });
  }
  for (const surface of inventory.surfaces) {
    const bytes = Buffer.from(read(surface.sourcePath), 'utf8'), id = sourceId(surface.sourcePath), digest = hash(bytes);
    sources.push({ source_id: id, filename: basename(surface.sourcePath), path_or_url: surface.sourcePath, sha256: digest, byte_size: bytes.length,
      modified_timestamp: previousById.get(id)?.sha256 === digest ? previousById.get(id).modified_timestamp : statSync(resolve(root, surface.sourcePath)).mtime.toISOString(),
      parse_status: 'AST_METADATA', category: 'SOURCE_CODE', authority: 'CURRENT_CODE', analyzed: true,
      notes: 'Git-canonical LF source bytes and AST/import metadata, not manual behavioral verification' });
  }
  for (const path of missingSources) sources.push({ source_id: sourceId(path), filename: basename(path), path_or_url: path,
    sha256: null, byte_size: 0, modified_timestamp: null, parse_status: 'INACCESSIBLE_PENDING_EXPORT', category: 'HISTORICAL_RESEARCH',
    authority: 'HISTORICAL', analyzed: false, notes: path.startsWith('https:') ? 'Direct retrieval attempted; shared page unavailable. No contents claimed read.' : 'Not supplied/found; user explicitly authorized deferred reconciliation.' });
  const reportId = sourceId(reportPath), inventoryId = sourceId('docs/xroga/current-state.json');
  const archive='Xroga_OS_Complete_Codex_Source_Bundle_2026-10-13.zip';
  const originalPath=path=>`${archive}#${path}`;
  for(const item of original.sources) sources.push({source_id:sourceId(originalPath(item.path)),filename:basename(item.path),path_or_url:originalPath(item.path),sha256:item.sha256,byte_size:item.byte_size,modified_timestamp:null,
    parse_status:item.ingestion==='HASH_VERIFIED_SEMANTIC_REVIEW_PENDING'?'PINNED_SOURCE_METADATA':item.path.endsWith('.json')?'PARSED_JSON':'TEXT_READ',
    category:'ORIGINAL_RESEARCH_REQUIREMENTS',authority:'HISTORICAL',analyzed:item.ingestion!=='HASH_VERIFIED_SEMANTIC_REVIEW_PENDING',
    notes:`Exact original bytes verified outside Git; ${item.ingestion}. CI verifies derived snapshot/provenance, not access to private originals. Never implementation or license-admission evidence.`});
  const requirements = [], source_mappings = [];
  const base = (id, title, description, userNeed, refs, category, paths, owner, criteria) => ({
    requirement_id: id, title, description, user_need: userNeed, source_refs: refs, feature_category: category,
    classification: /tenant|authority|credential|egress|security/.test(category) ? 'security' : /UI|Blocks|cards/.test(category) ? 'frontend' : /CI|truth|traceability|deployment|engineering|golden/.test(category) ? 'infrastructure' : 'backend',
    current_state: paths.length ? 'IMPLEMENTED_BUT_UNVERIFIED' : 'PROPOSED_ONLY', current_paths: paths,
    implementation_owner_command: owner, priority: /tenant|authority|credential|egress|security|CI/.test(category) ? 'P0' : 'P1',
    dependencies: [], provider_dependencies: [], security_implications: ['Tenant, authority, secret and egress boundaries must pass the applicable negative tests'],
    data_implications: ['Preserve user data; isolated fixtures only in PR CI'], authority_implications: ['Model/document/tool text cannot authorize consequential operations'],
    cost_implications: ['No uncontrolled provider spending or real charges in ordinary verification'],
    verification_method: 'Execute the requirement acceptance criteria against current source; source filenames and historical status labels alone do not prove completion',
    acceptance_criteria: criteria, external_repo_candidates: [], disposition: paths.length ? 'EXTEND' : 'NEW',
    rationale: 'Preserve current implementation candidates and verify their behavior before selecting replacement; no researched dependency is automatically adopted',
    confidence: 'MEDIUM', unresolved_questions: owner === 'LATER_PENDING_HISTORICAL_EXPORT' ? ['Original sources are now supplied; precise mapping of this earlier record still requires semantic review, not a guessed mission assignment'] : [], source_reported_states: [] });
  const commands = parseCommandRequirements(report);
  for (const command of commands) {
    const evidence = `docs/xroga/evidence/command-${command.number}/manifest.json`;
    const paths = existsSync(resolve(root, evidence)) ? [evidence] : [];
    const record = base(`XB01-C${command.number}`, command.title, command.mission, command.goal,
      [{ source_id: reportId, locator: `COMMAND ${command.number}, full specification and acceptance criteria` }], `batch-command-${command.number}`, paths, command.number, command.criteria);
    record.dependencies = Number(command.number) > 1 ? [`XB01-C${String(Number(command.number) - 1).padStart(3, '0')}`] : [];
    if (command.number === '001' && paths.length) {
      record.current_state = 'IMPLEMENTED_AND_REACHABLE'; record.disposition = 'KEEP'; record.confidence = 'HIGH';
      record.verification_method = 'Command 001 evidence manifest: deterministic schema/drift gate and nine passed inventory tests; application runtime remains separately unverified';
    }
    requirements.push(record);
    source_mappings.push({ source_id: reportId, source_row_id: `COMMAND-${command.number}`, requirement_id: record.requirement_id });
  }
  const familySection = report.split('MANDATORY CAPABILITY FAMILIES')[1]?.split('EXTERNAL REPOSITORY CANDIDATES THAT MUST APPEAR')[0] ?? '';
  const families = [...familySection.matchAll(/^- (.+)$/gm)].map(match => match[1].trim());
  for (const family of families) {
    const paths = inventory.surfaces.filter(item => familyPaths[family]?.test(item.sourcePath)).map(item => item.sourcePath);
    const owner = familyOwners[family] ?? 'LATER_PENDING_HISTORICAL_EXPORT';
    const id = `XR-FAMILY-${family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`;
    const record = base(id, family, `Capability family explicitly required by the supplied Batch One report: ${family}.`,
      'Retain this discovered capability in the canonical traceability ledger; verify its user journey before claiming it operational',
      [{ source_id: reportId, locator: `Command 002 mandatory capability family: ${family}` }, { source_id: inventoryId, locator: 'Candidate source surfaces and current-state evidence' }], family, paths, owner,
      [`The ${family} capability has explicit current evidence or a documented gap`, 'Relevant journey has independently verified outcome evidence and applicable negative tests']);
    record.external_repo_candidates = familyCandidates[family] ?? [];
    record.dependencies = [`XB01-C${owner === 'LATER_PENDING_HISTORICAL_EXPORT' ? '005' : owner}`];
    record.rationale += '; matched paths are inspection candidates, not keyword-based proof of functional completion';
    if (paths.length && paths.every(path => /os-preview|osCommand2|dashboard\/automations|dashboard\/library/.test(path))) record.current_state = 'PLACEHOLDER';
    requirements.push(record);
    source_mappings.push({ source_id: reportId, source_row_id: `FAMILY:${family}`, requirement_id: id });
  }
  for (const [path, document] of parsedDocuments) {
    if (path.startsWith('docs/xroga/') || !Array.isArray(document.requirements)) continue;
    for (const row of document.requirements) {
      const rowId = String(row.id ?? row.requirement_id ?? hash(JSON.stringify(row)).slice(0, 16));
      const title = row.title ?? `Historical requirement ${rowId}`;
      const candidatePaths = sorted([...(row.affectedFiles ?? []), ...(row.files ?? []), ...(row.filesChanged ?? []), ...(row.current_paths ?? [])].filter(value => typeof value === 'string'));
      const currentPaths = candidatePaths.filter(value => existsSync(resolve(root, value)));
      const id = `XR-HIST-${hash(`${path}:${rowId}`).slice(0, 16)}`;
      const record = base(id, title, row.description ?? row.actualBehaviour ?? row.currentImplementation ?? 'Historical source record retained without inventing an unavailable description',
        row.user_need ?? 'Original user need remains in the cited historical requirement; current acceptance must be re-established',
        [{ source_id: sourceId(path), locator: `requirements[id=${rowId}]` }], 'historical-repository-requirement', currentPaths,
        'LATER_PENDING_HISTORICAL_EXPORT', row.acceptance_criteria?.length ? row.acceptance_criteria : row.requiredTests?.length ? row.requiredTests.map(value => `Source-required verification: ${value}`) : ['Re-verify the cited historical requirement against current source and its journey']);
      record.source_reported_states = [row.classification, row.completionStatus, row.implementationState, row.verificationState, row.status, row.implementationStatus, row.verificationStatus].filter(value => typeof value === 'string');
      record.confidence = 'LOW';
      record.unresolved_questions.push(...candidatePaths.filter(value => !currentPaths.includes(value)).map(value => `Historical evidence path no longer exists: ${value}`));
      requirements.push(record);
      source_mappings.push({ source_id: sourceId(path), source_row_id: rowId, requirement_id: id });
    }
  }
  const missionId=number=>number<=10?`XB01-C${String(number).padStart(3,'0')}`:`XR-MISSION-${String(number).padStart(3,'0')}`;
  const manifestSource=sourceId(originalPath('codex/Xroga_OS_Codex_72_Command_Manifest_2026-10-13.json'));
  const markdownSource=sourceId(originalPath('codex/Xroga_OS_72_Codex_Missions_Full_Implementation_2026-10-13.md'));
  for(const mission of original.missions) {
    const refs=[{source_id:manifestSource,locator:`commands[number=${mission.number}]`},{source_id:markdownSource,locator:`Command ${String(mission.number).padStart(2,'0')}`}];
    let record=requirements.find(item=>item.requirement_id===missionId(mission.number));
    if(record) {
      record.source_refs.push(...refs);record.acceptance_criteria.push(`Original mission acceptance (not current proof): ${mission.acceptance}`);
      record.rationale+='; original missions 01–10 are explicit semantic aliases of the stricter Batch One specifications; neither source overrides unpassed gates';
    } else {
      record=base(missionId(mission.number),mission.title,mission.implementation,'Original planned outcome; independently implement and verify in the later mission, not Batch One',refs,mission.phase,[],`MISSION-${String(mission.number).padStart(3,'0')}`,[mission.acceptance]);
      record.dependencies=[missionId(mission.number-1)];record.source_reported_states=['REQUIREMENT_NOT_IMPLEMENTATION'];record.unresolved_questions=['Later-mission implementation is outside Batch One; current functional evidence must be established separately'];
      requirements.push(record);
    }
    for(const source_id of [manifestSource,markdownSource]) source_mappings.push({source_id,source_row_id:`MISSION-${String(mission.number).padStart(3,'0')}`,requirement_id:record.requirement_id});
  }
  const featureSource=sourceId(originalPath('codex/Xroga_OS_Feature_Coverage_119_Items_2026-10-13.csv'));
  for(const feature of original.features) {
    const record=base(`XR-ORIGINAL-F${String(feature.row).padStart(3,'0')}`,feature.feature,`Original ${feature.group} requirement. Source observed_state=${feature.observed_state}, test_result=${feature.test_result}; original owner, mission and evidence columns are empty.`,
      'Original requested capability; research is not proof of execution',[{source_id:featureSource,locator:`CSV data row ${feature.row}; ${feature.group}`}],feature.group,[],`MISSION-${String(feature.assessor_primary_mission).padStart(3,'0')}`,
      [`Independently verify ${feature.feature} with real evidence and applicable negative cases`,`Meet mapped mission acceptance: ${original.missions[feature.assessor_primary_mission-1].acceptance}`]);
    record.dependencies=[missionId(feature.assessor_primary_mission)];record.source_reported_states=[feature.observed_state,feature.test_result];record.confidence='LOW';
    record.rationale='Explicit assessor-selected primary mission, not an original CSV assignment or keyword-based runtime certification. Related family/history records remain separate until acceptance equivalence is reviewed.';
    record.unresolved_questions=['Original CSV contains no acceptance test/evidence/owner; proposed acceptance and owner are assessor annotations. No current functionality inferred.'];
    requirements.push(record);source_mappings.push({source_id:featureSource,source_row_id:`FEATURE-${String(feature.row).padStart(3,'0')}`,requirement_id:record.requirement_id});
  }
  for(const record of requirements) if(record.implementation_owner_command==='LATER_PENDING_HISTORICAL_EXPORT') record.implementation_owner_command='LATER_SOURCE_MAPPING_REVIEW';
  const ledger = { version: '1.0', source_sha: inventory.identity.sha, assessment: 'AVAILABLE_SOURCE_RECONCILIATION', requirements,
    source_mappings, coverage: { imported_available_rows: source_mappings.length, mapped_available_rows: source_mappings.length,
      historical_feature_rows_expected: 119, historical_feature_rows_supplied: original.features.length, historical_feature_rows_mapped: original.features.length,
      historical_missions_expected: 72, historical_missions_supplied: original.missions.length, historical_missions_mapped: original.missions.length, historical_coverage_complete: true,
      deferred: [...missingSources,'Original transcript semantic reconciliation (two hash-verified private files)','Earlier family/history semantic alias review (not missing exports)'] },
    contradictions: [
      { id: 'CONTRADICTION-TOOLCHAIN-DOCS', sources: ['AGENTS.md', 'frontend/package.json'], issue: 'AGENTS says Next.js 14; current manifest declares 15.5.21', resolution: 'Actual manifests/lockfiles govern; correct engineering documentation in Command 006' },
      { id: 'CONTRADICTION-HISTORICAL-COMPLETION', sources: ['SHIP_COMPLETENESS.md', 'docs/command-1/requirements-ledger.json', 'docs/xroga/current-state.json'], issue: 'Historical complete/live labels and old task-graph claims are not current acceptance evidence', resolution: 'Preserve historical labels as source_reported_states; current runtime requirements remain unverified until tested' },
      { id: 'CONTRADICTION-SOURCE-VS-IMPLEMENTATION', sources: ['Original source bundle', 'current repository evidence'], issue: '119 original rows say UNVERIFIED/NOT_RUN; owner and acceptance columns are empty', resolution: 'Map every row and mission while preserving unverified source states. Assessor mappings are planning annotations. Transcript semantic review and earlier alias review remain pending.' },
    ] };
  const repositories = JSON.parse(read('docs/xroga/research/repository-candidates.json'));
  for (const [name] of expectedCandidates) if (!repositories.some(item => item.name === name)) throw new Error(`Missing mandatory repository candidate: ${name}`);
  validateLedger(ledger, sources, repositories, path => existsSync(resolve(root, path)));
  return { ledger, sources, repositories, families, original };
}

export function renderOutputs({ ledger, sources, repositories, families }) {
  const out = new Map();
  out.set('docs/xroga/requirements-ledger.json', json(ledger));
  out.set('docs/xroga/requirements-ledger.schema.json', json(ledgerJsonSchema));
  out.set(sourceManifestPath, json({ version: '1.0', source_sha: ledger.source_sha, hash_policy: 'Exact preserved attachment bytes; repository text uses Git-canonical LF bytes for portable hashes and byte counts', sources }));
  const lines = ledger.requirements.map(item => `| ${item.requirement_id} | ${item.title.replace(/\|/g, '/')} | ${item.current_state} | ${item.implementation_owner_command} | ${item.disposition} |`);
  out.set('docs/xroga/requirements-ledger.md', `# Canonical Xroga requirements ledger\n\nApplication source SHA: \`${ledger.source_sha}\`. Original row coverage is **119/119 features and 72/72 missions**; this is requirements mapping, NOT implemented-product or fully verified Batch One status. All original features remain UNVERIFIED/NOT_RUN. Full original-transcript semantic review remains pending. Private originals are not committed; pinned hashes and derived planning records are retained.\n\n${ledger.requirements.length} requirements; ${ledger.source_mappings.length} source rows mapped; ${families.length} mandatory capability families; ${repositories.length} independently registered external candidates; zero newly adopted runtime dependencies. Original research lists additional candidates without granting adoption rights.\n\n| Requirement | Title | Current state | Owner command | Disposition |\n| --- | --- | --- | --- | --- |\n${lines.join('\n')}\n\n## Ownership and contradictions\n\nOriginal feature-to-mission assignments are explicit assessor annotations: the input CSV has empty owner/mission columns. Missions 01–10 alias the stricter Batch One records; later missions remain proposed and outside Batch One. \`LATER_SOURCE_MAPPING_REVIEW\` records earlier family/history aliases requiring semantic review, no longer missing exports. Preserve independent acceptance instead of guessing duplicate equivalence.\n\n${ledger.contradictions.map(item => `- ${item.id}: ${item.issue}. ${item.resolution}.`).join('\n')}\n\nReproduce with \`node scripts/xroga/reconcile-requirements.mjs\`; validate with \`node scripts/xroga/validate-requirements-ledger.mjs\`.\n`);
  const csv = value => `"${String(value).replace(/"/g, '""')}"`;
  out.set('docs/xroga/feature-coverage.csv', `requirement_id,title,current_state,owner_command,source_refs\n${ledger.requirements.map(item => [item.requirement_id, item.title, item.current_state, item.implementation_owner_command, item.source_refs.map(ref => `${ref.source_id}#${ref.locator}`).join(';')].map(csv).join(',')).join('\n')}\n`);
  out.set('docs/xroga/research/source-reconciliation.md', `# Source reconciliation\n\n${sources.filter(item => item.analyzed).length} ingested/derived sources; ${sources.filter(item => item.parse_status==='INACCESSIBLE_PENDING_EXPORT').length} inaccessible source; two hash-verified private transcripts still need complete semantic review. Code ingestion is AST metadata, not behavioral verification of every module.\n\nOriginal feature coverage: **119/119 supplied and mapped**. Original missions: **72/72 supplied and mapped** from BOTH the Markdown and manifest, checked for exact title/prompt correspondence during private import. All 119 original rows are UNVERIFIED/NOT_RUN with empty evidence/owner/mission/acceptance columns. Derived owners are explicitly assessor-selected planning annotations. Missions 01–10 alias the existing Batch One specifications; 11–72 are not executed in Batch One. Row reconciliation never proves implementation.\n\n## Deferred review\n\n${ledger.coverage.deferred.map(path => `- ${path}`).join('\n')}\n\nThe shared ChatGPT page remains inaccessible. No omitted contents invented. Original research repository proposals are RESEARCH_ONLY_NOT_ADOPTED; their license/commit claims require independent current review before use.\n\n## Source integrity and confidentiality\n\nArchive SHA256: \`1fd3bda7d1bce2697be94a7539b8c30d04a788fdb9b5ba9042ce161cc06913bf\`. All eight declared original file hashes and byte counts match. Originals remain outside Git. \`derived-original-requirements.json\` holds only normalized planning/provenance records, not transcripts, credentials or original prompts. CI verifies that pinned derivative and every row mapping; it does not pretend to reread private originals. Reimport with \`node scripts/xroga/import-private-research.mjs <private-extracted-dir> <original-zip>\`. Full source hashes/byte counts are in \`source-manifest.json\`; original-source timestamp is null rather than invented.\n`);
  out.set('docs/xroga/repository-candidate-register.md', `# External repository candidate register\n\nThese are references/candidates, not installed systems. Primary GitHub metadata is frozen in \`research/repository-candidates.json\`, including inspected commit, license path/blob and archival state. Mixed licenses, individual assets, transitive dependencies and actual integration require separate review before adoption.\n\n| Candidate | License metadata | Maintenance | Decision | Purpose |\n| --- | --- | --- | --- | --- |\n${repositories.map(item => `| [${item.name}](${item.url}) | ${item.licenseUrl ? `[${item.license}](${item.licenseUrl})` : item.license} | ${item.maintenanceStatus} | ${item.decision} | ${item.purpose} |`).join('\n')}\n\nNo candidate changes Xroga's current task graph, auth, billing, transport, renderer or deployment. Existing Playwright/Motion dependencies remain governed by their current manifests/lockfiles, not the reference repository's latest commit. \`assistant-ui/tool-ui\` archival/maintenance state comes from the frozen inspected metadata rather than assuming the report's claim is current.\n`);
  return out;
}
export function main(args = process.argv.slice(2)) {
  const reportArg = args.indexOf('--report');
  if (reportArg >= 0) {
    const bytes = readFileSync(args[reportArg + 1]);
    if (hash(bytes) !== reportSourceHash) throw new Error('Supplied report differs from the fully read authoritative attachment');
    emit(reportPath, bytes);
  }
  const result = buildRequirements();
  const outputs = renderOutputs(result);
  for (const [path, content] of outputs) {
    if (args.includes('--check')) {
      if (!existsSync(resolve(root, path)) || read(path).replace(/\r\n/g, '\n') !== content) throw new Error(`Requirements drift: ${path}`);
    } else emit(path, content);
  }
  console.log(JSON.stringify({ result: args.includes('--check') ? 'PASS_AVAILABLE_SOURCES' : 'GENERATED', requirements: result.ledger.requirements.length,
    sources: result.sources.length, availableRows: result.ledger.source_mappings.length, families: result.families.length,
    candidates: result.repositories.length, historicalFeatureRows: `${result.ledger.coverage.historical_feature_rows_mapped}/119`, historicalMissions: `${result.ledger.coverage.historical_missions_mapped}/72`, historicalCoverageComplete: result.ledger.coverage.historical_coverage_complete, implementationComplete:false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
