import assert from 'node:assert/strict';
import test from 'node:test';
import type { CanonicalFact, Gap, Mention } from '../model.js';
import {
  attributionUrl, authorityDiversity, buildOwnedGraph, buildVideoBrief, classifyRelease,
  classifyDirectory,
  createAuthorityReceipt, createOutreachDraft, narrativeCorrections, operationalMentionIntersect,
  publicReportEligibility, qualifyCreator, qualifyExternalSource, reconcileTrackedMention,
  rejectLinkScheme, validateCaseStudy, validateCommunityOpportunity, validateDataPitch, validateReviewIntegrity, validateSatellite, videoOpportunities,
} from './engine.js';
import type { AuthorityNode, ExternalSource, InfluenceOpportunity, SatelliteDecision, VideoOpportunity } from './model.js';
import { mcpToolContractSchema, skillContractSchema } from './model.js';
import { buildAuthoritySnapshot } from './pipeline.js';
import type { AuthoritySource } from './repository.js';

const now = '2026-09-24T00:00:00.000Z';
const external = (overrides: Partial<ExternalSource> = {}): ExternalSource => ({
  id: 'page.arbitrary', url: 'https://publisher.example/ai-agents', title: 'Repository AI agent comparison',
  domain: 'publisher.example', author: 'Independent Author', publication: 'Developer Review', sourceClass: 'COMPARISON',
  topicIds: ['topic.existing-repositories'], competitorIds: ['competitor.alpha', 'competitor.beta'],
  xrogaPresent: false, linked: false, linkUrl: null, linkAttribute: 'UNKNOWN', pageBacklinks: 3,
  pageReferringDomains: 3, pageTraffic: 4, rankingKeywords: 4, searchPosition: 2, aiCitationFrequency: 2,
  topicalRelevance: 5, editorialIndependence: 5, realAudience: 4, commercialRelevance: 5, trust: 4,
  contactability: 3, evidenceState: 'VERIFIED', mentionContext: 'COMPARATIVE', confidence: 'VERIFIED',
  freshness: 'CURRENT', observedAt: now, lastVerifiedAt: now, ...overrides,
});
const mention: Mention = {
  id: 'mention.arbitrary', sourceDomain: 'publisher.example', sourceUrl: 'https://publisher.example/ai-agents',
  pageTitle: 'Repository AI agent comparison', author: 'Independent Author', publicationType: 'COMPARISON',
  brandEntityIds: [], mentionContext: null, linked: false, linkUrl: null, sentiment: 'NEUTRAL',
  topicClusterId: 'topic.existing-repositories', attribute: null,
  competitorIds: ['competitor.alpha', 'competitor.beta'], xrogaPresent: false, pageReferringDomains: 3,
  pageOrganicTraffic: 4, domainAuthority: 4, aiCitationFrequency: 2, contentFormat: 'COMPARISON',
  commercialIntent: 5, editorialIndependence: 5, topicRelevance: 5, freshness: 'CURRENT',
  outreachFeasibility: 3, dateDiscovered: '2026-09-24', dateVerified: '2026-09-24',
};
const gap: Gap = {
  id: 'gap.web.arbitrary', entityId: 'product.xroga', topicClusterId: 'topic.existing-repositories',
  desiredAssociationId: null, actualAssociation: null, platform: 'WEB', competitorIds: mention.competitorIds,
  gapType: 'WEB_MENTION', currentState: 'Competitors observed; Xroga absent.', desiredState: 'Accurate editorial consideration.',
  evidence: [{ source: mention.sourceUrl, sourceType: 'MANUAL_IMPORT', observedAt: now, lastVerifiedAt: now, verificationDue: null, confidence: 'VERIFIED', freshness: 'CURRENT' }],
  evidenceQuality: 'VERIFIED', sourceUrls: [mention.sourceUrl], searchDemand: 'UNKNOWN', promptDemand: 'UNKNOWN',
  businessValue: 4, productFit: 5, format: null, observedAt: now, lastVerifiedAt: now,
  recommendedAction: 'Offer useful evidence.', actionType: 'INFLUENCE', priority: 'P2', status: 'OPEN',
};

test('page-level relevance can outweigh raw domain assumptions', () => {
  const result = qualifyExternalSource(external({ pageBacklinks: 1, pageReferringDomains: 1, searchPosition: 2, topicalRelevance: 5 }));
  assert.equal(result.decision, 'QUALIFY');
  assert.equal(result.breakdown.topicalRelevance, 5);
});

test('a high-authority irrelevant source is rejected', () => {
  const result = qualifyExternalSource(external({ pageBacklinks: 5, pageTraffic: 5, topicalRelevance: 1 }));
  assert.equal(result.decision, 'REJECT');
});

