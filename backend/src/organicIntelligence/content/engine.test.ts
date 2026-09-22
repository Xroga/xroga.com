import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { DemandItem, GscRow } from '../model.js';
import {
  analyzeGsc, applyKeywordEvidenceToDemand, attachValidatedDemand, buildQueryFanOut, buildTopicHubs,
  classifyCompetitorContentGap, ctaFor, decideSearchIntent, detectCannibalization,
  detectContentDecay, detectOrphanAssets, detectSleeperPages, detectVideoGaps, editorialQualityCheck,
  generateResearchCandidates, rankResearchCandidate, resolveExistingAsset,
  scoreBid, scoreContentQuality, suggestInternalLinks, validateCitationReadyManifest,
  selectControlledBatch, validateContentFamily, validateSourcesAndClaims, validatedGscQueryIds,
} from './engine.js';
import type {
  AssetInventory, ClaimRecord, ContentManifest, KeywordMetric, SerpObservation, SourceRecord,
} from './model.js';
import { contentBriefSchema } from './model.js';
import { buildGrowthContentSnapshot } from './pipeline.js';
import { parseAhrefsCsv, parseSerpCsv } from './providers.js';
import { loadSource } from '../repository.js';
import { loadGrowthContentSource } from './repository.js';
import { resolveSafeContentPath } from './repository.js';

const demand = (overrides: Partial<DemandItem> = {}): DemandItem => ({
  id: 'topic.arbitrary-workflow', kind: 'TOPIC_CLUSTER', value: 'Arbitrary repository workflow',
  parentId: null, relatedEntityIds: ['capability.repository-work'], intent: 'WORKFLOW',
  userJob: 'Change an existing project safely', audience: ['developers'], funnelStage: 'ACTIVATION',
  requiredAssetType: 'FEATURE', businessPotential: 5, intentFit: 5, difficulty: 'UNKNOWN',
  aiSatisfactionRisk: 1, clickDefensibility: 5, promptRelevance: 5, citationValue: 4,
  strategy: 'HYBRID', dataStatus: 'NO_DATA', evidence: [], ...overrides,
});

const metric = (overrides: Partial<KeywordMetric> = {}): KeywordMetric => ({
  id: 'metric:one', keyword: 'arbitrary repository workflow', country: 'US', provider: 'AHREFS',
  status: 'AVAILABLE', source: 'fixture.csv', observedAt: '2026-09-22T00:00:00.000Z',
  volume: 10, globalVolume: null, keywordDifficulty: 40, trafficPotential: null, cpc: null,
  parentTopic: null, serpIntent: 'GUIDE', serpFeatures: [], topRankingPages: [], ...overrides,
});

const asset = (overrides: Partial<AssetInventory> = {}): AssetInventory => ({
  id: 'asset.one', url: '/arbitrary-workflow', title: 'Arbitrary repository workflow', intent: 'GUIDE',
  topicClusterIds: ['topic.arbitrary-workflow'], entityIds: ['capability.repository-work'],
  promptFamilyIds: [], contentFamily: 'guide', indexable: true,
  evidenceClasses: ['PRODUCT_CODE', 'PRODUCT_SCREENSHOT'], visualClasses: ['PRODUCT_SCREENSHOT'],
  sourcePath: 'frontend/src/app/arbitrary/page.tsx', lastVerifiedAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22', qualityScore: 72, ...overrides,
});

const serp = (overrides: Partial<SerpObservation> = {}): SerpObservation => ({
  id: 'serp:one', query: 'arbitrary repository workflow', country: 'US', device: 'desktop',
  date: '2026-09-22', position: 1, url: 'https://example.test/guide', domain: 'example.test',
  title: 'Arbitrary guide', resultType: 'organic', contentType: 'GUIDE', videoPresent: false,
  forumPresent: false, toolPresent: false, comparisonPresent: false, commercialPagesPresent: false,
  informationalPagesPresent: true, weakDomainPresent: false, serpFeatures: [], observedIntent: 'GUIDE',
  notes: null, source: 'fixture.csv', ...overrides,
});

