import { buildIntelligence, type IntelligenceSnapshot } from '../intelligence.js';
import { demandMatchesText } from '../engine.js';
import { loadSource, type IntelligenceSource } from '../repository.js';
import {
  analyzeGsc, applyKeywordEvidenceToDemand, attachValidatedDemand, buildBrief,
  buildQueryFanOut, classifyCompetitorContentGap, decideSearchIntent, detectCannibalization,
  detectContentDecay, detectOrphanAssets, detectSleeperPages,
  detectVideoGaps, generateResearchCandidates, resolveExistingAsset, validatedGscQueryIds,
  selectControlledBatch, validateCitationReadyManifest, validateSourcesAndClaims,
} from './engine.js';
import { loadGrowthContentSource, type GrowthContentSource } from './repository.js';
import type { ContentBrief } from './model.js';

export type GrowthContentSnapshot = {
  generatedAt: string;
  command1: IntelligenceSnapshot;
  sourceStates: GrowthContentSource['providerStates'];
  researchCandidates: ReturnType<typeof generateResearchCandidates>;
  validatedCandidates: ReturnType<typeof attachValidatedDemand>;
  queryFanOut: ReturnType<typeof buildQueryFanOut>;
  searchIntentFindings: Array<{ topicClusterId: string; decision: ReturnType<typeof decideSearchIntent> }>;
  formatOpportunities: Array<{ topicClusterId: string; observedIntent: string; reason: string }>;
  competitorContentGaps: Array<{ candidateId: string; query: string; classification: ReturnType<typeof classifyCompetitorContentGap>; evidence: string[] }>;
  assetResolutions: ReturnType<typeof resolveExistingAsset>[];
  gsc: ReturnType<typeof analyzeGsc>;
  videoGaps: ReturnType<typeof detectVideoGaps>;
  sleepers: ReturnType<typeof detectSleeperPages>;
  decaySignals: ReturnType<typeof detectContentDecay>;
  cannibalizationRisks: ReturnType<typeof detectCannibalization>;
  orphanAssets: string[];
  firstBatch: Array<{ opportunityId: string; url: string; reason: string }>;
  briefs: ContentBrief[];
  contentValidation: Array<{ canonical: string; issues: string[] }>;
  sourceClaimIssues: string[];
  unknowns: string[];
};

function command1SourceWithEvidence(source: IntelligenceSource, growth: GrowthContentSource): IntelligenceSource {
  return { ...source, demand: applyKeywordEvidenceToDemand(source.demand, growth.keywordMetrics) };
}

