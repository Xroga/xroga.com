import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aiVisibilitySummary, classifyAction, classifyGapTypes, classifyGscRow, deduplicatePromptFamilies,
  detectFactProblems, detectOutdatedFactUsage, formatGaps, freshnessForEvidence, mentionIntersect, prioritizeOpportunity, validateAssociations,
  validateEntityGraph,
} from './engine.js';
import { buildIntelligence } from './intelligence.js';
import { parseGscCsv, parseMentions, parsePromptObservations, AhrefsProvider } from './providers.js';
import { loadSource } from './repository.js';
import { renderReport } from './report.js';
import type { DemandItem, Mention, OpportunityScores, PromptObservation } from './model.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');

function runCli(command: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, path.join(repoRoot, 'backend', 'src', 'organicIntelligence', 'cli.ts'), command, '--dry-run'], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('source entity graph, associations, canonical facts and relations validate', async () => {
  const source = await loadSource();
  assert.equal(validateEntityGraph(source.entities).length, 0);
  assert.equal(validateAssociations(source.associations, source.entities).length, 0);
  assert.equal(detectFactProblems(source.facts, new Date('2026-09-22T00:00:00.000Z')).length, 0);
  assert.ok(source.entities.some((item) => item.id === 'product.xroga'));
  assert.ok(source.facts.some((item) => item.factKey === 'pricing.pro' && (item.value as { priceUsd: number }).priceUsd === 25));
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
  assert.equal((await new AhrefsProvider('configured', false).load()).status, 'PLAN_LIMITED');
  assert.deepEqual((await new AhrefsProvider('configured', false).load()).records, []);
});

test('GSC CSV parses quoted data, percentages, classifications and rejects malformed imports', () => {
  const rows = parseGscCsv('query,page,country,device,date,clicks,impressions,ctr,position\n"agent, existing repo",https://xroga.com/ai-coding-agent,usa,desktop,2026-09-20,2,200,1%,8.5');
  assert.equal(rows[0].query, 'agent, existing repo');
  assert.equal(rows[0].ctr, 0.01);
  assert.deepEqual(classifyGscRow(rows[0]), ['POSITION_4_10', 'HIGH_IMPRESSIONS_LOW_CTR']);
  assert.throws(() => parseGscCsv('query,page\nfoo,https://xroga.com'), /missing date/);
  assert.throws(() => parseGscCsv('query,page,country,device,date,clicks,impressions,ctr,position\n"broken,https://xroga.com,usa,desktop,2026-09-20,0,1,0%,1'), /unterminated/);
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
  assert.throws(() => parsePromptObservations([{}]), /Invalid prompt observation/);
});

test('mention intersect requires competitor overlap and never fabricates authority', () => {
  const record: Mention = {
    id: 'm1', sourceDomain: 'example.com', sourceUrl: 'https://example.com/tools', pageTitle: 'Tools', author: null,
    publicationType: 'editorial', brandEntityIds: [], mentionContext: null, linked: false, linkUrl: null,
    sentiment: 'NEUTRAL', topicClusterId: 'topic.ai-coding-agents', attribute: null,
    competitorIds: ['competitor.alpha', 'competitor.beta'], xrogaPresent: false,
    pageReferringDomains: 'UNKNOWN', pageOrganicTraffic: 'UNKNOWN', domainAuthority: 'UNKNOWN', aiCitationFrequency: 'UNKNOWN',
    contentFormat: 'listicle', commercialIntent: 4, editorialIndependence: 4, freshness: 'CURRENT', outreachFeasibility: 3,
    dateDiscovered: '2026-09-20', dateVerified: null,
  };
  assert.equal(mentionIntersect([record]).length, 1);
  assert.equal(mentionIntersect([{ ...record, xrogaPresent: true }]).length, 0);
  assert.throws(() => parseMentions([{ ...record, sourceUrl: 'not-a-url' }]), /Invalid mention/);
});

test('format gaps require an observed preference signal, not only a missing format', async () => {
  const source = await loadSource();
  assert.equal(formatGaps(source.formatCoverage).length, 0);
  const signaled = { ...source.formatCoverage.find((item) => !item.exists)!, competitorsHaveFormat: true };
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