test('Ahrefs CSV import preserves missing metrics as UNKNOWN/null and parses quoted fields', () => {
  const records = parseAhrefsCsv('keyword,country,volume,kd,parent topic,ranking urls\n"agent, existing repo",US,120,,"repo workflow","https://example.test/a;https://example.test/b"', 'fixture.csv', '2026-09-22T00:00:00.000Z');
  assert.equal(records[0].keyword, 'agent, existing repo');
  assert.equal(records[0].volume, 120);
  assert.equal(records[0].keywordDifficulty, null);
  assert.equal(records[0].status, 'AVAILABLE');
  assert.equal(records[0].topRankingPages.length, 2);
});

test('Ahrefs import rejects malformed and duplicate evidence instead of inventing data', () => {
  assert.throws(() => parseAhrefsCsv('country,volume\nUS,10'), /missing keyword/i);
  assert.throws(() => parseAhrefsCsv('keyword,country\nsame,US\nsame,US'), /Duplicate Ahrefs/i);
  assert.throws(() => parseAhrefsCsv('keyword,country,volume\none,US,not-a-number'), /invalid volume/i);
});

test('SERP import retains observed intent and rejects unsupported values', () => {
  const header = 'query,country,device,date,position,url,domain,title,content_type,observed_intent,video_present';
  const records = parseSerpCsv(`${header}\nrepo agent,US,desktop,2026-09-22,1,https://example.test,example.test,Review,comparison,comparison,yes`);
  assert.equal(records[0].observedIntent, 'COMPARISON');
  assert.equal(records[0].videoPresent, true);
  assert.throws(() => parseSerpCsv(`${header}\nrepo agent,US,desktop,2026-09-22,1,https://example.test,example.test,Review,nonsense,comparison,no`), /Unsupported search intent/i);
});

test('seed and modifier research stays GENERATED_IDEA until evidence matches', () => {
  const generated = generateResearchCandidates([demand()]);
  assert.ok(generated.length > 10);
  assert.ok(generated.every((item) => item.origin === 'GENERATED_IDEA' && item.status === 'UNKNOWN'));
  const attached = attachValidatedDemand(generated, [metric()]);
  assert.equal(attached.find((item) => item.modifier === null)?.origin, 'VALIDATED_DEMAND');
});

test('validated keyword evidence feeds the Command 1 demand contract', () => {
  const updated = applyKeywordEvidenceToDemand([demand()], [metric()]);
  assert.equal(updated[0].dataStatus, 'AVAILABLE');
  assert.equal(updated[0].difficulty, 2);
  assert.equal(updated[0].evidence[0].sourceType, 'AHREFS');
});

test('high volume cannot rescue irrelevant demand while commercial fit can outrank low volume', () => {
  const candidates = attachValidatedDemand(generateResearchCandidates([
    demand({ id: 'topic.irrelevant', value: 'unrelated celebrity wallpaper', businessPotential: 1, intentFit: 1 }),
    demand({ id: 'topic.commercial', value: 'repository workflow', businessPotential: 5, intentFit: 5 }),
  ]), [
    metric({ id: 'high', keyword: 'unrelated celebrity wallpaper', volume: 1_000_000 }),
    metric({ id: 'low', keyword: 'repository workflow', volume: 10 }),
  ]);
  const irrelevant = candidates.find((item) => item.seedDemandId === 'topic.irrelevant' && item.origin === 'VALIDATED_DEMAND')!;
  const commercial = candidates.find((item) => item.seedDemandId === 'topic.commercial' && item.origin === 'VALIDATED_DEMAND')!;
  assert.equal(rankResearchCandidate(irrelevant, [metric({ id: 'high', volume: 1_000_000 })]).priority, 'P4');
  assert.equal(rankResearchCandidate(commercial, [metric({ id: 'low', volume: 10 })]).priority, 'P1');
});

