import { aiVisibilitySummary, classifyAction, classifyGapTypes, deduplicatePromptFamilies, detectFactProblems, formatGaps, mentionIntersect, prioritizeOpportunity, validateAssociations, validateEntityGraph } from './engine.js';
import type { Association, DemandItem, Gap, Opportunity, OpportunityScores } from './model.js';
import type { IntelligenceSource } from './repository.js';
import { AhrefsProvider } from './providers.js';

export type IntelligenceSnapshot = {
  generatedAt: string;
  source: IntelligenceSource;
  gaps: Gap[];
  opportunities: Opportunity[];
  validationIssues: ReturnType<typeof validateEntityGraph>;
  providerStates: Array<{ provider: string; status: string; reason?: string }>;
  aiVisibility: ReturnType<typeof aiVisibilitySummary>;
  mentionIntersect: ReturnType<typeof mentionIntersect>;
  formatGaps: ReturnType<typeof formatGaps>;
  unknowns: string[];
};

function numberOrUnknown(value: number | 'UNKNOWN'): number | 'UNKNOWN' { return value; }

function scores(association: Association, demand: DemandItem | undefined, hasFormatGap: boolean): OpportunityScores {
  return {
    businessPotential: numberOrUnknown(association.businessValue),
    searchDemand: demand?.dataStatus === 'AVAILABLE' ? demand.businessPotential : 'UNKNOWN',
    promptDemand: demand?.dataStatus === 'AVAILABLE' ? demand.promptRelevance : 'UNKNOWN',
    commercialProximity: demand?.funnelStage === 'EVALUATION' || demand?.funnelStage === 'ACTIVATION' ? 4 : 3,
    productFit: association.productTruthStrength,
    searchIntentFit: demand?.intentFit ?? 'UNKNOWN',
    rankingAttainability: !demand || demand.difficulty === 'UNKNOWN' ? 'UNKNOWN' : 5 - demand.difficulty,
    aiVisibilityGap: 'UNKNOWN', competitorGap: 'UNKNOWN',
    entityAssociationValue: association.importance,
    aiSatisfactionRisk: demand?.aiSatisfactionRisk ?? 'UNKNOWN',
    clickDefensibility: demand?.clickDefensibility ?? 'UNKNOWN',
    formatOpportunity: hasFormatGap ? 4 : 2,
    existingAuthority: association.currentStrength,
    evidenceAvailability: association.confidence === 'VERIFIED' ? 5 : association.confidence === 'OBSERVED' ? 3 : association.confidence === 'INFERRED' ? 2 : 'UNKNOWN',
    conversionPotential: demand?.businessPotential ?? association.businessValue,
    maintenanceBurden: hasFormatGap ? 3 : 2,
    strategicValue: association.importance,
  };
}

function buildGaps(source: IntelligenceSource): Gap[] {
  const gaps: Gap[] = [];
  for (const association of source.associations) {
    if (association.status !== 'ACTIVE' || typeof association.desiredStrength !== 'number' || typeof association.currentStrength !== 'number' || association.currentStrength >= association.desiredStrength) continue;
    const demand = source.demand.find((item) => item.relatedEntityIds.includes(association.entityId) && item.kind === 'TOPIC_CLUSTER');
    const missingFormats = source.formatCoverage.filter((item) => item.topicClusterId === demand?.id && !item.exists);
    const types = classifyGapTypes({ desiredAssociationMissing: true, requiredFormatMissing: missingFormats.length > 0, demandExists: demand?.dataStatus === 'AVAILABLE', xrogaVisibility: association.currentStrength > 1 });
    for (const gapType of types.length ? types : ['TOPIC' as const]) {
      const controlledByXroga = gapType !== 'WEB_MENTION';
      const productSupported = typeof association.productTruthStrength === 'number' && association.productTruthStrength >= 3;
      const actionType = classifyAction({ productTruthSupported: productSupported, meaningfulDemand: association.importance !== 'UNKNOWN' && association.importance >= 3, controlledByXroga, adequateAssetExists: association.currentStrength >= 2, assetDeficient: association.currentStrength < association.desiredStrength, externalSource: gapType === 'WEB_MENTION' });
      gaps.push({
        id: `gap.${association.id}.${gapType.toLowerCase()}`, entityId: association.entityId,
        topicClusterId: demand?.id ?? `topic.${association.id}`, desiredAssociationId: association.id,
        actualAssociation: association.currentStrength > 0 ? `Observed strength ${association.currentStrength}/5` : null,
        platform: 'COMMON_FOUNDATION', competitorIds: source.entities.filter((item) => item.entityType === 'COMPETITOR').map((item) => item.id),
        gapType, currentState: `Association strength ${association.currentStrength}/5 from ${association.confidence.toLowerCase()} repository evidence.`,
        desiredState: `Association strength ${association.desiredStrength}/5 supported by product truth and measured demand.`,
        evidence: [...association.searchDemandEvidence, ...association.promptDemandEvidence], evidenceQuality: association.confidence,
        sourceUrls: source.entities.find((item) => item.id === association.entityId)?.publicUrls ?? [],
        searchDemand: demand?.dataStatus === 'AVAILABLE' ? demand.businessPotential : 'UNKNOWN',
        promptDemand: demand?.dataStatus === 'AVAILABLE' ? demand.promptRelevance : 'UNKNOWN', businessValue: association.businessValue,
        productFit: association.productTruthStrength, format: missingFormats[0]?.format ?? null,
        observedAt: association.lastVerifiedAt, lastVerifiedAt: association.lastVerifiedAt,
        recommendedAction: actionType === 'FIX' ? 'Strengthen the existing evidence-backed asset and its internal association.' : actionType === 'BUILD' ? 'Create the missing format only after real demand evidence confirms it.' : actionType === 'PRODUCT' ? 'Route demand to product strategy; do not claim unsupported capability.' : actionType === 'INFLUENCE' ? 'Evaluate the independent source for legitimate editorial inclusion.' : 'Do not allocate execution capacity.',
        actionType, priority: 'P3', status: 'OPEN',
      });
    }
  }
  return gaps;
}