test('link schemes and deceptive promotion are rejected', () => {
  for (const value of ['buy dofollow backlink', 'private blog network', 'bulk directory package', 'link exchange network', 'fake persona review']) {
    assert.ok(rejectLinkScheme(value), value);
  }
  assert.equal(rejectLinkScheme('Independent repository test with published methodology'), null);
});

test('Mention Intersect consumes Command 1 evidence and creates a qualified INFLUENCE action', () => {
  const result = operationalMentionIntersect([mention], [gap], [external()]);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.command1GapIds, [gap.id]);
  assert.equal(result[0]?.action, 'EDITORIAL_PITCH');
  assert.equal(result[0]?.status, 'QUALIFIED');
});

test('Mention Intersect does not fabricate an opportunity without a verified external source record', () => {
  assert.deepEqual(operationalMentionIntersect([mention], [gap], []), []);
});

test('outreach drafts require value and never send automatically', () => {
  const opportunity = operationalMentionIntersect([mention], [gap], [external()])[0]!;
  const draft = createOutreachDraft(opportunity, external());
  assert.equal(draft.sentStatus, 'NOT_SENT');
  assert.equal(draft.contactPermission, 'UNKNOWN');
  assert.throws(() => createOutreachDraft({ ...opportunity, proposedValue: 'Please add our link.' }, external()), /concrete value/);
});

test('generated or contacted records cannot become verified authority without independent visibility', () => {
  assert.throws(() => createAuthorityReceipt({
    authorityId: 'authority.one', asset: 'Project Check', distributionSurface: 'External review',
    externalUrl: 'https://review.example/xroga', sourceType: 'EARNED', date: '2026-09-24',
    status: 'VERIFIED_MENTION', mentionContext: 'FACTUAL', linked: false, linkUrl: null,
    linkAttribute: 'UNKNOWN', competitorsPresent: [], verificationDate: null,
    result: 'Claimed mention', independentlyVisible: false,
  }), /independent visibility/);
});

test('owned distribution is not mislabeled as earned editorial authority', () => {
  assert.throws(() => createAuthorityReceipt({
    authorityId: 'authority.owned', asset: 'Repository', distributionSurface: 'GitHub',
    externalUrl: 'https://github.com/example/tool', sourceType: 'OWNED', date: '2026-09-24',
    status: 'VERIFIED_LINK', mentionContext: 'FACTUAL', linked: true, linkUrl: 'https://xroga.com',
    linkAttribute: 'FOLLOW', competitorsPresent: [], verificationDate: '2026-09-24', result: 'Owned repository', independentlyVisible: true,
  }), /Owned distribution/);
});

test('tracked mention removal and changed context downgrade prior authority', () => {
  const receipt = createAuthorityReceipt({ authorityId: 'earned.one', asset: 'Tool', distributionSurface: 'Review', externalUrl: 'https://review.example/tool', sourceType: 'EARNED', date: '2026-09-24', status: 'VERIFIED_LINK', mentionContext: 'FACTUAL', linked: true, linkUrl: 'https://xroga.com/tool', linkAttribute: 'FOLLOW', competitorsPresent: [], verificationDate: '2026-09-24', result: 'Visible', independentlyVisible: true });
  assert.equal(reconcileTrackedMention(receipt, { reachable: false, mentionPresent: false, linkPresent: false }).status, 'REMOVED');
  assert.equal(reconcileTrackedMention(receipt, { reachable: true, mentionPresent: true, linkPresent: true, contextChanged: true }).evidenceState, 'STALE');
});

test('narrative correction requires canonical product truth', () => {
  const facts: CanonicalFact[] = [{ factKey: 'pricing.pro', entityId: 'product.xroga', value: { priceUsd: 25 }, source: 'frontend/src/lib/plans.ts', sourceType: 'PRODUCT_CODE', effectiveDate: '2026-09-24', lastVerifiedAt: now, verificationIntervalDays: 14, volatility: 'HIGH', affectedPublicPages: ['/pricing'] }];
  const corrections = narrativeCorrections([external({ mentionContext: 'INCORRECT', topicIds: ['product.xroga'], title: 'Xroga costs $19' })], facts);
  assert.equal(corrections[0]?.factKey, 'pricing.pro');
  assert.equal(corrections[0]?.status, 'DRAFT_ONLY');
});

test('data pitches and percentage headlines require real data and methodology', () => {
  assert.ok(validateDataPitch({ headline: '80% of apps fail' }).length >= 5);
  assert.deepEqual(validateDataPitch({ datasetUrl: 'https://xroga.com/research/data.csv', methodology: 'Published reproducible method', sample: '100 public repositories', date: '2026-09-24', limitations: ['Public repositories only'], headline: 'Observed repository results' }), []);
});