test('BID uses AI satisfaction risk and click defensibility without inventing metrics', () => {
  const answerFirst = scoreBid(demand({ aiSatisfactionRisk: 5, clickDefensibility: 1, strategy: 'HYBRID' }), [], []);
  assert.equal(answerFirst.recommendedStrategy, 'AEO_FIRST');
  assert.equal(answerFirst.difficulty, 'UNKNOWN');
  const toolRequired = scoreBid(
    demand({ requiredAssetType: 'TOOL', aiSatisfactionRisk: 2, clickDefensibility: 2 }),
    [],
    [serp({ observedIntent: 'TOOL', contentType: 'TOOL', toolPresent: true })],
  );
  assert.equal(toolRequired.clickDefensibility, 4);
  assert.equal(toolRequired.recommendedStrategy, 'SEO_FIRST');
});

test('search intent follows observed SERP composition rather than defaulting to an article', () => {
  const result = decideSearchIntent([
    serp({ id: 'a', observedIntent: 'COMPARISON' }),
    serp({ id: 'b', position: 2, observedIntent: 'COMPARISON' }),
    serp({ id: 'c', position: 3, observedIntent: 'GUIDE' }),
  ]);
  assert.equal(result.intent, 'COMPARISON');
  assert.equal(decideSearchIntent([]).intent, 'UNKNOWN');
});

test('video-dominant evidence creates a video gap only when coverage is absent', () => {
  const observation = serp({ contentType: 'VIDEO', observedIntent: 'VIDEO', videoPresent: true });
  const gaps = detectVideoGaps([demand()], [observation], [asset()]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].xrogaVideoCoverage, 'ABSENT');
  assert.equal(detectVideoGaps([demand()], [observation], [asset({ visualClasses: ['VIDEO'] })]).length, 0);
});

test('query fan-out keeps subquestions inside one topic strategy', () => {
  const family = demand({ id: 'prompt.arbitrary', kind: 'PROMPT_FAMILY', parentId: 'topic.arbitrary-workflow' });
  const fanOut = buildQueryFanOut([family], [asset()], { 'capability.repository-work': ['branch safety', 'validation evidence'] });
  assert.equal(new Set(fanOut.map((item) => item.promptFamilyId)).size, 1);
  assert.ok(fanOut.some((item) => item.fanOutQuestion === 'branch safety'));
  assert.ok(fanOut.every((item) => item.coveredByUrl === '/arbitrary-workflow'));
});

test('existing equivalent assets resolve to FIX/expand instead of automatic BUILD', () => {
  const generated = generateResearchCandidates([demand()])[0];
  assert.equal(resolveExistingAsset(generated, [asset()]).decision, 'UPDATE_EXISTING');
  assert.equal(resolveExistingAsset({ ...generated, seedDemandId: 'topic.unrelated-ledger', query: 'unrelated quantum ledger' }, [asset()]).decision, 'BUILD_NEW');
});

test('asset resolution distinguishes intent, repositioning, merge, build and ignore', () => {
  assert.equal(resolveExistingAsset(demand({ requiredAssetType: 'GUIDE' }), [asset({ qualityScore: 90 })]).decision, 'IGNORE');
  assert.equal(resolveExistingAsset(demand({ requiredAssetType: 'COMPARISON' }), [asset()]).decision, 'REPOSITION');
  assert.equal(resolveExistingAsset(demand({ value: 'Distinct buyer comparison', userJob: 'Compare vendors', requiredAssetType: 'COMPARISON' }), [asset()]).decision, 'BUILD_NEW');
  assert.equal(resolveExistingAsset(demand({ requiredAssetType: 'GUIDE' }), [asset(), asset({ id: 'asset.two', url: '/arbitrary-two' })]).decision, 'MERGE');
});

test('duplicate intents produce a cannibalization warning', () => {
  const risks = detectCannibalization([asset(), asset({ id: 'asset.two', url: '/arbitrary-repo-guide', title: 'Repository workflow guide' })]);
  assert.equal(risks.length, 1);
});

