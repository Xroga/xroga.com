import type { CanonicalFact, Gap, Mention } from '../model.js';
import type {
  AuthorityEdge, AuthorityNode, AuthorityReceipt, CommunityOpportunity, CreatorRecord,
  ExternalSource, InfluenceOpportunity, OutreachRecord, SatelliteDecision, VideoBrief, VideoOpportunity,
} from './model.js';
import type { releaseImportanceSchema } from './model.js';
import type { z } from 'zod';

const asNumber = (value: number | 'UNKNOWN'): number | null => value === 'UNKNOWN' ? null : value;
const average = (values: Array<number | null>): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
};

export function rejectLinkScheme(description: string): string | null {
  const normalized = description.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/pay.{0,12}(follow|dofollow).{0,8}link|buy.{0,12}backlink/, 'Paid follow-link schemes are prohibited.'],
    [/private blog network|\bpbn\b|expired.domain/, 'Private/expired-domain link networks are prohibited.'],
    [/bulk.{0,12}(directory|guest post)|thousands of ai tools/, 'Bulk low-value directory or guest-post packages are rejected.'],
    [/link exchange|reciprocal link/, 'Scaled reciprocal-link arrangements are prohibited.'],
    [/forum profile|sitewide footer link/, 'Forum-profile and sitewide-footer link schemes are rejected.'],
    [/fake (persona|review|testimonial|account)|undisclosed (payment|sponsor)/, 'Deceptive identity or review activity is prohibited.'],
  ];
  return rules.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

export function qualifyExternalSource(source: ExternalSource): {
  tier: InfluenceOpportunity['tier']; score: number; breakdown: InfluenceOpportunity['scoreBreakdown'];
  decision: 'QUALIFY' | 'MONITOR' | 'REJECT'; reasons: string[];
} {
  const scheme = rejectLinkScheme(`${source.title} ${source.publication ?? ''}`);
  const relevance = asNumber(source.topicalRelevance);
  const pageAuthority = average([
    asNumber(source.pageBacklinks), asNumber(source.pageReferringDomains), asNumber(source.pageTraffic),
    source.searchPosition === 'UNKNOWN' ? null : Math.max(0, 5 - Math.min(source.searchPosition, 50) / 10),
    asNumber(source.aiCitationFrequency),
  ]);
  const trust = average([asNumber(source.editorialIndependence), asNumber(source.realAudience), asNumber(source.trust)]);
  const fit = average([relevance, asNumber(source.commercialRelevance), asNumber(source.contactability)]);
  const breakdown = {
    topicalRelevance: relevance ?? 'UNKNOWN', pageAuthority: pageAuthority ?? 'UNKNOWN',
    editorialTrust: trust ?? 'UNKNOWN', commercialFit: fit ?? 'UNKNOWN',
    competitorOverlap: Math.min(5, source.competitorIds.length),
  } as const;
  const score = Math.round((average([
    relevance, pageAuthority, trust, fit, Math.min(5, source.competitorIds.length),
  ]) ?? 0) * 20);
  const community = ['FORUM', 'COMMUNITY_THREAD'].includes(source.sourceClass);
  const owned = source.evidenceState === 'VERIFIED' && source.domain.endsWith('xroga.com');
  const tier = owned ? 'TIER_3_OWNED' : community ? 'TIER_2_COMMUNITY' : 'TIER_1_EDITORIAL';
  const reasons: string[] = [];
  if (scheme) reasons.push(scheme);
  if (relevance === null) reasons.push('Topical relevance is UNKNOWN.');
  if (relevance !== null && relevance < 2) reasons.push('Page-level topical relevance is too weak.');
  if (source.evidenceState === 'UNKNOWN') reasons.push('The source has not been independently observed.');
  const decision = scheme || (relevance !== null && relevance < 2) ? 'REJECT'
    : source.evidenceState === 'VERIFIED' && score >= 55 ? 'QUALIFY' : 'MONITOR';
  return { tier, score, breakdown, decision, reasons };
}

