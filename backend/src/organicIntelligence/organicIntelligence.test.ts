import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiVisibilityByPlatform, aiVisibilitySummary, classifyAction, classifyGapTypes, classifyGscRow, deduplicatePromptFamilies,
  detectFactProblems, detectOutdatedFactUsage, formatGaps, freshnessForEvidence, gscDemandScore, gscRowsForDemand,
  mentionIntersect, prioritizeOpportunity, validateAssociations, validateDemand, validateEntityGraph, validateEvidenceCollections,
} from './engine.js';
import { buildIntelligence } from './intelligence.js';
import { parseGscCsv, parseMentions, parsePromptObservations, parseVisibilityMetrics, AhrefsProvider } from './providers.js';
import { loadSource, validateCanonicalFactSources, type IntelligenceSource } from './repository.js';
import { renderReport } from './report.js';
import type { DemandItem, Evidence, FormatCoverage, Mention, OpportunityScores, PromptObservation, VisibilityMetric } from './model.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');

function runCli(command: string, flags: string[] = []): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, path.join(repoRoot, 'backend', 'src', 'organicIntelligence', 'cli.ts'), command, '--dry-run', ...flags], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const observedEvidence = (source: string): Evidence => ({
  source, sourceType: 'MANUAL_IMPORT', observedAt: '2026-09-20T00:00:00.000Z',
  lastVerifiedAt: '2026-09-20T00:00:00.000Z', verificationDue: null,
  confidence: 'OBSERVED', freshness: 'CURRENT',
});

async function focusedSource(): Promise<IntelligenceSource> {
  const source = structuredClone(await loadSource());
  const association = source.associations.find((item) => item.id === 'assoc.xroga.repository-native')!;
  const demand = source.demand.find((item) => item.id === 'topic.existing-repositories')!;
  return {
    ...source,
    associations: [{ ...association, desiredStrength: 5, currentStrength: 5 }],
    demand: [demand], promptObservations: [], mentions: [], formatCoverage: [], gscRows: [], visibilityMetrics: [],
  };
}

function observation(overrides: Partial<PromptObservation> = {}): PromptObservation {
  return {
    promptId: 'prompt-fixture', promptFamily: 'topic.existing-repositories',
    promptText: 'Which agent can work on an existing repository?', intent: 'evaluation', audience: 'developer',
    engine: 'ChatGPT', engineVersion: null, country: 'US', date: '2026-09-20', xrogaState: 'ABSENT',
    xrogaCitedUrl: null, mentionContext: 'Controlled audit sample', competitorsMentioned: ['competitor.lovable', 'competitor.bolt'],
    sourcesCited: ['https://example.com/source'], externalDomains: ['example.com'], narrativeAccuracy: 'UNKNOWN',
    sentiment: 'NEUTRAL', notes: null, observationMethod: 'MANUAL', sampleSize: 1, confidence: 'OBSERVED',
    ...overrides,
  };
}

function mention(overrides: Partial<Mention> = {}): Mention {
  return {
    id: 'mention-fixture', sourceDomain: 'example.com', sourceUrl: 'https://example.com/agents', pageTitle: 'AI agents',
    author: null, publicationType: 'editorial', brandEntityIds: [], mentionContext: null, linked: false, linkUrl: null,
    sentiment: 'NEUTRAL', topicClusterId: 'topic.existing-repositories', attribute: null,
    competitorIds: ['competitor.lovable', 'competitor.bolt', 'competitor.replit'], xrogaPresent: false,
    pageReferringDomains: 4, pageOrganicTraffic: 3, domainAuthority: 2, aiCitationFrequency: 3,
    contentFormat: 'comparison', commercialIntent: 4, editorialIndependence: 5, topicRelevance: 5,
    freshness: 'CURRENT', outreachFeasibility: 3, dateDiscovered: '2026-09-20', dateVerified: '2026-09-20',
    ...overrides,
  };
}