test('GSC states, decline and cannibalization use actual supplied rows', () => {
  const rows: GscRow[] = [
    { query: 'repo agent', page: 'https://xroga.com/a', date: '2026-09-01', clicks: 10, impressions: 200, ctr: .05, position: 8 },
    { query: 'repo agent', page: 'https://xroga.com/a', date: '2026-09-22', clicks: 2, impressions: 40, ctr: .05, position: 15 },
    { query: 'repo agent', page: 'https://xroga.com/b', date: '2026-09-22', clicks: 1, impressions: 30, ctr: .03, position: 18 },
  ];
  const analysis = analyzeGsc(rows);
  assert.ok(analysis.classifications[0].states.includes('POSITION_4_10'));
  assert.equal(analysis.declines.length, 1);
  assert.deepEqual(analysis.cannibalization[0].pages, ['https://xroga.com/a', 'https://xroga.com/b']);
});

test('sleeper and decay require historical evidence rather than age alone', () => {
  const rows: GscRow[] = [
    { query: 'arbitrary workflow', page: 'https://xroga.com/arbitrary-workflow', date: '2026-08-01', clicks: 10, impressions: 200, ctr: .05, position: 8 },
    { query: 'arbitrary workflow', page: 'https://xroga.com/arbitrary-workflow', date: '2026-09-01', clicks: 1, impressions: 30, ctr: .03, position: 18 },
  ];
  const sleepers = detectSleeperPages(rows, [asset()], new Date('2026-09-22'));
  assert.equal(sleepers.length, 1);
  assert.equal(detectSleeperPages([], [asset()], new Date('2026-09-22')).length, 0);
});

test('stale claims create explicit decay instead of silently changing dates', () => {
  const claim: ClaimRecord = { claimId: 'stale', text: 'Old fact', entityId: 'competitor.one', sourceIds: ['source.one'], verifiedAt: '2025-01-01T00:00:00.000Z', pagesUsingClaim: ['/arbitrary-workflow'], volatility: 'HIGH', nextVerificationDue: '2025-02-01T00:00:00.000Z' };
  const signals = detectContentDecay([asset()], [claim], new Date('2026-09-22'));
  assert.equal(signals[0].type, 'STALE_COMPETITOR_FACT');
  assert.equal(signals[0].status, 'STALE');
});

test('competitor gaps distinguish demand, brand, format, copycat and product gaps', () => {
  assert.equal(classifyCompetitorContentGap({ demandStatus: 'AVAILABLE', productSupported: true, xrogaCoverage: false, competitorCoverage: 2, formatMismatch: false, brandAssociationMissing: false }), 'REAL_DEMAND_GAP');
  assert.equal(classifyCompetitorContentGap({ demandStatus: 'AVAILABLE', productSupported: true, xrogaCoverage: true, competitorCoverage: 2, formatMismatch: true, brandAssociationMissing: false }), 'FORMAT_GAP');
  assert.equal(classifyCompetitorContentGap({ demandStatus: 'AVAILABLE', productSupported: false, xrogaCoverage: false, competitorCoverage: 2, formatMismatch: false, brandAssociationMissing: false }), 'PRODUCT_GAP');
  assert.equal(classifyCompetitorContentGap({ demandStatus: 'NO_DATA', productSupported: true, xrogaCoverage: false, competitorCoverage: 2, formatMismatch: false, brandAssociationMissing: false }), 'LOW_VALUE_COPYCAT');
});

test('content-family contracts block thin comparisons and fabricated research results', () => {
  const comparison = validateContentFamily({ family: 'COMPARISON', sections: ['Direct answer'], sourceCount: 0, distinctIntent: true, originalDataAvailable: false });
  assert.ok(comparison.some((item) => item.includes('AVAILABLE source evidence')));
  const research = validateContentFamily({ family: 'RESEARCH', sections: ['Direct answer', 'Methodology', 'Dataset', 'Results', 'Limitations', 'Sources'], sourceCount: 2, distinctIntent: true, originalDataAvailable: false });
  assert.deepEqual(research, ['RESEARCH cannot publish results without an original dataset.']);
  const staleComparison = validateContentFamily({ family: 'COMPARISON', sections: ['Direct answer', 'Comparison matrix', 'Best fit', 'Sources', 'Limitations'], sourceCount: 2, sourceState: 'STALE', distinctIntent: true, originalDataAvailable: false });
  assert.ok(staleComparison.some((item) => item.includes('received STALE')));
});