test('private and non-consented project reports remain noindex', () => {
  assert.equal(publicReportEligibility({ repositoryPublic: false, ownerOptIn: true, privacy: 'PRIVATE', substantive: true, unique: true, duplicate: false }).indexable, false);
  assert.equal(publicReportEligibility({ repositoryPublic: true, ownerOptIn: false, privacy: 'PUBLIC_SAFE', substantive: true, unique: true, duplicate: false }).indexable, false);
  assert.equal(publicReportEligibility({ repositoryPublic: true, ownerOptIn: true, privacy: 'PUBLIC_SAFE', substantive: true, unique: true, duplicate: false }).indexable, true);
});

test('video ideas require actual SERP evidence before they become opportunities or briefs', () => {
  assert.deepEqual(videoOpportunities({ videoGaps: [{ topicClusterId: 'topic.one', potentialVideoTitle: 'Idea', evidence: [] }], serpRows: [], associationPages: new Map([['topic.one', '/guide']]) }), []);
  const opportunity: VideoOpportunity = { id: 'video.one', query: 'repository checks', topicId: 'topic.one', promptFamilyIds: [], evidenceState: 'OBSERVED', serpEvidenceIds: ['serp.one'], competitorUrls: ['https://video.example/watch'], angle: 'Repository checks demonstrated', audience: 'Developers', associatedPage: '/guide', cta: 'Read guide', priority: 'P2', status: 'VALIDATED_OPPORTUNITY' };
  assert.equal(buildVideoBrief(opportunity, { claimIds: ['claim.one'], sourceIds: ['source.one'] }).transcriptStatus, 'REQUIRED_REVIEWED');
  assert.throws(() => buildVideoBrief({ ...opportunity, status: 'GENERATED_IDEA', serpEvidenceIds: [] }, { claimIds: [], sourceIds: [] }), /requires observed/);
});

test('creator and community qualification preserve evidence and disclosure', () => {
  assert.equal(qualifyCreator({ id: 'creator.one', creator: 'Reviewer', channel: 'Channel', platform: 'YouTube', url: 'https://youtube.example/channel', topicIds: ['topic.unrelated'], audience: 'General', relevantContentUrls: [], competitorIds: ['competitor.alpha'], xrogaCovered: false, searchVisibility: 4, engagementEvidence: [], contactability: 2, fit: 1, proposedValue: 'Demo', evidenceState: 'OBSERVED', lastVerifiedAt: now }).qualified, false);
  assert.deepEqual(validateCommunityOpportunity({ id: 'community.one', threadUrl: 'https://forum.example/thread', community: 'Forum', topicId: 'topic.one', question: 'How?', date: '2026-09-24', activity: 3, competitorIds: [], xrogaMentioned: false, userIntent: 'Solve issue', answerOpportunity: true, xrogaRelevance: 4, affiliationDisclosureNeeded: true, recommendedAction: 'ANSWER_USEFULLY', evidenceState: 'VERIFIED' }), []);
});

test('directories are classified by real quality rather than backlink availability', () => {
  assert.equal(classifyDirectory({ official: false, realUsers: 5, editorialQuality: 0, indexable: true, categoryRelevance: 2, maintained: false, spamSignals: ['thousands of unrelated AI tools'] }), 'SPAM');
  assert.equal(classifyDirectory({ official: true, realUsers: 'UNKNOWN', editorialQuality: 'UNKNOWN', indexable: 'UNKNOWN', categoryRelevance: 5, maintained: true, spamSignals: [] }), 'OFFICIAL');
  assert.equal(classifyDirectory({ official: false, realUsers: 4, editorialQuality: 4, indexable: true, categoryRelevance: 5, maintained: true, spamSignals: [] }), 'HIGH_QUALITY_COMMUNITY');
});

test('review integrity rejects required praise, undisclosed payment and fake reviewer copy', () => {
  assert.equal(validateReviewIntegrity({ independent: true, requiresPositiveCoverage: false, disclosedPaidRelationship: null, compensationOffered: false, copyPresentedAsReviewerAuthored: false }).length, 0);
  assert.equal(validateReviewIntegrity({ independent: false, requiresPositiveCoverage: true, disclosedPaidRelationship: false, compensationOffered: true, copyPresentedAsReviewerAuthored: true }).length, 3);
});

test('case studies require permission, proof, measurement, limitations and public-safe privacy', () => {
  assert.equal(validateCaseStudy({ permissionGranted: false, proofUrls: [], measurement: [], limitations: [], privacy: 'PRIVATE' }).length, 5);
  assert.deepEqual(validateCaseStudy({ permissionGranted: true, proofUrls: ['https://example.test/proof'], measurement: ['Build passed'], limitations: ['Single repository'], privacy: 'PUBLIC_SAFE' }), []);
});