test('source entity graph, associations, canonical facts and relations validate', async () => {
  const source = await loadSource();
  assert.equal(validateEntityGraph(source.entities).length, 0);
  assert.equal(validateAssociations(source.associations, source.entities).length, 0);
  assert.equal(detectFactProblems(source.facts, new Date('2026-09-22T00:00:00.000Z')).length, 0);
  assert.equal((await validateCanonicalFactSources(source.facts)).length, 0);
  assert.ok(source.entities.some((item) => item.id === 'product.xroga'));
  assert.ok(source.facts.some((item) => item.factKey === 'pricing.pro' && (item.value as { priceUsd: number }).priceUsd === 25));
  assert.ok(source.entities.filter((entity) => entity.entityType === 'INTEGRATION').every((entity) => entity.publicUrls.every((url) => url.includes('/build-with/'))));
  assert.ok(source.facts.filter((fact) => fact.factKey.startsWith('integration.')).every((fact) => fact.affectedPublicPages.every((page) => !page.startsWith('/integrations/'))));
});

test('invalid and duplicate entity relations are reported rather than swallowed', async () => {
  const source = await loadSource();
  const invalid = { ...source.entities[0], relatedIds: ['missing.entity'], childIds: [source.entities[0].id] };
  const issues = validateEntityGraph([invalid, invalid]);
  assert.ok(issues.some((item) => item.code === 'DUPLICATE_ENTITY'));
  assert.ok(issues.some((item) => item.code === 'INVALID_ENTITY_RELATION'));
  assert.ok(issues.some((item) => item.code === 'SELF_RELATION'));
});

test('prompt families deduplicate by normalized meaning label', async () => {
  const source = await loadSource();
  const template = source.demand.find((item) => item.kind === 'PROMPT_FAMILY')!;
  const duplicate: DemandItem = { ...template, id: 'duplicate', value: `  ${template.value.toUpperCase()}! ` };
  const result = deduplicatePromptFamilies([...source.demand, duplicate]);
  assert.deepEqual(result.duplicates, ['duplicate']);
});

test('canonical fact usage and evidence freshness distinguish stale, due and unknown state', async () => {
  const source = await loadSource();
  const fact = source.facts.find((item) => item.factKey === 'pricing.pro')!;
  assert.equal(detectOutdatedFactUsage([fact], { '/pricing:pricing.pro': { priceUsd: 19 } })[0].code, 'OUTDATED_PAGE_USING_FACT');
  assert.equal(freshnessForEvidence({ lastVerifiedAt: '2026-09-01T00:00:00.000Z', verificationDue: '2026-09-20T00:00:00.000Z' }, new Date('2026-09-21T00:00:00.000Z')), 'STALE');
  assert.equal(freshnessForEvidence({ lastVerifiedAt: '2026-09-01T00:00:00.000Z', verificationDue: '2026-09-25T00:00:00.000Z' }, new Date('2026-09-21T00:00:00.000Z')), 'VERIFY_SOON');
  assert.equal(freshnessForEvidence({ lastVerifiedAt: null, verificationDue: null }), 'UNKNOWN');
});

test('six gap classes are independently detectable', () => {
  assert.deepEqual(classifyGapTypes({ competitorVisibility: true, xrogaVisibility: false, desiredAssociationMissing: true, requiredFormatMissing: true, externalSourceOmitsXroga: true, demandExists: true }), ['VISIBILITY', 'TOPIC', 'FORMAT', 'WEB_MENTION', 'DEMAND']);
  assert.deepEqual(classifyGapTypes({ xrogaVisibility: true, narrativeAccurate: false }), ['NARRATIVE']);
});

test('FIX BUILD INFLUENCE PRODUCT IGNORE decision engine respects control and product truth', () => {
  const common = { meaningfulDemand: true, controlledByXroga: true, adequateAssetExists: true, assetDeficient: true, externalSource: false };
  assert.equal(classifyAction({ ...common, productTruthSupported: true }), 'FIX');
  assert.equal(classifyAction({ ...common, productTruthSupported: true, adequateAssetExists: false }), 'BUILD');
  assert.equal(classifyAction({ ...common, productTruthSupported: true, controlledByXroga: false, externalSource: true }), 'INFLUENCE');
  assert.equal(classifyAction({ ...common, productTruthSupported: false }), 'PRODUCT');
  assert.equal(classifyAction({ ...common, productTruthSupported: true, duplicateOrLowValue: true }), 'IGNORE');
});