export function operationalMentionIntersect(
  mentions: readonly Mention[], gaps: readonly Gap[], sources: readonly ExternalSource[], now = new Date(),
): InfluenceOpportunity[] {
  const influenceGapIds = gaps.filter((gap) => gap.actionType === 'INFLUENCE' || gap.gapType === 'WEB_MENTION');
  const sourceByUrl = new Map(sources.map((source) => [source.url, source]));
  return mentions
    .filter((mention) => !mention.xrogaPresent && mention.competitorIds.length >= 2 && mention.topicRelevance !== 'UNKNOWN' && mention.topicRelevance >= 2)
    .flatMap((mention) => {
      const source = sourceByUrl.get(mention.sourceUrl);
      if (!source) return [];
      const qualification = qualifyExternalSource(source);
      const relatedGaps = influenceGapIds.filter((gap) => gap.topicClusterId === mention.topicClusterId).map((gap) => gap.id);
      const rejected = qualification.decision === 'REJECT';
      const action = source.sourceClass === 'VIDEO' ? 'CREATOR_DEMO'
        : ['FORUM', 'COMMUNITY_THREAD'].includes(source.sourceClass) ? 'COMMUNITY_ANSWER'
          : source.sourceClass === 'RESEARCH' ? 'RESEARCH_SHARE' : 'EDITORIAL_PITCH';
      return [{
        id: `influence.${source.id}`, sourceId: source.id, command1GapIds: relatedGaps,
        action: rejected ? 'REJECT' : action, tier: qualification.tier,
        status: rejected ? 'REJECTED' : qualification.decision === 'QUALIFY' ? 'QUALIFIED' : 'DISCOVERED',
        whyRelevant: `This ${source.sourceClass.toLowerCase()} covers ${mention.competitorIds.length} relevant competitors but not Xroga.`,
        proposedValue: source.sourceClass === 'RESEARCH'
          ? 'Offer reproducible Xroga data or methodology only when a public evidence asset exists.'
          : 'Offer a working project-check artifact or factual product demonstration that improves the source.',
        evidenceAsset: null, priority: qualification.score >= 75 ? 'P1' : qualification.score >= 55 ? 'P2' : 'P3',
        score: qualification.score, scoreBreakdown: qualification.breakdown,
        blockers: [...qualification.reasons, ...(source.evidenceState === 'VERIFIED' ? [] : ['Independent source verification required.'])],
        evidenceState: source.evidenceState, confidence: source.confidence, freshness: source.freshness,
        observedAt: source.observedAt, lastVerifiedAt: source.lastVerifiedAt,
      } satisfies InfluenceOpportunity];
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

export function createOutreachDraft(opportunity: InfluenceOpportunity, source: ExternalSource): OutreachRecord {
  if (opportunity.action === 'REJECT') throw new Error('Rejected authority opportunities cannot produce outreach drafts.');
  if (!opportunity.proposedValue || /add our link/i.test(opportunity.proposedValue)) {
    throw new Error('Outreach requires concrete value beyond a link request.');
  }
  return {
    targetId: opportunity.id, sourceId: source.id, page: source.url, author: source.author,
    whyRelevant: opportunity.whyRelevant, competitorsPresent: source.competitorIds,
    xrogaGap: source.xrogaPresent ? 'Narrative or link quality requires review.' : 'Xroga is absent from a relevant source.',
    proposedValue: opportunity.proposedValue, pitchType: opportunity.action, evidenceAsset: opportunity.evidenceAsset,
    contactSource: null, contactPermission: 'UNKNOWN', draftStatus: 'DRAFTED', sentStatus: 'NOT_SENT',
    response: null, result: null, mentionObtained: false, linkObtained: false, date: null,
    nextAction: 'Verify contact permission and approve manually before any external message.',
  };
}

export function createAuthorityReceipt(input: Omit<AuthorityReceipt, 'evidenceState'> & { independentlyVisible: boolean }): AuthorityReceipt {
  const success = ['VERIFIED_MENTION', 'VERIFIED_LINK'].includes(input.status);
  if (success && (!input.independentlyVisible || !input.verificationDate)) {
    throw new Error('A mention or link cannot be VERIFIED before independent visibility is confirmed.');
  }
  if (input.sourceType === 'OWNED' && success) {
    throw new Error('Owned distribution cannot be reported as an earned verified mention.');
  }
  const { independentlyVisible, ...receipt } = input;
  return { ...receipt, evidenceState: independentlyVisible ? 'VERIFIED' : 'OBSERVED' };
}

export function reconcileTrackedMention(receipt: AuthorityReceipt, state: {
  reachable: boolean; mentionPresent: boolean; linkPresent: boolean; contextChanged?: boolean;
}): AuthorityReceipt {
  if (!state.reachable || !state.mentionPresent) return { ...receipt, status: 'REMOVED', result: 'The tracked mention is no longer independently visible.' };
  if (state.contextChanged) return { ...receipt, status: 'PUBLISHED_UNVERIFIED', evidenceState: 'STALE', result: 'Mention context changed and needs review.' };
  return { ...receipt, status: state.linkPresent ? 'VERIFIED_LINK' : 'VERIFIED_MENTION', linked: state.linkPresent };
}

export function narrativeCorrections(sources: readonly ExternalSource[], facts: readonly CanonicalFact[]): Array<{
  sourceId: string; incorrectClaim: string; factKey: string; canonicalValue: unknown; supportingSource: string; status: 'DRAFT_ONLY';
}> {
  const factByKey = new Map(facts.map((fact) => [fact.factKey, fact]));
  return sources.filter((source) => source.mentionContext === 'INCORRECT').flatMap((source) => {
    const fact = [...factByKey.values()].find((candidate) => source.topicIds.some((topic) => candidate.entityId === topic || candidate.factKey.includes(topic.split('.').at(-1) ?? '')));
    return fact ? [{ sourceId: source.id, incorrectClaim: source.title, factKey: fact.factKey, canonicalValue: fact.value, supportingSource: fact.source, status: 'DRAFT_ONLY' as const }] : [];
  });
}

export function qualifyCreator(creator: CreatorRecord): { qualified: boolean; reason: string } {
  const fit = asNumber(creator.fit);
  if (creator.evidenceState !== 'VERIFIED' && creator.evidenceState !== 'OBSERVED') return { qualified: false, reason: 'Creator evidence is not observed.' };
  if (fit === null) return { qualified: false, reason: 'Creator fit is UNKNOWN.' };
  if (fit < 3) return { qualified: false, reason: 'Creator topic fit is below the qualification threshold.' };
  return { qualified: true, reason: 'Creator has observed category fit; any review must remain independent.' };
}

export function validateCommunityOpportunity(item: CommunityOpportunity): string[] {
  const issues: string[] = [];
  if (item.evidenceState === 'UNKNOWN') issues.push('Thread has not been independently observed.');
  if (item.recommendedAction === 'ANSWER_USEFULLY' && !item.answerOpportunity) issues.push('Answer action requires a real answer opportunity.');
  if (item.recommendedAction === 'ANSWER_USEFULLY' && item.xrogaRelevance === 'UNKNOWN') issues.push('Answer action requires known Xroga relevance.');
  return issues;
}

export function videoOpportunities(input: {
  videoGaps: readonly { topicClusterId: string; potentialVideoTitle: string; evidence: string[] }[];
  serpRows: readonly { id: string; query: string; videoPresent: boolean; url: string; domain: string }[];
  associationPages: ReadonlyMap<string, string>;
}): VideoOpportunity[] {
  return input.videoGaps.flatMap((gap) => {
    const rows = input.serpRows.filter((row) => row.videoPresent && gap.evidence.includes(row.id));
    const page = input.associationPages.get(gap.topicClusterId);
    if (!rows.length || !page) return [];
    return [{
      id: `video.${gap.topicClusterId}`, query: rows[0]!.query, topicId: gap.topicClusterId,
      promptFamilyIds: [], evidenceState: 'OBSERVED', serpEvidenceIds: rows.map((row) => row.id),
      competitorUrls: rows.filter((row) => row.domain !== 'xroga.com').map((row) => row.url),
      angle: gap.potentialVideoTitle, audience: 'Developers evaluating repository-aware AI workflows',
      associatedPage: page, cta: 'Use the paired evidence page and try the workflow in Xroga.', priority: 'P2',
      status: 'VALIDATED_OPPORTUNITY',
    }];
  });
}

export function buildVideoBrief(opportunity: VideoOpportunity, evidence: { claimIds: string[]; sourceIds: string[] }): VideoBrief {
  if (opportunity.status === 'GENERATED_IDEA' || !opportunity.serpEvidenceIds.length) throw new Error('A video brief requires observed search/video evidence.');
  return {
    id: `brief.${opportunity.id}`, opportunityId: opportunity.id, targetQuery: opportunity.query,
    userJob: 'Evaluate a repository-aware workflow using visible implementation and verification evidence.',
    hook: `Show the result for “${opportunity.query}” before explaining the workflow.`,
    promise: 'A factual walkthrough of what the workflow can verify and where authorization is still required.',
    proof: ['Real repository input', 'Visible deterministic checks', 'Explicit limitations and permission boundaries'],
    demoEnvironment: 'Disposable public repository with no production credentials',
    chapters: [
      { title: 'The repository problem', purpose: 'Define the real user job and starting state.' },
      { title: 'Inspect and change', purpose: 'Show repository-aware work without hiding the diff.' },
      { title: 'Verify the outcome', purpose: 'Show checks, Preview evidence and remaining blockers.' },
    ],
    claimIds: evidence.claimIds, sourceIds: evidence.sourceIds,
    visuals: ['Repository state', 'Changed-files evidence', 'Check results', 'Responsive Preview'],
    associatedPage: opportunity.associatedPage, cta: opportunity.cta,
    titleCandidates: [opportunity.angle, `${opportunity.query}: a repository workflow with visible checks`],
    description: 'A source-linked demonstration. Claims are limited to the observed project and current product behavior.',
    thumbnailConcept: 'One repository diff and one verified result; no unsupported superlative.',
    limitations: ['Results depend on repository contents, configured providers and granted permissions.'],
    transcriptStatus: 'REQUIRED_REVIEWED',
  };
}

export function validateDataPitch(input: {
  datasetUrl?: string; methodology?: string; sample?: string; date?: string; limitations?: string[]; headline?: string;
}): string[] {
  const issues: string[] = [];
  if (!input.datasetUrl) issues.push('Public or reviewable source data is required.');
  if (!input.methodology) issues.push('Reproducible methodology is required.');
  if (!input.sample) issues.push('A clear sample definition is required.');
  if (!input.date) issues.push('A study date is required.');
  if (!input.limitations?.length) issues.push('Study limitations are required.');
  if (/%/.test(input.headline ?? '') && !input.datasetUrl) issues.push('Percentage headlines require underlying data.');
  return issues;
}

export function classifyDirectory(input: {
  official: boolean; realUsers: number | 'UNKNOWN'; editorialQuality: number | 'UNKNOWN';
  indexable: boolean | 'UNKNOWN'; categoryRelevance: number | 'UNKNOWN'; maintained: boolean | 'UNKNOWN'; spamSignals: string[];
}): 'OFFICIAL' | 'HIGH_QUALITY_COMMUNITY' | 'LOW_VALUE' | 'SPAM' {
  if (input.spamSignals.length || input.editorialQuality === 0) return 'SPAM';
  if (input.official) return 'OFFICIAL';
  const known = [input.realUsers, input.editorialQuality, input.categoryRelevance].filter((value): value is number => value !== 'UNKNOWN');
  if (known.length >= 2 && known.reduce((sum, value) => sum + value, 0) / known.length >= 3 && input.indexable === true && input.maintained === true) return 'HIGH_QUALITY_COMMUNITY';
  return 'LOW_VALUE';
}

export function validateReviewIntegrity(input: { independent: boolean; requiresPositiveCoverage: boolean; disclosedPaidRelationship: boolean | null; compensationOffered: boolean; copyPresentedAsReviewerAuthored: boolean }): string[] {
  const issues: string[] = [];
  if (input.requiresPositiveCoverage) issues.push('Independent coverage cannot require a positive conclusion.');
  if (input.compensationOffered && input.disclosedPaidRelationship !== true) issues.push('Paid relationships require disclosure and cannot count as earned authority.');
  if (input.copyPresentedAsReviewerAuthored) issues.push('Xroga-authored copy cannot be presented as independent reviewer language.');
  if (!input.independent && !input.compensationOffered) issues.push('The relationship must be classified accurately rather than reported as independent.');
  return issues;
}

export function validateCaseStudy(input: { permissionGranted: boolean; proofUrls: string[]; measurement: string[]; limitations: string[]; privacy: 'PUBLIC_SAFE' | 'AGGREGATED_SAFE' | 'PRIVATE' | 'REQUIRES_CONSENT' }): string[] {
  const issues: string[] = [];
  if (!input.permissionGranted) issues.push('Participant/project permission is required.');
  if (!input.proofUrls.length) issues.push('A case study requires reviewable proof.');
  if (!input.measurement.length) issues.push('A case study requires measured outcomes.');
  if (!input.limitations.length) issues.push('A case study requires limitations.');
  if (!['PUBLIC_SAFE', 'AGGREGATED_SAFE'].includes(input.privacy)) issues.push('Privacy classification blocks public distribution.');
  return issues;
}

export function publicReportEligibility(input: {
  repositoryPublic: boolean; ownerOptIn: boolean; privacy: 'PUBLIC_SAFE' | 'AGGREGATED_SAFE' | 'PRIVATE' | 'REQUIRES_CONSENT';
  substantive: boolean; unique: boolean; duplicate: boolean;
}): { indexable: boolean; reason: string } {
  if (!input.repositoryPublic) return { indexable: false, reason: 'Private repository reports remain authenticated and NOINDEX.' };
  if (!input.ownerOptIn) return { indexable: false, reason: 'Public report requires explicit owner opt-in.' };
  if (!['PUBLIC_SAFE', 'AGGREGATED_SAFE'].includes(input.privacy)) return { indexable: false, reason: 'Privacy classification blocks publication.' };
  if (!input.substantive || !input.unique || input.duplicate) return { indexable: false, reason: 'Thin or duplicate reports remain NOINDEX.' };
  return { indexable: true, reason: 'Public, opted-in, substantive and unique report.' };
}

export function attributionUrl(url: string, input: { source: string; medium: string; campaign: string }): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries({ utm_source: input.source, utm_medium: input.medium, utm_campaign: input.campaign })) {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)) throw new Error(`Unsafe attribution value for ${key}.`);
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export function validateSatellite(decision: SatelliteDecision): string[] {
  const issues = [...decision.blockers];
  if (decision.licensing === 'OWNER_DECISION_REQUIRED') issues.push('Open-source license requires owner approval.');
  if (decision.releaseReady && (decision.maturity === 'UNKNOWN' || decision.maturity < 4)) issues.push('Release-ready artifact requires demonstrated maturity.');
  if (decision.releaseReady && decision.blockers.length) issues.push('Release-ready artifact cannot retain blockers.');
  return [...new Set(issues)];
}

export function classifyRelease(input: { publicProductChange: boolean; breaking: boolean; userVisible: boolean; internalOnly: boolean }): z.infer<typeof releaseImportanceSchema> {
  if (input.internalOnly) return 'INTERNAL';
  if (input.breaking && input.publicProductChange) return 'MAJOR';
  if (input.userVisible && input.publicProductChange) return 'NOTABLE';
  return 'MINOR';
}

export function authorityDiversity(nodes: readonly AuthorityNode[], topicId: string): Record<'OWNED_WEB' | 'GITHUB' | 'VIDEO' | 'EDITORIAL' | 'COMMUNITY' | 'RESEARCH' | 'TOOLS' | 'PACKAGES', boolean> {
  const relevant = nodes.filter((node) => node.topicIds.includes(topicId));
  const has = (...types: AuthorityNode['type'][]) => relevant.some((node) => types.includes(node.type));
  return {
    OWNED_WEB: has('XROGA_ASSET', 'PUBLIC_REPORT'), GITHUB: has('XROGA_REPOSITORY', 'GITHUB_ACTION', 'SKILL'),
    VIDEO: has('VIDEO'), EDITORIAL: has('EXTERNAL_ARTICLE', 'EXTERNAL_COMPARISON', 'EXTERNAL_REVIEW', 'NEWSLETTER'),
    COMMUNITY: has('COMMUNITY', 'FORUM_THREAD'), RESEARCH: has('RESEARCH', 'BENCHMARK'),
    TOOLS: has('MCP_SERVER', 'GITHUB_ACTION'), PACKAGES: has('PACKAGE'),
  };
}

export function buildOwnedGraph(input: {
  repositoryUrl: string; assets: readonly { id: string; title: string; url: string; topicClusterIds: string[] }[];
  now: Date; actionReady: boolean; skillReady: boolean;
}): { nodes: AuthorityNode[]; edges: AuthorityEdge[] } {
  const timestamp = input.now.toISOString();
  const common = { confidence: 'VERIFIED' as const, freshness: 'CURRENT' as const, observedAt: timestamp, lastVerifiedAt: timestamp };
  const nodes: AuthorityNode[] = [{
    id: 'repo.xroga-main', type: 'XROGA_REPOSITORY', label: 'Xroga main repository', url: input.repositoryUrl,
    ownership: 'OWNED', privacy: 'PUBLIC_SAFE', topicIds: [], associationIds: [], evidenceState: 'VERIFIED', ...common,
  }];
  for (const asset of input.assets) nodes.push({
    id: asset.id, type: 'XROGA_ASSET', label: asset.title, url: new URL(asset.url, 'https://xroga.com').toString(),
    ownership: 'OWNED', privacy: 'PUBLIC_SAFE', topicIds: asset.topicClusterIds, associationIds: [], evidenceState: 'VERIFIED', ...common,
  });
  if (input.actionReady) nodes.push({ id: 'action.project-check', type: 'GITHUB_ACTION', label: 'Xroga Project Check', url: `${input.repositoryUrl}/tree/main/.github/actions/project-check`, ownership: 'OWNED', privacy: 'PUBLIC_SAFE', topicIds: ['topic.production-readiness'], associationIds: [], evidenceState: 'VERIFIED', ...common });
  if (input.skillReady) nodes.push({ id: 'skill.project-check', type: 'SKILL', label: 'Xroga project-check skill', url: `${input.repositoryUrl}/tree/main/growth/authority/skills`, ownership: 'OWNED', privacy: 'PUBLIC_SAFE', topicIds: ['topic.production-readiness'], associationIds: [], evidenceState: 'VERIFIED', ...common });
  const edges: AuthorityEdge[] = nodes.filter((node) => node.id !== 'repo.xroga-main').map((node) => ({
    id: `edge.repo.${node.id}`, fromId: 'repo.xroga-main', toId: node.id, relationship: 'FEATURES',
    evidenceState: 'VERIFIED', sourceUrl: node.url, ...common,
  }));
  return { nodes, edges };
}