test('UTM generation is disciplined and rejects unsafe values', () => {
  assert.equal(attributionUrl('https://xroga.com/tools/check', { source: 'github', medium: 'repository', campaign: 'xroga_project_check' }), 'https://xroga.com/tools/check?utm_source=github&utm_medium=repository&utm_campaign=xroga_project_check');
  assert.throws(() => attributionUrl('https://xroga.com', { source: 'github;rm', medium: 'repo', campaign: 'x' }), /Unsafe/);
});

test('release distribution distinguishes public and internal changes', () => {
  assert.equal(classifyRelease({ publicProductChange: true, breaking: false, userVisible: true, internalOnly: false }), 'NOTABLE');
  assert.equal(classifyRelease({ publicProductChange: false, breaking: false, userVisible: false, internalOnly: true }), 'INTERNAL');
});

test('authority diversity reports surface coverage rather than an opaque score', () => {
  const nodes: AuthorityNode[] = buildOwnedGraph({ repositoryUrl: 'https://github.com/example/repo', assets: [{ id: 'asset.guide', title: 'Guide', url: '/guide', topicClusterIds: ['topic.one'] }], now: new Date(now), actionReady: true, skillReady: false }).nodes;
  const coverage = authorityDiversity(nodes, 'topic.one');
  assert.equal(coverage.OWNED_WEB, true);
  assert.equal(coverage.VIDEO, false);
  assert.equal(coverage.EDITORIAL, false);
});

test('satellite readiness cannot ignore licensing or blockers', () => {
  const decision: SatelliteDecision = { id: 'satellite.one', kind: 'ACTION', purpose: 'Check repository', utility: 5, maturity: 5, distributionPotential: 5, maintenanceBurden: 1, securityRisk: 1, installFriction: 1, licensing: 'OWNER_DECISION_REQUIRED', decision: 'SELECTED_WEDGE', rationale: ['Useful'], releaseReady: true, blockers: ['No release tag'] };
  assert.ok(validateSatellite(decision).some((item) => /license/i.test(item)));
  assert.ok(validateSatellite(decision).some((item) => /blockers/i.test(item)));
});

test('MCP permission contracts reject mutation without explicit authorization', () => {
  assert.equal(mcpToolContractSchema.parse({ id: 'inspect_repository', description: 'Read repository metadata', permissionTier: 'READ_ONLY', requiresExplicitAuthorization: false, inputs: ['path'], outputs: ['report'], implemented: false }).permissionTier, 'READ_ONLY');
  assert.throws(() => mcpToolContractSchema.parse({ id: 'repair_build', description: 'Mutate project', permissionTier: 'PROJECT_MUTATION', requiresExplicitAuthorization: false, inputs: ['project'], outputs: ['changes'], implemented: false }), /explicit authorization/);
});

test('outcome skill contract requires real tools, permissions, guardrails and evidence', () => {
  const parsed = skillContractSchema.parse({ id: 'arbitrary-skill', name: 'Arbitrary Skill', when_to_use: 'When evidence is needed', inputs: { path: 'Repository path' }, outputs: { report: 'Result' }, required_tools: ['real-tool'], permissions: ['READ_ONLY'], workflow: ['Run real tool'], guardrails: ['Do not mutate'], failure_states: ['INVALID_PATH'], evidence: ['report.json'], related_docs: ['https://xroga.com/docs'] });
  assert.deepEqual(parsed.required_tools, ['real-tool']);
  assert.throws(() => skillContractSchema.parse({ id: 'fake', name: 'Fake', when_to_use: 'Never', inputs: {}, outputs: {}, required_tools: [], permissions: [], workflow: [], guardrails: [], failure_states: [], evidence: [], related_docs: [] }));
});

test('current repository snapshot preserves external NO_DATA instead of fabricating authority', async () => {
  const source: AuthoritySource = {
    externalSources: [], creators: [], communities: [], outreach: [], receipts: [], satellites: [], skillContracts: [],
    github: { repository: 'Example/arbitrary-repo', url: 'https://github.com/Example/arbitrary-repo', description: 'Example', homepage: 'https://example.test', visibility: 'PUBLIC', topics: [], stars: 0, forks: 0, discussionsEnabled: false, issuesEnabled: true, releases: 0, tags: 0, license: null, observedAt: now, evidenceState: 'OBSERVED' },
  };
  const snapshot = await buildAuthoritySnapshot({ authoritySource: source, now: new Date(now) });
  assert.equal(snapshot.influenceOpportunities.length, 0);
  assert.equal(snapshot.videoOpportunities.length, 0);
  assert.ok(snapshot.unknowns.some((item) => item.includes('External source intelligence: NO_DATA')));
  assert.ok(snapshot.unknowns.some((item) => item.includes('Earned mentions/links: NO_DATA')));
});