test('opportunity priority preserves UNKNOWN and explains evidence instead of inventing a total score', () => {
  const scores: OpportunityScores = {
    businessPotential: 5, searchDemand: 'UNKNOWN', promptDemand: 5, commercialProximity: 4,
    productFit: 5, searchIntentFit: 5, rankingAttainability: 'UNKNOWN', aiVisibilityGap: 'UNKNOWN',
    competitorGap: 'UNKNOWN', entityAssociationValue: 5, aiSatisfactionRisk: 2, clickDefensibility: 5,
    formatOpportunity: 4, existingAuthority: 2, evidenceAvailability: 4, conversionPotential: 5,
    maintenanceBurden: 2, strategicValue: 5,
  };
  const result = prioritizeOpportunity(scores);
  assert.equal(result.priority, 'P0');
  assert.ok(result.rationale.some((item) => item.includes('UNKNOWN')));
  assert.ok(result.rationale.every((item) => !item.includes('87')));
});

test('Ahrefs unavailable and plan-limited states are structured and non-fabricated', async () => {
  assert.equal((await new AhrefsProvider().load()).status, 'UNAVAILABLE');
  assert.equal((await new AhrefsProvider('configured').load()).status, 'PLAN_LIMITED');
  assert.deepEqual((await new AhrefsProvider('configured').load()).records, []);
  const empty = await new AhrefsProvider('configured', async () => []).load();
  assert.equal(empty.status, 'NO_DATA');
  const available = await new AhrefsProvider('configured', async () => [{ domainRating: 42 }]).load();
  assert.equal(available.status, 'AVAILABLE');
  assert.deepEqual(available.records, [{ domainRating: 42 }]);
  const failed = await new AhrefsProvider('configured', async () => { throw new Error('private provider payload'); }).load();
  assert.equal(failed.status, 'UNAVAILABLE');
  assert.doesNotMatch(failed.reason ?? '', /private provider payload/);
});

test('GSC CSV parses quoted data, percentages, classifications and rejects malformed imports', () => {
  const rows = parseGscCsv('query,page,country,device,date,clicks,impressions,ctr,position\n"agent, existing repo",https://xroga.com/ai-coding-agent,usa,desktop,2026-09-20,2,200,1%,8.5');
  assert.equal(rows[0].query, 'agent, existing repo');
  assert.equal(rows[0].ctr, 0.01);
  assert.deepEqual(classifyGscRow(rows[0]), ['POSITION_4_10', 'HIGH_IMPRESSIONS_LOW_CTR']);
  assert.throws(() => parseGscCsv('query,page\nfoo,https://xroga.com'), /missing date/);
  assert.throws(() => parseGscCsv('query,page,country,device,date,clicks,impressions,ctr,position\n"broken,https://xroga.com,usa,desktop,2026-09-20,0,1,0%,1'), /unterminated/);
  const reordered = parseGscCsv('position,ctr,impressions,clicks,date,page,query\n11.2,0.125,0,0,2026-09-20,"https://xroga.com/path?a=1,b=2","quoted url"');
  assert.equal(reordered[0].ctr, 0.125);
  assert.equal(reordered[0].impressions, 0);
  assert.equal(reordered[0].country, undefined);
  assert.throws(() => parseGscCsv('query,page,date,clicks,impressions,ctr,position\nfoo,https://xroga.com,2026-09-20,,1,0,1'), /empty clicks/);
  assert.throws(() => parseGscCsv('query,page,date,clicks,impressions,ctr,position\nfoo,https://xroga.com,2026-09-20,nope,1,0,1'), /invalid clicks/);
  assert.throws(() => parseGscCsv('query,page,date,clicks,impressions,ctr,position\nfoo,https://xroga.com,not-a-date,0,1,0,1'));
  assert.throws(() => parseGscCsv('not,csv'), /expected a header/);
  assert.throws(() => parseGscCsv('query,page,date,clicks,impressions,ctr,position\nfoo,https://xroga.com,2026-09-20,0,1,0,1\nfoo,https://xroga.com,2026-09-20,0,1,0,1'), /Duplicate GSC row/);
});