export async function buildGrowthContentSnapshot(input?: {
  command1Source?: IntelligenceSource; growthSource?: GrowthContentSource; now?: Date;
}): Promise<GrowthContentSnapshot> {
  const now = input?.now ?? new Date();
  const [base, growth] = await Promise.all([
    input?.command1Source ? Promise.resolve(input.command1Source) : loadSource(),
    input?.growthSource ? Promise.resolve(input.growthSource) : loadGrowthContentSource(),
  ]);
  const source = command1SourceWithEvidence(base, growth);
  const command1 = await buildIntelligence(source, { now });
  const researchCandidates = generateResearchCandidates(source.demand);
  const validatedCandidates = attachValidatedDemand(researchCandidates, growth.keywordMetrics);
  const entityAssociations = Object.fromEntries(source.entities.map((entity) => [entity.id, entity.desiredAssociations]));
  const queryFanOut = buildQueryFanOut(source.demand, growth.inventory, entityAssociations);
  const assetResolutions = validatedCandidates.map((candidate) => resolveExistingAsset(candidate, growth.inventory));
  const searchIntentFindings = source.demand.filter((item) => item.kind === 'TOPIC_CLUSTER').map((item) => ({
    topicClusterId: item.id,
    decision: decideSearchIntent(growth.serpObservations.filter((row) => demandMatchesText(item, row.query))),
  }));
  const formatOpportunities = searchIntentFindings.flatMap(({ topicClusterId, decision }) => {
    if (decision.status !== 'AVAILABLE' || decision.intent === 'UNKNOWN') return [];
    const covered = growth.inventory.some((asset) => asset.topicClusterIds.includes(topicClusterId) && asset.intent === decision.intent);
    return covered ? [] : [{ topicClusterId, observedIntent: decision.intent, reason: decision.reason }];
  });
  const competitorContentGaps = validatedCandidates.filter((candidate) => candidate.origin === 'VALIDATED_DEMAND').map((candidate) => {
    const serpRows = growth.serpObservations.filter((row) => row.query.toLowerCase() === candidate.query.toLowerCase());
    const coverage = growth.inventory.filter((asset) => asset.topicClusterIds.includes(candidate.seedDemandId));
    const observedIntent = decideSearchIntent(serpRows);
    return {
      candidateId: candidate.id,
      query: candidate.query,
      classification: classifyCompetitorContentGap({
        demandStatus: candidate.status,
        productSupported: candidate.relatedEntityIds.length > 0,
        xrogaCoverage: coverage.length > 0,
        competitorCoverage: new Set(serpRows.map((row) => row.domain).filter((domain) => domain !== 'xroga.com')).size,
        formatMismatch: observedIntent.status === 'AVAILABLE' && observedIntent.intent !== 'UNKNOWN' && !coverage.some((asset) => asset.intent === observedIntent.intent),
        brandAssociationMissing: false,
      }),
      evidence: [...candidate.evidenceIds, ...serpRows.map((row) => row.id)].sort(),
    };
  });
  const preferredOpportunityByUrl = new Map(growth.manifests.map((manifest) => [new URL(manifest.canonical).pathname, manifest.opportunityId]));
  const selected = selectControlledBatch(command1.opportunities, growth.inventory, 8, preferredOpportunityByUrl);
  const briefs = selected.flatMap(({ opportunity, asset }) => {
    const demand = source.demand.find((item) => item.id === opportunity.topicClusterId);
    const manifest = growth.manifests.find((item) => new URL(item.canonical).pathname === asset.url && item.opportunityId === opportunity.id);
    if (!demand || !manifest) return [];
    const fanOut = queryFanOut.filter((item) => item.topicClusterId === opportunity.topicClusterId || manifest.promptFamilyIds.includes(item.promptFamilyId));
    return [buildBrief({
      opportunity, demand, asset, fanOut, inventory: growth.inventory,
      validatedKeywordIds: validatedCandidates
        .filter((candidate) => candidate.seedDemandId === demand.id && candidate.origin === 'VALIDATED_DEMAND')
        .flatMap((candidate) => candidate.evidenceIds)
        .concat(validatedGscQueryIds(demand, source.gscRows)),
      facts: source.facts,
      sources: growth.sources.filter((record) => record.pagesUsingSource.includes(asset.url)),
      evidence: manifest.evidenceManifest,
      visuals: manifest.visualManifest,
    })];
  });
  const unknowns: string[] = [];
  if (!growth.keywordMetrics.length) unknowns.push('Keyword volume, difficulty, traffic potential, and CPC remain NO_DATA; generated seeds are not validated demand.');
  if (!source.gscRows.length) unknowns.push('GSC query/page demand, decline, CTR, and cannibalization remain NO_DATA.');
  if (!growth.serpObservations.length) unknowns.push('Observed SERP intent, result composition, and video gaps remain NO_DATA.');
  return {
    generatedAt: now.toISOString(), command1, sourceStates: growth.providerStates,
    researchCandidates, validatedCandidates, queryFanOut, searchIntentFindings, formatOpportunities,
    competitorContentGaps, assetResolutions,
    gsc: analyzeGsc(source.gscRows), videoGaps: detectVideoGaps(source.demand, growth.serpObservations, growth.inventory),
    sleepers: detectSleeperPages(source.gscRows, growth.inventory, now),
    decaySignals: detectContentDecay(growth.inventory, growth.claims, now, source.gscRows),
    cannibalizationRisks: detectCannibalization(growth.inventory),
    orphanAssets: detectOrphanAssets(growth.inventory),
    firstBatch: selected.filter((item) => briefs.some((brief) => brief.opportunityId === item.opportunity.id))
      .map((item) => ({ opportunityId: item.opportunity.id, url: item.asset.url, reason: item.reason })),
    briefs,
    contentValidation: growth.manifests.map((manifest) => ({
      canonical: manifest.canonical,
      issues: validateCitationReadyManifest(
        manifest,
        growth.sources.filter((record) => manifest.sourceIds.includes(record.sourceId)),
        growth.claims.filter((record) => manifest.claimIds.includes(record.claimId)),
      ),
    })),
    sourceClaimIssues: validateSourcesAndClaims(growth.sources, growth.claims, now),
    unknowns,
  };
}