test('topic hubs group supporting assets without inventing disconnected routes', () => {
  const hubs = buildTopicHubs([asset({ intent: 'CATEGORY' }), asset({ id: 'support', url: '/arbitrary-support', title: 'Support', intent: 'GUIDE' })]);
  assert.equal(hubs[0].hub, '/arbitrary-workflow');
  assert.deepEqual(hubs[0].supporting, ['/arbitrary-support']);
});

test('quality scoring is component-explainable and threshold-gated', () => {
  const result = scoreContentQuality({ intentMatch: 15, productRelevance: 10, originalEvidence: 5, answerCompleteness: 10, citationReadiness: 10, visualProof: 4, sourceQuality: 10, freshness: 5, internalLinking: 5, conversionPath: 5, technicalReadiness: 5 });
  assert.equal(result.total, 84);
  assert.equal(result.ready, true);
  assert.ok(result.deficiencies.some((item) => item.includes('originalEvidence')));
});

test('editorial quality check flags filler, unsupported superlatives and placeholders', () => {
  const issues = editorialQualityCheck('In today\'s fast-paced world, this revolutionary and ultimate tool is game-changing. TODO: proof.');
  assert.ok(issues.length >= 3);
  assert.deepEqual(editorialQualityCheck('Xroga reports a repository write only after the authorized operation returns evidence.'), []);
});

test('internal links exclude self and CTA matches the user job', () => {
  const links = suggestInternalLinks(asset(), [asset(), asset({ id: 'two', url: '/security', title: 'Security review' })]);
  assert.deepEqual(links, ['/security']);
  assert.deepEqual(ctaFor('COMPARISON'), { label: 'Try Xroga on your own repository', href: '/auth/signup' });
  assert.deepEqual(ctaFor('DOCUMENTATION'), { label: 'Open the workspace', href: '/workspace' });
  assert.deepEqual(ctaFor('TOOL'), { label: 'Use Xroga on your project', href: '/auth/signup' });
});

test('orphan detection remains structural and never counts a self-link', () => {
  const isolated = asset({ id: 'isolated', url: '/unrelated', title: 'Unrelated topic', topicClusterIds: ['topic.other'], entityIds: ['entity.other'] });
  assert.deepEqual(detectOrphanAssets([asset(), isolated]), ['/arbitrary-workflow', '/unrelated']);
  assert.deepEqual(detectOrphanAssets([asset(), asset({ id: 'linked', url: '/security', title: 'Security review' })]), []);
});

test('GSC query evidence gets a stable brief-safe identity only when impressions exist', () => {
  const rows: GscRow[] = [
    { query: 'arbitrary repository workflow', page: 'https://xroga.com/arbitrary-workflow', date: '2026-09-21', clicks: 1, impressions: 20, ctr: 0.05, position: 8 },
    { query: 'arbitrary repository workflow', page: 'https://xroga.com/arbitrary-workflow', date: '2026-09-22', clicks: 0, impressions: 0, ctr: 0, position: 8 },
  ];
  assert.deepEqual(validatedGscQueryIds(demand(), rows), ['gsc:2026-09-21:xroga-com:arbitrary-workflow:arbitrary-repository-workflow']);
});