test('prompt observations are samples and metrics require real records', () => {
  assert.deepEqual(aiVisibilitySummary([]), { status: 'NO_DATA', sampleSize: 0 });
  const records = parsePromptObservations([{
    promptId: 'p1', promptFamily: 'repository work', promptText: 'Which system can inspect my repository?',
    intent: 'evaluation', audience: 'developer', engine: 'ChatGPT', engineVersion: null, country: null,
    date: '2026-09-20', xrogaState: 'CITED_LINKED', xrogaCitedUrl: 'https://xroga.com/ai-coding-agent',
    mentionContext: 'sample', competitorsMentioned: [], sourcesCited: ['https://xroga.com/ai-coding-agent'],
    externalDomains: [], narrativeAccuracy: 5, sentiment: 'POSITIVE', notes: null,
    observationMethod: 'MANUAL', sampleSize: 1, confidence: 'OBSERVED',
  }]) as PromptObservation[];
  assert.equal(aiVisibilitySummary(records).citationRate, 1);
  const platforms = aiVisibilityByPlatform([
    ...records,
    observation({ promptId: 'p2', engine: 'Perplexity', xrogaState: 'MENTIONED_UNLINKED', sampleSize: 2 }),
    observation({ promptId: 'p3', engine: 'Claude', xrogaState: 'ABSENT', sampleSize: 3 }),
    observation({ promptId: 'p4', engine: 'Copilot', xrogaState: 'INCORRECT_OR_MISLEADING', sampleSize: 1 }),
    observation({ promptId: 'p5', engine: 'Google AI', xrogaState: 'CITED_LINKED', sampleSize: 2 }),
  ]);
  assert.equal(platforms.find((item) => item.platform === 'Claude')?.absenceRate, 1);
  assert.equal(platforms.find((item) => item.platform === 'Perplexity')?.mentionRate, 1);
  assert.equal(platforms.find((item) => item.platform === 'Copilot')?.inaccurateRate, 1);
  assert.throws(() => parsePromptObservations([{}]), /Invalid prompt observation/);
  assert.throws(() => parsePromptObservations([observation(), observation()]), /Duplicate prompt observation/);
});

test('mention intersect requires competitor overlap and never fabricates authority', () => {
  const record: Mention = {
    id: 'm1', sourceDomain: 'example.com', sourceUrl: 'https://example.com/tools', pageTitle: 'Tools', author: null,
    publicationType: 'editorial', brandEntityIds: [], mentionContext: null, linked: false, linkUrl: null,
    sentiment: 'NEUTRAL', topicClusterId: 'topic.ai-coding-agents', attribute: null,
    competitorIds: ['competitor.alpha', 'competitor.beta'], xrogaPresent: false,
    pageReferringDomains: 'UNKNOWN', pageOrganicTraffic: 'UNKNOWN', domainAuthority: 'UNKNOWN', aiCitationFrequency: 'UNKNOWN',
    contentFormat: 'listicle', commercialIntent: 4, editorialIndependence: 4, topicRelevance: 5, freshness: 'CURRENT', outreachFeasibility: 3,
    dateDiscovered: '2026-09-20', dateVerified: null,
  };
  assert.equal(mentionIntersect([record]).length, 1);
  assert.equal(mentionIntersect([{ ...record, xrogaPresent: true }]).length, 0);
  assert.throws(() => parseMentions([{ ...record, sourceUrl: 'not-a-url' }]), /Invalid mention/);
});

test('format gaps require an observed preference signal, not only a missing format', async () => {
  const source = await loadSource();
  assert.equal(formatGaps(source.formatCoverage).length, 0);
  const signaled = { ...source.formatCoverage.find((item) => !item.exists)!, competitorsHaveFormat: true, evidence: [observedEvidence('https://example.com/video-serp')] };
  assert.deepEqual(formatGaps([signaled]), [signaled]);
});

