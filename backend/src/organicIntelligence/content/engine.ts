import {
  classifyGscRow, demandMatchesText, normalizedTokens,
} from '../engine.js';
import type {
  CanonicalFact, DemandItem, GscRow, Opportunity,
} from '../model.js';
import type {
  AssetInventory, AssetResolution, ClaimRecord, ContentBrief, ContentManifest,
  DecaySignal, EvidenceManifestItem, FanOutQuestion, KeywordMetric, ResearchCandidate,
  SerpObservation, SleeperPage, SourceRecord, VisualManifestItem,
} from './model.js';

export const RESEARCH_MODIFIERS = {
  COMMERCIAL: ['best', 'tools', 'platform', 'pricing', 'cost'],
  COMPARISON: ['vs', 'alternative', 'alternatives', 'compared'],
  JOB: ['build', 'fix', 'repair', 'deploy', 'test', 'verify', 'refactor', 'migrate'],
  TECH: ['GitHub', 'Vercel', 'Supabase', 'Next.js', 'React', 'TypeScript'],
  PROBLEM: ['broken', 'failed', 'production', 'security', 'ownership', 'lock-in'],
} as const;

export const CONTENT_FAMILY_CONTRACTS = {
  TOPIC_HUB: { requiredSections: ['Direct answer', 'Topic map', 'Evidence', 'Limitations', 'Next action'], requiresExternalSources: false, requiresOriginalData: false },
  COMPARISON: { requiredSections: ['Direct answer', 'Comparison matrix', 'Best fit', 'Sources', 'Limitations'], requiresExternalSources: true, requiresOriginalData: false },
  ALTERNATIVE: { requiredSections: ['Reason for switching', 'Fit criteria', 'Multiple legitimate options', 'Sources', 'Next action'], requiresExternalSources: true, requiresOriginalData: false },
  MIGRATION: { requiredSections: ['Prerequisites', 'What transfers', 'What does not transfer', 'Steps', 'Failure modes', 'Validation'], requiresExternalSources: true, requiresOriginalData: false },
  INTEGRATION: { requiredSections: ['What it enables', 'Permissions', 'Workflow', 'Limitations', 'Verification'], requiresExternalSources: true, requiresOriginalData: false },
  TROUBLESHOOTING: { requiredSections: ['Symptom', 'Likely causes', 'Diagnostic steps', 'Fix', 'Verification'], requiresExternalSources: false, requiresOriginalData: false },
  RESEARCH: { requiredSections: ['Direct answer', 'Methodology', 'Dataset', 'Results', 'Limitations', 'Sources'], requiresExternalSources: true, requiresOriginalData: true },
  FREE_TOOL: { requiredSections: ['Direct answer', 'Tool', 'Methodology', 'Limitations', 'Conversion path'], requiresExternalSources: false, requiresOriginalData: false },
} as const;

export type ContentFamily = keyof typeof CONTENT_FAMILY_CONTRACTS;