test('source and claim registries reject duplicate and stale records', () => {
  const source: SourceRecord = { sourceId: 'source.one', url: 'source.ts', publisher: 'Xroga', sourceType: 'XROGA_PRODUCT_CODE', claimTopics: ['truth'], publishedAt: null, verifiedAt: '2025-01-01T00:00:00.000Z', authorityNotes: 'Current source.', volatility: 'HIGH', pagesUsingSource: ['/test'] };
  const claim: ClaimRecord = { claimId: 'claim.one', text: 'Truth', entityId: 'product.xroga', sourceIds: ['source.one'], verifiedAt: '2026-09-22T00:00:00.000Z', pagesUsingClaim: ['/test'], volatility: 'LOW', nextVerificationDue: '2026-10-22T00:00:00.000Z' };
  const issues = validateSourcesAndClaims([source, source], [claim, claim], new Date('2026-09-22T00:00:00.000Z'));
  assert.ok(issues.some((item) => item.includes('duplicate source')));
  assert.ok(issues.some((item) => item.includes('duplicate claim')));
  const duplicateText = validateSourcesAndClaims([source], [claim, { ...claim, claimId: 'claim.two', text: '  TRUTH  ' }], new Date('2026-09-22T00:00:00.000Z'));
  assert.ok(duplicateText.some((item) => item.includes('duplicate normalized claim text')));
  assert.ok(issues.some((item) => item.includes('is stale')));
});

test('actual repository snapshot reuses Command 1, keeps missing data explicit, and produces two valid FIX briefs', async () => {
  const snapshot = await buildGrowthContentSnapshot({ now: new Date('2026-09-22T00:00:00.000Z') });
  assert.equal(snapshot.command1.validationIssues.length, 0);
  assert.equal(snapshot.validatedCandidates.filter((item) => item.origin === 'VALIDATED_DEMAND').length, 0);
  assert.equal(snapshot.researchCandidates.length, 540);
  assert.equal(new Set(snapshot.researchCandidates.map((item) => item.id)).size, 540);
  assert.equal(snapshot.assetResolutions.length, 0, 'GENERATED_IDEA records must not create publishable asset decisions');
  assert.ok(snapshot.unknowns.some((item) => item.includes('Keyword volume')));
  assert.deepEqual(snapshot.firstBatch.map((item) => item.url), ['/build-with/github', '/tools/production-readiness-checker']);
  assert.equal(snapshot.briefs.length, 2);
  for (const brief of snapshot.briefs) {
    contentBriefSchema.parse(brief);
    assert.equal(brief.promptFamilyIds.length, new Set(brief.promptFamilyIds).size);
    assert.ok(brief.internalLinks.length > 0);
    assert.ok(!brief.internalLinks.includes(brief.targetUrl));
  }
  assert.ok(snapshot.briefs.find((brief) => brief.targetUrl === '/build-with/github')?.internalLinks.includes('/ai-coding-agent'));
  assert.ok(snapshot.briefs.find((brief) => brief.targetUrl === '/tools/production-readiness-checker')?.internalLinks.includes('/security'));
  assert.ok(snapshot.contentValidation.every((item) => item.issues.length === 0));
});

test('validated demand evidence flows into the matching content brief without duplicates', async () => {
  const [command1Source, growthSource] = await Promise.all([loadSource(), loadGrowthContentSource()]);
  growthSource.keywordMetrics = [metric({
    id: 'metric:validated-readiness',
    keyword: 'Production-ready AI software',
    source: 'growth/imports/fixture.csv',
  })];
  const snapshot = await buildGrowthContentSnapshot({
    command1Source,
    growthSource,
    now: new Date('2026-09-22T00:00:00.000Z'),
  });
  const brief = snapshot.briefs.find((item) => item.targetUrl === '/tools/production-readiness-checker');
  assert.ok(brief);
  assert.deepEqual(brief.validatedKeywordIds, ['metric:validated-readiness']);
  assert.ok(snapshot.assetResolutions.length > 0);
});