test('intelligence and report expose product opportunities and missing data honestly', async () => {
  const source = await loadSource();
  const snapshot = await buildIntelligence(source);
  assert.equal(snapshot.validationIssues.length, 0);
  assert.ok(snapshot.gaps.length > 0);
  assert.ok(snapshot.opportunities.every((item) => item.rationale.length > 1 && item.remeasurementPlan.length > 20));
  assert.ok(snapshot.unknowns.some((item) => item.includes('Ahrefs')));
  const report = renderReport(snapshot);
  assert.match(report, /Six Brand Gaps/);
  assert.match(report, /Data missing \/ unknown/);
  assert.doesNotMatch(report, /AI Share of Voice: [0-9]/);
});

test('CLI validation and report commands execute as non-destructive dry runs', async () => {
  const validation = await runCli('validate');
  assert.equal(validation.code, 0, validation.stderr);
  assert.equal(JSON.parse(validation.stdout).valid, true);
  const report = await runCli('report');
  assert.equal(report.code, 0, report.stderr);
  assert.match(report.stdout, /Xroga Organic Intelligence Report/);
  assert.match(report.stderr, /Dry run/);
});

test('all six Brand Gap types are generated from realistic evidence paths', async () => {
  const scenarios: Array<{ expected: string; configure(source: IntelligenceSource): void }> = [
    { expected: 'VISIBILITY', configure: (source) => { source.promptObservations = [observation()]; } },
    { expected: 'NARRATIVE', configure: (source) => { source.promptObservations = [observation({ xrogaState: 'INCORRECT_OR_MISLEADING', competitorsMentioned: [] })]; } },
    { expected: 'TOPIC', configure: (source) => { source.associations[0] = { ...source.associations[0], currentStrength: 2 }; } },
    { expected: 'FORMAT', configure: (source) => {
      source.formatCoverage = [{
        topicClusterId: source.demand[0].id, format: 'VIDEO', exists: false, url: null,
        competitorsHaveFormat: true, googleRewardsFormat: true, aiEnginesCiteFormat: null,
        priority: 'P1', evidence: [observedEvidence('https://example.com/video-results')],
      }];
    } },
    { expected: 'WEB_MENTION', configure: (source) => { source.mentions = [mention()]; } },
    { expected: 'DEMAND', configure: (source) => {
      source.gscRows = [{ query: 'AI development for existing repositories', page: 'https://xroga.com/github-ai-coding-agent', date: '2026-09-20', clicks: 2, impressions: 500, ctr: 0.004, position: 14 }];
    } },
  ];
  for (const scenario of scenarios) {
    const source = await focusedSource();
    scenario.configure(source);
    const snapshot = await buildIntelligence(source, { now: new Date('2026-09-21T00:00:00.000Z') });
    assert.deepEqual([...new Set(snapshot.gaps.map((gap) => gap.gapType))], [scenario.expected], `${scenario.expected}: ${JSON.stringify(snapshot.gaps)}`);
    assert.ok(snapshot.gaps[0].evidence.length > 0);
    assert.notEqual(snapshot.gaps[0].evidenceQuality, 'UNKNOWN');
  }
});