export function validateContentFamily(input: {
  family: ContentFamily; sections: readonly string[]; sourceCount: number;
  sourceState?: KeywordMetric['status']; distinctIntent: boolean; originalDataAvailable: boolean;
}): string[] {
  const contract = CONTENT_FAMILY_CONTRACTS[input.family];
  const issues: string[] = [];
  const sourceState = input.sourceState ?? (input.sourceCount > 0 ? 'AVAILABLE' : 'NO_DATA');
  if (!input.distinctIntent) issues.push('Distinct intent is required; update or merge an existing asset instead.');
  for (const section of contract.requiredSections) if (!input.sections.some((value) => value.toLowerCase().includes(section.toLowerCase()))) issues.push(`Missing ${input.family} section: ${section}.`);
  if (contract.requiresExternalSources && (input.sourceCount === 0 || sourceState !== 'AVAILABLE')) issues.push(`${input.family} requires current AVAILABLE source evidence; received ${sourceState}.`);
  if (contract.requiresOriginalData && !input.originalDataAvailable) issues.push(`${input.family} cannot publish results without an original dataset.`);
  return issues;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function similarity(left: string, right: string): number {
  const a = new Set(normalizedTokens(left));
  const b = new Set(normalizedTokens(right));
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / union.size;
}

export function generateResearchCandidates(demand: readonly DemandItem[], modifiers = RESEARCH_MODIFIERS): ResearchCandidate[] {
  const candidates: ResearchCandidate[] = [];
  for (const item of demand.filter((entry) => entry.kind === 'TOPIC_CLUSTER')) {
    candidates.push({
      id: `idea:${slug(item.id)}:seed`, query: item.value, origin: 'GENERATED_IDEA', status: 'UNKNOWN',
      seedDemandId: item.id, modifier: null, relatedEntityIds: item.relatedEntityIds, evidenceIds: [],
      businessPotential: item.businessPotential, intentFit: item.intentFit, difficulty: 'UNKNOWN',
      aiSatisfactionRisk: item.aiSatisfactionRisk, clickDefensibility: item.clickDefensibility,
      strategy: item.strategy,
    });
    for (const values of Object.values(modifiers)) {
      for (const modifier of values) {
        const query = `${modifier} ${item.value}`;
        candidates.push({
          id: `idea:${slug(item.id)}:${slug(modifier)}`, query, origin: 'GENERATED_IDEA', status: 'UNKNOWN',
          seedDemandId: item.id, modifier, relatedEntityIds: item.relatedEntityIds, evidenceIds: [],
          businessPotential: item.businessPotential, intentFit: item.intentFit, difficulty: 'UNKNOWN',
          aiSatisfactionRisk: item.aiSatisfactionRisk, clickDefensibility: item.clickDefensibility,
          strategy: item.strategy,
        });
      }
    }
  }
  return candidates;
}

export function attachValidatedDemand(candidates: readonly ResearchCandidate[], metrics: readonly KeywordMetric[]): ResearchCandidate[] {
  return candidates.map((candidate) => {
    const matched = metrics.filter((metric) => metric.status === 'AVAILABLE' && similarity(metric.keyword, candidate.query) >= 0.58);
    if (!matched.length) return candidate;
    const difficulty = matched.some((metric) => metric.keywordDifficulty != null)
      ? Math.min(5, Math.max(0, Math.round((matched.find((metric) => metric.keywordDifficulty != null)?.keywordDifficulty ?? 0) / 20)))
      : 'UNKNOWN';
    return {
      ...candidate, origin: 'VALIDATED_DEMAND', status: 'AVAILABLE', difficulty,
      evidenceIds: matched.map((metric) => metric.id).sort(),
    };
  });
}

export function rankResearchCandidate(candidate: ResearchCandidate, metrics: readonly KeywordMetric[]): { priority: 'P1' | 'P2' | 'P3' | 'P4'; rationale: string[] } {
  const evidence = metrics.filter((metric) => candidate.evidenceIds.includes(metric.id));
  if (candidate.origin !== 'VALIDATED_DEMAND' || !evidence.length) return { priority: 'P4', rationale: ['Demand is UNKNOWN; generated ideas cannot qualify as validated opportunities.'] };
  const business = typeof candidate.businessPotential === 'number' ? candidate.businessPotential : null;
  const fit = typeof candidate.intentFit === 'number' ? candidate.intentFit : null;
  if (business == null || fit == null) return { priority: 'P4', rationale: ['Business potential or intent fit is UNKNOWN.'] };
  const maxVolume = Math.max(...evidence.map((metric) => metric.volume ?? 0));
  if (business <= 2 || fit <= 2) return { priority: 'P4', rationale: [`Observed volume (${maxVolume}) cannot overcome weak product or intent fit.`] };
  if (business >= 5 && fit >= 5) return { priority: 'P1', rationale: [`High product and intent fit outrank raw volume; observed volume is ${maxVolume}.`] };
  if (business >= 4 && fit >= 4) return { priority: 'P2', rationale: [`Strong product and intent fit with observed demand (${maxVolume}).`] };
  return { priority: 'P3', rationale: [`Moderate product/intent fit with observed demand (${maxVolume}).`] };
}

export function classifyCompetitorContentGap(input: {
  demandStatus: KeywordMetric['status']; productSupported: boolean; xrogaCoverage: boolean;
  competitorCoverage: number; formatMismatch: boolean; brandAssociationMissing: boolean;
}): 'REAL_DEMAND_GAP' | 'BRAND_GAP' | 'FORMAT_GAP' | 'LOW_VALUE_COPYCAT' | 'PRODUCT_GAP' {
  if (!input.productSupported) return 'PRODUCT_GAP';
  if (input.demandStatus !== 'AVAILABLE') return 'LOW_VALUE_COPYCAT';
  if (input.formatMismatch) return 'FORMAT_GAP';
  if (input.brandAssociationMissing && input.xrogaCoverage) return 'BRAND_GAP';
  if (!input.xrogaCoverage && input.competitorCoverage > 0) return 'REAL_DEMAND_GAP';
  return 'LOW_VALUE_COPYCAT';
}

export function applyKeywordEvidenceToDemand(demand: readonly DemandItem[], metrics: readonly KeywordMetric[]): DemandItem[] {
  return demand.map((item) => {
    const matched = metrics.filter((metric) => metric.status === 'AVAILABLE' && demandMatchesText(item, metric.keyword));
    if (!matched.length) return item;
    return {
      ...item,
      dataStatus: 'AVAILABLE' as const,
      difficulty: matched.some((metric) => metric.keywordDifficulty != null)
        ? Math.min(5, Math.max(0, Math.round((matched.find((metric) => metric.keywordDifficulty != null)?.keywordDifficulty ?? 0) / 20)))
        : item.difficulty,
      evidence: [
        ...item.evidence,
        ...matched.map((metric) => ({
          source: metric.source, sourceType: 'AHREFS' as const, observedAt: metric.observedAt,
          lastVerifiedAt: metric.observedAt, verificationDue: null,
          confidence: 'OBSERVED' as const, freshness: 'CURRENT' as const,
          note: `Validated demand record ${metric.id}; null provider metrics remain UNKNOWN.`,
        })),
      ],
    };
  });
}

export type BidResult = {
  businessPotential: DemandItem['businessPotential'];
  intent: ReturnType<typeof decideSearchIntent>;
  difficulty: DemandItem['difficulty'];
  aiSatisfactionRisk: DemandItem['aiSatisfactionRisk'];
  clickDefensibility: DemandItem['clickDefensibility'];
  recommendedStrategy: DemandItem['strategy'];
  evidence: string[];
};

export function scoreBid(item: DemandItem, metrics: readonly KeywordMetric[], serp: readonly SerpObservation[]): BidResult {
  const matchingMetrics = metrics.filter((metric) => demandMatchesText(item, metric.keyword) && metric.status === 'AVAILABLE');
  const matchingSerp = serp.filter((row) => demandMatchesText(item, row.query));
  const kd = matchingMetrics.find((metric) => metric.keywordDifficulty != null)?.keywordDifficulty;
  const intent = decideSearchIntent(matchingSerp);
  const clickDefensibility = intent.intent === 'TOOL' && item.requiredAssetType === 'TOOL'
    ? Math.max(typeof item.clickDefensibility === 'number' ? item.clickDefensibility : 0, 4) as DemandItem['clickDefensibility']
    : item.clickDefensibility;
  const recommendedStrategy = typeof item.aiSatisfactionRisk === 'number' && typeof clickDefensibility === 'number'
    ? item.aiSatisfactionRisk >= 4 && clickDefensibility <= 2
      ? 'AEO_FIRST' as const
      : item.aiSatisfactionRisk <= 2 && clickDefensibility >= 4
        ? 'SEO_FIRST' as const
        : 'HYBRID' as const
    : item.strategy;
  return {
    businessPotential: item.businessPotential,
    intent,
    difficulty: kd == null ? 'UNKNOWN' : Math.min(5, Math.max(0, Math.round(kd / 20))),
    aiSatisfactionRisk: item.aiSatisfactionRisk,
    clickDefensibility,
    recommendedStrategy,
    evidence: [...matchingMetrics.map((metric) => metric.id), ...matchingSerp.map((row) => row.id)].sort(),
  };
}

export function decideSearchIntent(rows: readonly SerpObservation[]): { status: 'AVAILABLE' | 'NO_DATA'; intent: SerpObservation['observedIntent'] | 'UNKNOWN'; reason: string } {
  if (!rows.length) return { status: 'NO_DATA', intent: 'UNKNOWN', reason: 'No structured SERP observation is available.' };
  const counts = new Map<SerpObservation['observedIntent'], number>();
  for (const row of rows) counts.set(row.observedIntent, (counts.get(row.observedIntent) ?? 0) + 1);
  const [intent, count] = [...counts.entries()].sort(([leftIntent, left], [rightIntent, right]) => right - left || leftIntent.localeCompare(rightIntent))[0];
  return { status: 'AVAILABLE', intent, reason: `${count}/${rows.length} observed results support ${intent}.` };
}

export function detectVideoGaps(demand: readonly DemandItem[], serp: readonly SerpObservation[], inventory: readonly AssetInventory[]) {
  return demand.flatMap((item) => {
    const rows = serp.filter((row) => demandMatchesText(item, row.query));
    if (!rows.length || !rows.some((row) => row.videoPresent || row.contentType === 'VIDEO')) return [];
    const existing = inventory.some((asset) => asset.topicClusterIds.includes(item.id) && asset.visualClasses.includes('VIDEO'));
    if (existing) return [];
    return [{
      query: rows[0].query, topicClusterId: item.id,
      rankingVideoUrls: rows.filter((row) => row.contentType === 'VIDEO').map((row) => row.url),
      competitors: [...new Set(rows.filter((row) => row.contentType === 'VIDEO').map((row) => row.domain))],
      xrogaVideoCoverage: 'ABSENT' as const, potentialVideoTitle: `${item.value}: a verified Xroga workflow`,
      associatedPage: inventory.find((asset) => asset.topicClusterIds.includes(item.id))?.url ?? null,
      priority: 'P3' as const, evidence: rows.map((row) => row.id),
    }];
  });
}

export function buildQueryFanOut(
  promptFamilies: readonly DemandItem[],
  inventory: readonly AssetInventory[],
  entityAssociations: Readonly<Record<string, readonly string[]>>,
): FanOutQuestion[] {
  return promptFamilies.filter((item) => item.kind === 'PROMPT_FAMILY').flatMap((family) => {
    const topic = family.parentId ?? family.id;
    const questions = new Set<string>([family.userJob]);
    for (const entityId of family.relatedEntityIds) for (const association of entityAssociations[entityId] ?? []) questions.add(association);
    return [...questions].sort().map((question) => {
      const asset = inventory.filter((candidate) => candidate.entityIds.some((entityId) => family.relatedEntityIds.includes(entityId)))
        .sort((left, right) => Number(right.topicClusterIds.includes(topic)) - Number(left.topicClusterIds.includes(topic)) || left.url.localeCompare(right.url))[0];
      const coverageStrength = asset ? (similarity(`${asset.title} ${asset.contentFamily}`, question) >= 0.2 ? 4 : 2) : 0;
      return {
        promptFamilyId: family.id, coreJob: family.userJob, fanOutQuestion: question,
        topicClusterId: topic, entityId: family.relatedEntityIds[0] ?? 'product.xroga',
        evidenceSource: `growth/source/demand.json#${family.id}`, importance: family.businessPotential,
        coveredByUrl: asset?.url ?? null, coverageStrength, missing: !asset || coverageStrength < 3,
        recommendedAction: !asset ? 'RESEARCH_REQUIRED' as const : coverageStrength < 3 ? 'EXPAND_EXISTING' as const : 'COVER_IN_EXISTING' as const,
      };
    });
  });
}

export function resolveExistingAsset(candidate: ResearchCandidate | DemandItem, inventory: readonly AssetInventory[]): AssetResolution {
  const query = 'query' in candidate ? candidate.query : `${candidate.value} ${candidate.userJob}`;
  const topic = 'seedDemandId' in candidate ? candidate.seedDemandId : candidate.id;
  const expectedIntent = 'requiredAssetType' in candidate
    ? ({ PRODUCT: 'PRODUCT', FEATURE: 'PRODUCT', CATEGORY: 'CATEGORY', GUIDE: 'GUIDE', COMPARISON: 'COMPARISON', ALTERNATIVE: 'ALTERNATIVE', MIGRATION: 'MIGRATION', VIDEO: 'VIDEO', TOOL: 'TOOL', RESEARCH: 'RESEARCH', DOCUMENTATION: 'DOCUMENTATION', TEMPLATE: 'TEMPLATE', SHOWCASE: 'OTHER', PUBLIC_REPORT: 'RESEARCH', BLOG: 'GUIDE', BENCHMARK: 'RESEARCH', THIRD_PARTY_EDITORIAL: 'OTHER', COMMUNITY: 'COMMUNITY', OTHER: 'OTHER' } as const)[candidate.requiredAssetType]
    : null;
  const matches = inventory.map((asset) => ({
    asset,
    lexicalOverlap: similarity(query, `${asset.title} ${asset.contentFamily}`),
    overlap: Math.max(similarity(query, `${asset.title} ${asset.contentFamily}`), asset.topicClusterIds.includes(topic) ? 0.85 : 0),
  })).sort((left, right) => right.overlap - left.overlap || left.asset.url.localeCompare(right.asset.url));
  const best = matches[0];
  if (!best || best.overlap < 0.35) return { candidateId: candidate.id, decision: 'BUILD_NEW', targetUrl: null, overlap: best?.overlap ?? 0, reason: 'No current asset serves the topic and intent.', cannibalizationWarning: null };
  if (expectedIntent && best.asset.intent !== expectedIntent) {
    if (best.asset.topicClusterIds.includes(topic) && best.lexicalOverlap >= 0.35) {
      return { candidateId: candidate.id, decision: 'REPOSITION', targetUrl: best.asset.url, overlap: best.overlap, reason: `The current asset covers the query but its ${best.asset.intent} intent does not match the required ${expectedIntent} intent.`, cannibalizationWarning: null };
    }
    return { candidateId: candidate.id, decision: 'BUILD_NEW', targetUrl: null, overlap: best.lexicalOverlap, reason: `The related asset serves a distinct ${best.asset.intent} intent; it must not be repurposed for ${expectedIntent}.`, cannibalizationWarning: null };
  }
  const duplicates = matches.filter((match) => match.overlap >= 0.7);
  if (duplicates.length > 1) return { candidateId: candidate.id, decision: 'MERGE', targetUrl: best.asset.url, overlap: best.overlap, reason: 'Several current assets materially overlap.', cannibalizationWarning: `Potential overlap: ${duplicates.map((item) => item.asset.url).join(', ')}` };
  return {
    candidateId: candidate.id,
    decision: best.asset.qualityScore != null && best.asset.qualityScore >= 85 ? 'IGNORE' : best.overlap >= 0.7 ? 'UPDATE_EXISTING' : 'EXPAND_EXISTING',
    targetUrl: best.asset.url, overlap: best.overlap,
    reason: best.overlap >= 0.7 ? 'An indexed asset already owns this intent.' : 'A related indexed asset should be expanded before a new URL is considered.',
    cannibalizationWarning: null,
  };
}

export function detectCannibalization(inventory: readonly AssetInventory[]): Array<{ urls: string[]; topicClusterId: string; overlap: number }> {
  const warnings: Array<{ urls: string[]; topicClusterId: string; overlap: number }> = [];
  for (let left = 0; left < inventory.length; left += 1) {
    for (let right = left + 1; right < inventory.length; right += 1) {
      const shared = inventory[left].topicClusterIds.find((topic) => inventory[right].topicClusterIds.includes(topic));
      if (!shared) continue;
      const overlap = similarity(`${inventory[left].title} ${inventory[left].contentFamily}`, `${inventory[right].title} ${inventory[right].contentFamily}`);
      if (overlap >= 0.55 && inventory[left].intent === inventory[right].intent) warnings.push({ urls: [inventory[left].url, inventory[right].url], topicClusterId: shared, overlap });
    }
  }
  return warnings;
}

export function buildTopicHubs(inventory: readonly AssetInventory[]): Array<{ topicClusterId: string; hub: string | null; supporting: string[] }> {
  const topics = [...new Set(inventory.flatMap((item) => item.topicClusterIds))].sort();
  return topics.map((topicClusterId) => {
    const assets = inventory.filter((item) => item.topicClusterIds.includes(topicClusterId));
    const hub = assets.find((item) => ['CATEGORY', 'PRODUCT'].includes(item.intent)) ?? null;
    return { topicClusterId, hub: hub?.url ?? null, supporting: assets.filter((item) => item.url !== hub?.url).map((item) => item.url).sort() };
  });
}

export function analyzeGsc(rows: readonly GscRow[]) {
  const classifications = rows.map((row) => ({ row, states: classifyGscRow(row) }));
  const byPageQuery = new Map<string, GscRow[]>();
  for (const row of rows) {
    const key = `${row.page}|${row.query.toLowerCase()}`;
    byPageQuery.set(key, [...(byPageQuery.get(key) ?? []), row]);
  }
  const declines = [...byPageQuery.values()].flatMap((group) => {
    const sorted = [...group].sort((left, right) => left.date.localeCompare(right.date));
    if (sorted.length < 2) return [];
    const first = sorted[0]; const last = sorted[sorted.length - 1];
    return last.impressions < first.impressions * 0.75 || last.clicks < first.clicks * 0.75
      ? [{ page: last.page, query: last.query, first, last }]
      : [];
  });
  const queryPages = new Map<string, Set<string>>();
  for (const row of rows) if (row.impressions > 0) queryPages.set(row.query.toLowerCase(), new Set([...(queryPages.get(row.query.toLowerCase()) ?? []), row.page]));
  const cannibalization = [...queryPages.entries()].filter(([, pages]) => pages.size > 1).map(([query, pages]) => ({ query, pages: [...pages].sort() }));
  return { classifications, declines, cannibalization };
}

export function validatedGscQueryIds(item: DemandItem, rows: readonly GscRow[]): string[] {
  return [...new Set(rows
    .filter((row) => row.impressions > 0 && demandMatchesText(item, row.query))
    .map((row) => {
      const page = new URL(row.page);
      return `gsc:${row.date}:${slug(page.hostname)}:${slug(page.pathname)}:${slug(row.query)}`;
    }))].sort();
}

export function detectSleeperPages(rows: readonly GscRow[], inventory: readonly AssetInventory[], now = new Date()): SleeperPage[] {
  const analysis = analyzeGsc(rows);
  const byPage = new Map<string, typeof analysis.declines>();
  for (const decline of analysis.declines) byPage.set(new URL(decline.page).pathname, [...(byPage.get(new URL(decline.page).pathname) ?? []), decline]);
  return [...byPage.entries()].flatMap(([url, declines]) => {
    const asset = inventory.find((item) => item.url === url);
    if (!asset) return [];
    const age = (now.getTime() - new Date(asset.lastVerifiedAt).getTime()) / 86_400_000;
    return [{
      url, historicalEvidence: declines.map((item) => `${item.query}: ${item.first.impressions} impressions on ${item.first.date}`),
      currentEvidence: declines.map((item) => `${item.query}: ${item.last.impressions} impressions on ${item.last.date}`),
      authorityEvidence: [], freshness: age > 90 ? 'STALE' as const : age > 30 ? 'VERIFY_SOON' as const : 'CURRENT' as const,
      reason: 'Observed GSC query/page performance declined across supplied dated rows.',
      recommendedRefresh: 'Review intent match, dated facts, answer completeness, visuals, and internal links without changing the historical publication date.',
      priority: declines.some((item) => item.first.impressions >= 1000) ? 'P1' as const : 'P2' as const,
    }];
  });
}

export function detectContentDecay(
  inventory: readonly AssetInventory[], claims: readonly ClaimRecord[], now = new Date(), gscRows: readonly GscRow[] = [],
): DecaySignal[] {
  const signals: DecaySignal[] = [];
  for (const claim of claims) {
    if (new Date(claim.nextVerificationDue) >= now) continue;
    for (const page of claim.pagesUsingClaim) signals.push({
      url: page, type: claim.volatility === 'HIGH' ? 'STALE_COMPETITOR_FACT' : 'STALE_PRODUCT_FACT',
      status: 'STALE', evidence: claim.sourceIds, reason: `Claim ${claim.claimId} passed its verification due date.`,
    });
  }
  for (const sleeper of detectSleeperPages(gscRows, inventory, now)) signals.push({ url: sleeper.url, type: 'DECLINING_PAGE', status: 'AVAILABLE', evidence: sleeper.currentEvidence, reason: sleeper.reason });
  return signals;
}

export function validateSourcesAndClaims(sources: readonly SourceRecord[], claims: readonly ClaimRecord[], now = new Date()): string[] {
  const issues: string[] = [];
  const sourceIds = new Set(sources.map((source) => source.sourceId));
  if (sourceIds.size !== sources.length) issues.push('Source registry contains duplicate source IDs.');
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  if (claimIds.size !== claims.length) issues.push('Claim registry contains duplicate claim IDs.');
  const normalizedClaims = claims.map((claim) => claim.text.trim().toLowerCase().replace(/\s+/g, ' '));
  if (new Set(normalizedClaims).size !== normalizedClaims.length) issues.push('Claim registry contains duplicate normalized claim text.');
  const maximumAgeDays = { HIGH: 30, MEDIUM: 90, LOW: 365 } as const;
  for (const source of sources) {
    const ageDays = (now.getTime() - new Date(source.verifiedAt).getTime()) / 86_400_000;
    if (ageDays > maximumAgeDays[source.volatility]) issues.push(`Source ${source.sourceId} is stale for ${source.volatility} volatility.`);
  }
  for (const claim of claims) {
    for (const sourceId of claim.sourceIds) if (!sourceIds.has(sourceId)) issues.push(`Claim ${claim.claimId} references missing source ${sourceId}.`);
    if (new Date(claim.nextVerificationDue) < now) issues.push(`Claim ${claim.claimId} is stale.`);
  }
  return issues;
}

export const QUALITY_WEIGHTS = {
  intentMatch: 15, productRelevance: 10, originalEvidence: 15, answerCompleteness: 10,
  citationReadiness: 10, visualProof: 10, sourceQuality: 10, freshness: 5,
  internalLinking: 5, conversionPath: 5, technicalReadiness: 5,
} as const;

export type QualityDimensions = Record<keyof typeof QUALITY_WEIGHTS, number>;

export function scoreContentQuality(dimensions: QualityDimensions, threshold = 75) {
  const deficiencies: string[] = [];
  let total = 0;
  for (const [name, max] of Object.entries(QUALITY_WEIGHTS) as Array<[keyof QualityDimensions, number]>) {
    const value = dimensions[name];
    if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Invalid quality component ${name}: expected 0-${max}.`);
    total += value;
    if (value < max * 0.7) deficiencies.push(`${name} is ${value}/${max}.`);
  }
  return { total, threshold, ready: total >= threshold, deficiencies };
}

export function validateCitationReadyManifest(manifest: ContentManifest, sources: readonly SourceRecord[], claims: readonly ClaimRecord[]): string[] {
  const issues: string[] = [];
  const required = ['Direct answer', 'At a glance', 'Evidence', 'Limitations', 'Next action'];
  for (const section of required) if (!manifest.requiredSections.some((item) => item.toLowerCase().includes(section.toLowerCase()))) issues.push(`Missing citation-ready section: ${section}.`);
  if (manifest.description.length < 70 || manifest.description.length > 170) issues.push('Description should be 70-170 characters.');
  if (manifest.title.length > 70) issues.push('Title exceeds 70 characters.');
  if (manifest.evidenceManifest.filter((item) => item.publicSafe).length < 2) issues.push('At least two public-safe evidence classes are required.');
  if (!manifest.visualManifest.some((item) => item.publicSafe)) issues.push('A public-safe visual is required.');
  if (manifest.related.includes(new URL(manifest.canonical).pathname)) issues.push('Self-link detected.');
  if (new Set(manifest.related).size !== manifest.related.length) issues.push('Duplicate internal link detected.');
  if (!sources.length || !claims.length) issues.push('Source and claim registries are required.');
  const sourceIds = new Set(sources.map((source) => source.sourceId));
  const pathname = new URL(manifest.canonical).pathname;
  for (const sourceId of manifest.sourceIds) if (!sourceIds.has(sourceId)) issues.push(`Manifest references missing source ${sourceId}.`);
  for (const item of manifest.evidenceManifest) if (!sourceIds.has(item.source)) issues.push(`Evidence manifest references missing source ${item.source}.`);
  for (const source of sources) if (!source.pagesUsingSource.includes(pathname)) issues.push(`Source ${source.sourceId} does not declare page ${pathname}.`);
  const claimIds = new Set(claims.map((claim) => claim.claimId));
  for (const claimId of manifest.claimIds) if (!claimIds.has(claimId)) issues.push(`Manifest references missing claim ${claimId}.`);
  for (const claim of claims) if (!claim.pagesUsingClaim.includes(pathname)) issues.push(`Claim ${claim.claimId} does not declare page ${pathname}.`);
  issues.push(...validateSourcesAndClaims(sources, claims));
  if (manifest.visualManifest.every((item) => item.type === 'ILLUSTRATION') && manifest.qualityDimensions.visualProof > 5) {
    issues.push('Illustration-only visual evidence cannot claim more than 5/10 visual proof.');
  }
  const quality = scoreContentQuality(manifest.qualityDimensions, manifest.intent === 'COMPARISON' || manifest.intent === 'RESEARCH' ? 80 : 75);
  if (quality.total !== manifest.qualityScore) issues.push(`Stored quality score ${manifest.qualityScore} does not match component total ${quality.total}.`);
  if (JSON.stringify(quality.deficiencies) !== JSON.stringify(manifest.qualityDeficiencies)) issues.push('Stored quality deficiencies do not match component scoring.');
  if (!quality.ready) issues.push(`Quality score ${quality.total} is below ${quality.threshold}.`);
  return issues;
}

export function editorialQualityCheck(text: string): string[] {
  const issues: string[] = [];
  const normalized = text.toLowerCase();
  const filler = ['revolutionary', 'game-changing', 'in today\'s fast-paced world', 'unlock the power', 'delve into'];
  for (const phrase of filler) if (normalized.includes(phrase)) issues.push(`Unsupported editorial filler: ${phrase}.`);
  if (/\b(best|leading|ultimate|guaranteed)\b/i.test(text) && !/source|evidence|measured|observed/i.test(text)) issues.push('Unsupported superlative requires evidence or removal.');
  if (/\b(todo|tbd|lorem ipsum|placeholder)\b/i.test(text)) issues.push('Placeholder copy is not publishable.');
  const sentences = text.split(/[.!?]+/).map((sentence) => sentence.trim().toLowerCase()).filter((sentence) => sentence.length > 30);
  if (new Set(sentences).size < sentences.length) issues.push('Repeated sentence detected.');
  return issues;
}

export function ctaFor(intent: ContentManifest['intent'], existingRepository = false): { label: string; href: string } {
  if (existingRepository) return { label: 'Connect your repository', href: '/auth/signup' };
  const mapping: Partial<Record<ContentManifest['intent'], { label: string; href: string }>> = {
    GUIDE: { label: 'Try this workflow with Xroga', href: '/auth/signup' },
    COMPARISON: { label: 'Try Xroga on your own repository', href: '/auth/signup' },
    MIGRATION: { label: 'Connect your repository', href: '/auth/signup' },
    RESEARCH: { label: 'Test your repository', href: '/auth/signup' },
    DOCUMENTATION: { label: 'Open the workspace', href: '/workspace' },
    TOOL: { label: 'Use Xroga on your project', href: '/auth/signup' },
  };
  return mapping[intent] ?? { label: 'Start a Xroga workflow', href: '/auth/signup' };
}

export function suggestInternalLinks(asset: AssetInventory, inventory: readonly AssetInventory[]): string[] {
  return inventory.filter((candidate) => candidate.url !== asset.url)
    .map((candidate) => ({ candidate, score: candidate.topicClusterIds.filter((topic) => asset.topicClusterIds.includes(topic)).length * 2 + candidate.entityIds.filter((entity) => asset.entityIds.includes(entity)).length }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.candidate.url.localeCompare(right.candidate.url))
    .slice(0, 5).map((item) => item.candidate.url);
}

export function detectOrphanAssets(inventory: readonly AssetInventory[]): string[] {
  if (inventory.length <= 1) return inventory.map((asset) => asset.url);
  return inventory.filter((asset) => suggestInternalLinks(asset, inventory).length === 0).map((asset) => asset.url).sort();
}

export function buildBrief(input: {
  opportunity: Opportunity; demand: DemandItem; asset: AssetInventory; fanOut: FanOutQuestion[];
  inventory: AssetInventory[];
  validatedKeywordIds: string[];
  facts: CanonicalFact[]; sources: SourceRecord[]; evidence: EvidenceManifestItem[]; visuals: VisualManifestItem[];
}): ContentBrief {
  const { opportunity, demand, asset } = input;
  const cta = ctaFor(asset.intent, asset.topicClusterIds.includes('topic.existing-repositories'));
  return {
    briefId: `brief:${opportunity.id}`, opportunityId: opportunity.id, gapIds: opportunity.gapIds,
    targetUrl: asset.url, mode: 'EXISTING', action: 'FIX', primaryEntityId: opportunity.entityId,
    primaryTopicId: opportunity.topicClusterId, primaryUserJob: demand.userJob, audience: demand.audience,
    funnelStage: demand.funnelStage, businessPotential: demand.businessPotential, searchIntent: asset.intent,
    promptFamilyIds: [...new Set(input.fanOut.map((item) => item.promptFamilyId))],
    validatedKeywordIds: [...new Set(input.validatedKeywordIds)].sort(),
    fanOutQuestions: input.fanOut, competitorIds: [], serpEvidenceIds: [], format: demand.requiredAssetType,
    requiredSections: ['Direct answer', 'At a glance', 'How the workflow works', 'Evidence', 'Limitations', 'Next action'],
    requiredQuestions: [...new Set(input.fanOut.map((item) => item.fanOutQuestion))].slice(0, 8).concat(input.fanOut.length ? [] : [demand.userJob]),
    requiredEvidence: input.evidence.map((item) => item.claimSupported), requiredVisuals: input.visuals.map((item) => item.type),
    sourceIds: input.sources.map((item) => item.sourceId), productFactKeys: input.facts.filter((fact) => fact.entityId === opportunity.entityId || fact.entityId === 'product.xroga').map((fact) => fact.factKey),
    internalLinks: suggestInternalLinks(asset, input.inventory),
    conversionPath: { entryIntent: demand.userJob, valueDelivered: 'A source-backed answer and evidence-led workflow.', nextAction: cta.label, activationEvent: 'Authorized workspace or repository connection.' },
    cta, freshnessRequirements: 'Reverify product code and volatile sources before changing updatedAt.',
    lastVerifiedRequirements: 'Display a real verification date tied to the evidence manifest.',
    schemaRequirements: ['WebPage', 'BreadcrumbList'], limitations: ['Authorization, provider state, and repository policy remain authoritative.'],
    prohibitedClaims: ['Guaranteed rankings or traffic', 'Automatic deployment without authorization', 'Verification without real checks'],
    acceptanceCriteria: ['Direct answer appears before supporting detail.', 'Every material claim resolves to a current source.', 'At least two public-safe evidence classes are present.', 'No new URL is introduced.'],
    evidenceManifest: input.evidence, visualManifest: input.visuals, owner: 'Growth / product truth',
    refreshDue: input.evidence.map((item) => item.freshnessDue).sort()[0],
  };
}

export function selectControlledBatch(
  opportunities: readonly Opportunity[], inventory: readonly AssetInventory[], maximum = 8,
  preferredOpportunityByUrl: ReadonlyMap<string, string> = new Map(),
): Array<{ opportunity: Opportunity; asset: AssetInventory; reason: string }> {
  return opportunities.filter((opportunity) => opportunity.actionTypes.includes('FIX'))
    .flatMap((opportunity) => {
      const candidates = inventory.filter((asset) => asset.indexable
        && asset.topicClusterIds.includes(opportunity.topicClusterId)
        && asset.entityIds.includes(opportunity.entityId)
        && asset.evidenceClasses.length >= 2 && asset.visualClasses.length >= 1);
      return candidates.map((asset) => ({ opportunity, asset, reason: 'Existing indexed asset, Command 1 FIX opportunity, two declared evidence classes, and a public-safe visual are available.' }));
    })
    .sort((left, right) => {
      const rank = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
      return rank[left.opportunity.priority] - rank[right.opportunity.priority] || left.asset.url.localeCompare(right.asset.url);
    })
    .filter((item) => !preferredOpportunityByUrl.has(item.asset.url) || preferredOpportunityByUrl.get(item.asset.url) === item.opportunity.id)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.asset.url === item.asset.url) === index)
    .slice(0, maximum);
}