test('pipeline derives a reachable brand gap from validated demand and Command 1 association evidence', async () => {
  const [command1Source, growthSource] = await Promise.all([loadSource(), loadGrowthContentSource()]);
  growthSource.keywordMetrics = [metric({
    id: 'metric:repository-brand',
    keyword: 'AI development for existing repositories',
    source: 'growth/imports/fixture.csv',
  })];
  growthSource.serpObservations = [serp({
    id: 'serp:repository-brand', query: 'AI development for existing repositories',
    observedIntent: 'DOCUMENTATION', contentType: 'DOCUMENTATION',
  })];
  const snapshot = await buildGrowthContentSnapshot({ command1Source, growthSource, now: new Date('2026-09-22T00:00:00.000Z') });
  const gap = snapshot.competitorContentGaps.find((item) => item.candidateId.includes('topic-existing-repositories') && item.query === 'AI development for existing repositories');
  assert.equal(gap?.classification, 'BRAND_GAP');
});

test('controlled publication selection excludes non-indexable assets', async () => {
  const snapshot = await buildGrowthContentSnapshot({ now: new Date('2026-09-22T00:00:00.000Z') });
  const opportunity = snapshot.command1.opportunities.find((item) => item.actionTypes.includes('FIX'))!;
  const hidden = asset({ indexable: false, topicClusterIds: [opportunity.topicClusterId], entityIds: [opportunity.entityId] });
  assert.deepEqual(selectControlledBatch([opportunity], [hidden]), []);
});

test('citation-ready validator blocks missing sections, stale claims, and weak evidence', () => {
  const source: SourceRecord = { sourceId: 'source.one', url: 'source.ts', publisher: 'Xroga', sourceType: 'XROGA_PRODUCT_CODE', claimTopics: ['truth'], publishedAt: null, verifiedAt: '2026-09-22T00:00:00.000Z', authorityNotes: 'Current source.', volatility: 'LOW', pagesUsingSource: ['/test'] };
  const claim: ClaimRecord = { claimId: 'claim.one', text: 'Truth', entityId: 'product.xroga', sourceIds: ['source.one'], verifiedAt: '2026-09-22T00:00:00.000Z', pagesUsingClaim: ['/test'], volatility: 'LOW', nextVerificationDue: '2026-10-22T00:00:00.000Z' };
  const manifest = {
    title: 'Weak page', description: 'Too short', slug: 'test', canonical: 'https://xroga.com/test',
    publishedAt: '2026-09-22', updatedAt: '2026-09-22', lastVerifiedAt: '2026-09-22T00:00:00.000Z',
    author: 'Xroga', intent: 'GUIDE', cluster: 'topic.test', entityIds: ['product.xroga'], opportunityId: 'opp.test', gapIds: [], promptFamilyIds: [], validatedKeywords: [], audience: ['developers'], funnelStage: 'DISCOVERY', sourceIds: ['source.one'], claimIds: ['claim.one'], evidenceManifest: [], visualManifest: [], related: ['/docs'], productCapability: 'Truth', indexStatus: 'INDEX', qualityDimensions: { intentMatch: 5, productRelevance: 5, originalEvidence: 0, answerCompleteness: 5, citationReadiness: 0, visualProof: 0, sourceQuality: 5, freshness: 5, internalLinking: 5, conversionPath: 5, technicalReadiness: 5 }, qualityScore: 40, qualityDeficiencies: [], refreshDue: '2026-10-22T00:00:00.000Z', owner: 'Growth', requiredSections: ['Overview'], coveredQuestions: ['What?'], cta: { label: 'Open', href: '/workspace' }, conversionPath: { entryIntent: 'Learn', valueDelivered: 'Truth', nextAction: 'Open', activationEvent: 'Task started' },
  } as unknown as ContentManifest;
  const issues = validateCitationReadyManifest(manifest, [source], [claim]);
  assert.ok(issues.some((item) => item.includes('Direct answer')));
  assert.ok(issues.some((item) => item.includes('evidence classes')));
  assert.ok(issues.some((item) => item.includes('below 75')));
});