test('real gap evidence reaches FIX BUILD INFLUENCE and PRODUCT opportunities without defaulting to FIX', async () => {
  const fixSource = await focusedSource();
  fixSource.associations[0] = { ...fixSource.associations[0], currentStrength: 2 };
  assert.deepEqual((await buildIntelligence(fixSource)).opportunities[0].actionTypes, ['FIX']);

  const buildSource = await focusedSource();
  buildSource.formatCoverage = [{ topicClusterId: buildSource.demand[0].id, format: 'VIDEO', exists: false, url: null, competitorsHaveFormat: true, googleRewardsFormat: null, aiEnginesCiteFormat: null, priority: 'P1', evidence: [observedEvidence('format study')] }];
  assert.deepEqual((await buildIntelligence(buildSource)).opportunities[0].actionTypes, ['BUILD']);

  const influenceSource = await focusedSource();
  influenceSource.mentions = [mention()];
  assert.deepEqual((await buildIntelligence(influenceSource)).opportunities[0].actionTypes, ['INFLUENCE']);

  const productSource = await focusedSource();
  productSource.entities = productSource.entities.map((entity) => entity.id === productSource.associations[0].entityId ? { ...entity, status: 'PLANNED' as const } : entity);
  productSource.associations[0] = { ...productSource.associations[0], status: 'CANDIDATE', productTruthStrength: 2 };
  productSource.demand[0] = { ...productSource.demand[0], dataStatus: 'AVAILABLE', evidence: [observedEvidence('validated unmet demand')] };
  const productSnapshot = await buildIntelligence(productSource);
  assert.deepEqual(productSnapshot.opportunities[0].actionTypes, ['PRODUCT']);
  assert.equal(productSnapshot.productOpportunities.length, 1);
  assert.match(productSnapshot.opportunities[0].recommendedWork[0], /do not publish claims/i);

  assert.equal(classifyAction({ productTruthSupported: true, meaningfulDemand: false, controlledByXroga: true, adequateAssetExists: false, assetDeficient: false, externalSource: false }), 'IGNORE');
});

test('GSC records affect actual demand gaps and keep NO_DATA, observed zero, and malformed data distinct', async () => {
  const source = await focusedSource();
  assert.equal(gscDemandScore([]), 'UNKNOWN');
  assert.equal(gscDemandScore([{ query: 'x', page: 'https://xroga.com/', date: '2026-09-20', clicks: 0, impressions: 0, ctr: 0, position: 0 }]), 0);
  const row = { query: 'AI development for existing repository', page: 'https://xroga.com/github-ai-coding-agent', date: '2026-09-20', clicks: 4, impressions: 1000, ctr: 0.004, position: 12 };
  source.gscRows = [row];
  assert.equal(gscRowsForDemand(source.gscRows, source.demand[0]).length, 1);
  const snapshot = await buildIntelligence(source);
  assert.equal(snapshot.providerStates.find((item) => item.provider === 'google-search-console-import')?.status, 'AVAILABLE');
  assert.equal(snapshot.gaps[0].gapType, 'DEMAND');
  assert.equal(snapshot.gaps[0].searchDemand, 4);
  assert.doesNotMatch(snapshot.unknowns.join('\n'), /Google Search Console: NO_DATA/);
});

test('visibility metrics require explicit observed zero and never infer zero from missing records', async () => {
  const source = await focusedSource();
  const evidence = [observedEvidence('manual visibility import')];
  const competitor: VisibilityMetric = { id: 'metric.competitor', entityId: 'competitor.lovable', platform: 'CHATGPT', metric: 'ENTITY_MENTIONS', value: 4, unit: 'samples', page: null, provider: 'manual', availability: 'AVAILABLE', evidence, topicClusterId: source.demand[0].id };
  source.visibilityMetrics = [competitor];
  assert.equal((await buildIntelligence(source)).gaps.length, 0);
  source.visibilityMetrics.push({ ...competitor, id: 'metric.xroga', entityId: 'product.xroga', value: 0 });
  const snapshot = await buildIntelligence(source);
  assert.equal(snapshot.gaps[0].gapType, 'VISIBILITY');
  assert.equal(snapshot.gaps[0].platform, 'CHATGPT');
  assert.throws(() => parseVisibilityMetrics([{ ...competitor, id: '' }]), /Invalid visibility metric/);
});

test('Mention Intersect rejects present and topically irrelevant publications and uses page-level evidence', () => {
  const publicationA = mention({ id: 'a' });
  const publicationB = mention({ id: 'b', xrogaPresent: true, competitorIds: ['competitor.cursor'] });
  const publicationC = mention({ id: 'c', topicRelevance: 1, pageReferringDomains: 5, domainAuthority: 5 });
  assert.deepEqual(mentionIntersect([publicationC, publicationB, publicationA]).map((item) => item.id), ['a']);
  assert.throws(() => parseMentions([publicationA, publicationA]), /Duplicate mention/);
});