function buildOpportunities(source: IntelligenceSource, gaps: Gap[]): Opportunity[] {
  const byAssociation = new Map<string, Gap[]>();
  for (const gap of gaps) if (gap.desiredAssociationId) byAssociation.set(gap.desiredAssociationId, [...(byAssociation.get(gap.desiredAssociationId) ?? []), gap]);
  const result: Opportunity[] = [];
  for (const association of source.associations) {
    const related = byAssociation.get(association.id);
    if (!related?.length) continue;
    const demand = source.demand.find((item) => item.id === related[0].topicClusterId);
    const componentScores = scores(association, demand, source.formatCoverage.some((item) => item.topicClusterId === demand?.id && !item.exists));
    const prioritized = prioritizeOpportunity(componentScores);
    for (const gap of related) gap.priority = prioritized.priority;
    result.push({
      id: `opportunity.${association.id}`, entityId: association.entityId, topicClusterId: related[0].topicClusterId,
      gapIds: related.map((item) => item.id), title: association.association,
      strategy: demand?.strategy ?? 'HYBRID', actionTypes: [...new Set(related.map((item) => item.actionType))],
      priority: prioritized.priority, scores: componentScores,
      rationale: [
        `Desired association is ${association.desiredStrength}/5 while observed strength is ${association.currentStrength}/5.`,
        `Product-truth support is ${association.productTruthStrength}/5; confidence is ${association.confidence}.`,
        ...prioritized.rationale,
      ],
      evidence: [...association.searchDemandEvidence, ...association.promptDemandEvidence],
      recommendedWork: [...new Set(related.map((item) => item.recommendedAction))],
      remeasurementPlan: 'Re-import Search Console and prompt-observation samples after the intervention; compare query/page visibility, citation state, and narrative accuracy against this dated baseline.',
    });
  }
  return result.sort((left, right) => left.priority.localeCompare(right.priority));
}

export async function buildIntelligence(source: IntelligenceSource): Promise<IntelligenceSnapshot> {
  const ahrefs = await new AhrefsProvider(process.env.AHREFS_API_TOKEN, false).load();
  const validationIssues = [
    ...validateEntityGraph(source.entities), ...validateAssociations(source.associations, source.entities),
    ...detectFactProblems(source.facts),
  ];
  const promptDuplicates = deduplicatePromptFamilies(source.demand).duplicates;
  validationIssues.push(...promptDuplicates.map((id) => ({ code: 'DUPLICATE_PROMPT_FAMILY', path: id, message: 'Prompt family duplicates a normalized family.' })));
  const gaps = buildGaps(source);
  const opportunities = buildOpportunities(source, gaps);
  const aiVisibility = aiVisibilitySummary(source.promptObservations);
  const unknowns = [
    ...(ahrefs.status !== 'AVAILABLE' ? [`Ahrefs metrics: ${ahrefs.status} (${ahrefs.reason})`] : []),
    ...(source.promptObservations.length === 0 ? ['AI mention/citation rates: NO_DATA; no samples were imported.'] : []),
    ...(source.mentions.length === 0 ? ['Third-party mention intersect: NO_DATA; no verified mention records were imported.'] : []),
    ...(source.demand.some((item) => item.difficulty === 'UNKNOWN') ? ['Ranking difficulty: UNKNOWN where no provider evidence exists.'] : []),
    ...(source.demand.every((item) => item.dataStatus !== 'AVAILABLE') ? ['Search demand volumes: NO_DATA; source taxonomy is not a volume estimate.'] : []),
  ];
  return {
    generatedAt: new Date().toISOString(), source, gaps, opportunities, validationIssues,
    providerStates: [
      { provider: 'repository-product-truth', status: 'AVAILABLE' },
      { provider: 'ahrefs', status: ahrefs.status, reason: ahrefs.reason },
      { provider: 'google-search-console-import', status: source.gscRows.length ? 'AVAILABLE' : 'NO_DATA', reason: source.gscRows.length ? undefined : 'No import supplied for this run.' },
      { provider: 'ai-prompt-observatory', status: source.promptObservations.length ? 'AVAILABLE' : 'NO_DATA' },
      { provider: 'web-mentions', status: source.mentions.length ? 'AVAILABLE' : 'NO_DATA' },
    ],
    aiVisibility, mentionIntersect: mentionIntersect(source.mentions), formatGaps: formatGaps(source.formatCoverage), unknowns,
  };
}