test('citation-ready validator enforces evidence registry, page ownership and illustration honesty', () => {
  const source: SourceRecord = { sourceId: 'source.one', url: 'source.ts', publisher: 'Xroga', sourceType: 'XROGA_PRODUCT_CODE', claimTopics: ['truth'], publishedAt: null, verifiedAt: '2026-09-22T00:00:00.000Z', authorityNotes: 'Current source.', volatility: 'LOW', pagesUsingSource: ['/different-page'] };
  const claim: ClaimRecord = { claimId: 'claim.one', text: 'Truth', entityId: 'product.xroga', sourceIds: ['source.one'], verifiedAt: '2026-09-22T00:00:00.000Z', pagesUsingClaim: ['/different-page'], volatility: 'LOW', nextVerificationDue: '2026-10-22T00:00:00.000Z' };
  const manifest = {
    title: 'Evidence integrity page', description: 'A sufficiently detailed description that explains the evidence integrity checks used by this arbitrary test page.', slug: 'test', canonical: 'https://xroga.com/test',
    publishedAt: '2026-09-22', updatedAt: '2026-09-22', lastVerifiedAt: '2026-09-22T00:00:00.000Z', author: 'Xroga', intent: 'GUIDE', cluster: 'topic.test', entityIds: ['product.xroga'], opportunityId: 'opp.test', gapIds: [], promptFamilyIds: [], validatedKeywords: [], audience: ['developers'], funnelStage: 'DISCOVERY', sourceIds: ['source.one'], claimIds: ['claim.one'],
    evidenceManifest: [{ type: 'PRODUCT_CODE', source: 'source.missing', verifiedAt: '2026-09-22T00:00:00.000Z', location: 'source.ts', claimSupported: 'Truth', publicSafe: true, freshnessDue: '2026-10-22T00:00:00.000Z' }, { type: 'OFFICIAL_SOURCE', source: 'source.one', verifiedAt: '2026-09-22T00:00:00.000Z', location: 'https://example.test', claimSupported: 'Truth', publicSafe: true, freshnessDue: '2026-10-22T00:00:00.000Z' }],
    visualManifest: [{ type: 'ILLUSTRATION', source: '/illustration.png', alt: 'An illustration', caption: 'Illustration only.', width: null, height: null, verifiedAt: '2026-09-22T00:00:00.000Z', publicSafe: true }], related: ['/docs'], productCapability: 'Truth', indexStatus: 'INDEX', qualityDimensions: { intentMatch: 15, productRelevance: 10, originalEvidence: 15, answerCompleteness: 10, citationReadiness: 10, visualProof: 8, sourceQuality: 10, freshness: 5, internalLinking: 5, conversionPath: 5, technicalReadiness: 5 }, qualityScore: 98, qualityDeficiencies: [], refreshDue: '2026-10-22T00:00:00.000Z', owner: 'Growth', requiredSections: ['Direct answer', 'At a glance', 'Evidence', 'Limitations', 'Next action'], coveredQuestions: ['What?'], cta: { label: 'Open', href: '/workspace' }, conversionPath: { entryIntent: 'Learn', valueDelivered: 'Truth', nextAction: 'Open', activationEvent: 'Task started' },
  } as ContentManifest;
  const issues = validateCitationReadyManifest(manifest, [source], [claim]);
  assert.ok(issues.some((item) => item.includes('missing source source.missing')));
  assert.ok(issues.some((item) => item.includes('does not declare page /test')));
  assert.ok(issues.some((item) => item.includes('Illustration-only')));
});

test('content path resolution rejects traversal and symbolic-link escapes', async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'xroga-growth-path-'));
  const root = path.join(temporary, 'repo');
  const outside = path.join(temporary, 'outside');
  await Promise.all([mkdir(root), mkdir(outside)]);
  await writeFile(path.join(outside, 'private.json'), '{}', 'utf8');
  await assert.rejects(resolveSafeContentPath('../outside/private.json', root), /stay inside/i);
  try {
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(resolveSafeContentPath('escape/private.json', root), /symbolic link/i);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') context.skip('Creating a test junction is unavailable on this host.');
    else throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