test('format preferences participate in opportunity generation while unsupported missing formats do not', async () => {
  const source = await focusedSource();
  const missing: FormatCoverage = { topicClusterId: source.demand[0].id, format: 'VIDEO', exists: false, url: null, competitorsHaveFormat: true, googleRewardsFormat: true, aiEnginesCiteFormat: null, priority: 'P1', evidence: [observedEvidence('video SERP audit')] };
  source.formatCoverage = [missing];
  const snapshot = await buildIntelligence(source);
  assert.equal(snapshot.gaps[0].gapType, 'FORMAT');
  assert.equal(snapshot.gaps[0].format, 'VIDEO');
  assert.deepEqual(snapshot.opportunities[0].actionTypes, ['BUILD']);
  source.formatCoverage = [{ ...missing, competitorsHaveFormat: null, googleRewardsFormat: null, aiEnginesCiteFormat: null }];
  assert.equal((await buildIntelligence(source)).gaps.length, 0);
});

test('canonical facts reject duplicates, conflicts, stale values, unsafe sources, and outdated page usage', async () => {
  const source = await loadSource();
  const fact = source.facts[0];
  const duplicateIssues = detectFactProblems([fact, { ...fact, value: 'different' }], new Date('2026-09-22T00:00:00.000Z'));
  assert.ok(duplicateIssues.some((item) => item.code === 'DUPLICATE_FACT'));
  assert.ok(duplicateIssues.some((item) => item.code === 'CONFLICTING_FACT'));
  assert.ok(detectFactProblems([{ ...fact, lastVerifiedAt: '2020-01-01T00:00:00.000Z' }], new Date('2026-09-22T00:00:00.000Z')).some((item) => item.code === 'STALE_FACT'));
  assert.ok((await validateCanonicalFactSources([{ ...fact, source: '../outside.txt' }])).some((item) => item.code === 'UNSAFE_FACT_SOURCE'));
  assert.ok(detectOutdatedFactUsage([fact], { [`${fact.affectedPublicPages[0]}:${fact.factKey}`]: 'wrong' }).some((item) => item.code === 'OUTDATED_PAGE_USING_FACT'));
});

test('near-duplicate prompt-family language, duplicate records, and invalid relations are caught', async () => {
  const source = await loadSource();
  const template = source.demand.find((item) => item.kind === 'PROMPT_FAMILY')!;
  const variants = [
    { ...template, id: 'one', value: 'AI coding agent for existing repository', parentId: 'topic.existing-repositories' },
    { ...template, id: 'two', value: 'AI agent for existing repo', parentId: 'topic.existing-repositories' },
    { ...template, id: 'three', value: 'AI modify existing GitHub project', parentId: 'topic.existing-repositories' },
  ];
  assert.ok(deduplicatePromptFamilies(variants).duplicates.length >= 1);
  assert.ok(validateDemand([...source.demand, { ...source.demand[0] }], source.entities).some((item) => item.code === 'DUPLICATE_DEMAND'));
  assert.ok(validateEvidenceCollections({ observations: [observation(), observation()], mentions: [], formats: [], metrics: [], demand: source.demand, entities: source.entities }).some((item) => item.code === 'DUPLICATE_PROMPT_OBSERVATION'));
});

test('priority scoring exposes UNKNOWN, maintenance burden, external and product tradeoffs', () => {
  const base: OpportunityScores = {
    businessPotential: 5, searchDemand: 'UNKNOWN', promptDemand: 'UNKNOWN', commercialProximity: 5,
    productFit: 5, searchIntentFit: 4, rankingAttainability: 'UNKNOWN', aiVisibilityGap: 4, competitorGap: 4,
    entityAssociationValue: 5, aiSatisfactionRisk: 4, clickDefensibility: 5, formatOpportunity: 2,
    existingAuthority: 2, evidenceAvailability: 3, conversionPotential: 5, maintenanceBurden: 'UNKNOWN', strategicValue: 5,
  };
  const noDemand = prioritizeOpportunity(base);
  assert.notEqual(noDemand.priority, 'P0');
  assert.ok(noDemand.rationale.some((item) => item.includes('maintenanceBurden')));
  const poorProduct = prioritizeOpportunity({ ...base, searchDemand: 5, productFit: 1, maintenanceBurden: 2 });
  assert.notEqual(poorProduct.priority, 'P0');
  const highMaintenance = prioritizeOpportunity({ ...base, searchDemand: 5, maintenanceBurden: 5 });
  assert.notEqual(highMaintenance.priority, 'P0');
  const commercial = prioritizeOpportunity({ ...base, searchDemand: 1, promptDemand: 1, maintenanceBurden: 2 });
  assert.ok(['P1', 'P2'].includes(commercial.priority));
});

test('current baseline is deterministic and does not fabricate FORMAT or external gaps', async () => {
  const source = await loadSource();
  const now = new Date('2026-09-21T12:00:00.000Z');
  const first = await buildIntelligence(structuredClone(source), { now });
  const second = await buildIntelligence(structuredClone(source), { now });
  assert.deepEqual(first, second);
  assert.equal(first.gaps.filter((item) => item.gapType === 'TOPIC').length, 11);
  assert.equal(first.gaps.filter((item) => item.gapType === 'FORMAT').length, 0);
  assert.equal(first.gaps.filter((item) => ['VISIBILITY', 'NARRATIVE', 'WEB_MENTION', 'DEMAND'].includes(item.gapType)).length, 0);
  assert.equal(first.opportunities.length, 11);
  assert.ok(first.gaps.every((item) => item.evidence[0].confidence === 'INFERRED'));
});

test('provider failures are isolated from local intelligence and remain unavailable rather than zero', async () => {
  const source = await focusedSource();
  const snapshot = await buildIntelligence(source, { ahrefsProvider: { id: 'ahrefs', async load() { throw new Error('bad token'); } } });
  const state = snapshot.providerStates.find((item) => item.provider === 'ahrefs');
  assert.equal(state?.status, 'UNAVAILABLE');
  assert.match(state?.reason ?? '', /failed safely/);
  assert.ok(snapshot.gaps.length === 0);
});

test('synthetic report contains actionable gap, action, platform, mention, format and missing-evidence sections', async () => {
  const source = await focusedSource();
  source.promptObservations = [observation()];
  source.mentions = [mention()];
  source.formatCoverage = [{ topicClusterId: source.demand[0].id, format: 'VIDEO', exists: false, url: null, competitorsHaveFormat: true, googleRewardsFormat: null, aiEnginesCiteFormat: null, priority: 'P1', evidence: [observedEvidence('format evidence')] }];
  const report = renderReport(await buildIntelligence(source));
  for (const section of ['Executive summary', 'Current entity position', 'Top desired associations', 'Search visibility status', 'AI visibility status', 'Competitor visibility', 'Six Brand Gaps', 'Top FIX opportunities', 'Top BUILD opportunities', 'Top INFLUENCE opportunities', 'Top PRODUCT opportunities', 'Top non-branded demand clusters', 'Top prompt families', 'Top format gaps', 'Top mention intersect sources', 'Evidence state', 'Data missing / unknown', 'Next priorities']) assert.match(report, new RegExp(section));
  assert.match(report, /ChatGPT:/);
  assert.match(report, /example\.com/);
  assert.doesNotMatch(report, /AI Share of Voice: [0-9]/);
});

test('every CLI command performs a real dry-run and supports JSON and verbose output', async () => {
  for (const command of ['intelligence', 'entities', 'gaps', 'discover', 'report', 'validate']) {
    const result = await runCli(command);
    assert.equal(result.code, 0, `${command}: ${result.stderr}`);
    assert.ok(result.stdout.trim().length > 20, command);
    assert.match(result.stderr, /Dry run/);
  }
  const json = await runCli('report', ['--json']);
  assert.equal(json.code, 0, json.stderr);
  assert.equal(typeof JSON.parse(json.stdout), 'string');
  const verbose = await runCli('gaps', ['--verbose']);
  assert.equal(verbose.code, 0, verbose.stderr);
  assert.match(verbose.stderr, /Dry run/);
});
