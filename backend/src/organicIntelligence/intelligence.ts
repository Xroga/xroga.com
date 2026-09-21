import {
  aiVisibilityByPlatform, aiVisibilitySummary, classifyAction, classifyGscRow, demandMatchesText,
  detectFactProblems, formatGaps, gscDemandScore, gscRowsForDemand, mentionIntersect,
  normalizedTokens, prioritizeOpportunity, validateAssociations, validateDemand,
  validateEntityGraph, validateEvidenceCollections,
} from './engine.js';
import type {
  Association, DemandItem, Entity, Evidence, FormatCoverage, Gap, GscRow, Mention,
  Opportunity, OpportunityScores, ProductOpportunity, PromptObservation, VisibilityMetric,
} from './model.js';
import { validateCanonicalFactSources, type IntelligenceSource } from './repository.js';
import { AhrefsProvider, type OrganicDataProvider, type ProviderResult } from './providers.js';

export type IntelligenceSnapshot = {
  generatedAt: string;
  source: IntelligenceSource;
  gaps: Gap[];
  opportunities: Opportunity[];
  productOpportunities: ProductOpportunity[];
  validationIssues: ReturnType<typeof validateEntityGraph>;
  providerStates: Array<{ provider: string; status: string; reason?: string }>;
  aiVisibility: ReturnType<typeof aiVisibilitySummary>;
  aiVisibilityByPlatform: ReturnType<typeof aiVisibilityByPlatform>;
  mentionIntersect: ReturnType<typeof mentionIntersect>;
  formatGaps: ReturnType<typeof formatGaps>;
  unknowns: string[];
};

export type IntelligenceOptions = {
  now?: Date;
  ahrefsProvider?: OrganicDataProvider<Record<string, unknown>>;
};

function overlap(left: string, right: string): number {
  const a = new Set(normalizedTokens(left));
  const b = new Set(normalizedTokens(right));
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared;
}

function relevantDemand(source: IntelligenceSource, entityId: string, label: string, includePrompt = false): DemandItem | undefined {
  return source.demand.filter((item) => item.relatedEntityIds.includes(entityId) && (includePrompt || item.kind === 'TOPIC_CLUSTER'))
    .sort((left, right) => overlap(label, `${right.value} ${right.userJob}`) - overlap(label, `${left.value} ${left.userJob}`) || left.id.localeCompare(right.id))[0];
}

function demandFromLabel(source: IntelligenceSource, label: string): DemandItem | undefined {
  return source.demand.find((item) => item.id === label)
    ?? source.demand.filter((item) => demandMatchesText(item, label))
      .sort((left, right) => overlap(label, right.value) - overlap(label, left.value) || left.id.localeCompare(right.id))[0];
}

function relevantAssociation(source: IntelligenceSource, demand: DemandItem, label = demand.value): Association | undefined {
  return source.associations.filter((association) => demand.relatedEntityIds.includes(association.entityId))
    .sort((left, right) => overlap(label, right.association) - overlap(label, left.association) || left.id.localeCompare(right.id))[0];
}

function repositoryInference(association: Association): Evidence {
  return {
    source: `growth/source/associations.json#${association.id}`,
    sourceType: 'REPOSITORY_AUDIT',
    observedAt: association.lastVerifiedAt,
    lastVerifiedAt: association.lastVerifiedAt,
    verificationDue: null,
    confidence: 'INFERRED',
    freshness: 'CURRENT',
    note: 'Internal public-association baseline; not an external search or AI visibility measurement.',
  };
}

function evidenceFromGsc(row: GscRow): Evidence {
  const observedAt = `${row.date}T00:00:00.000Z`;
  return {
    source: `Google Search Console: ${row.page}`,
    sourceType: 'GSC', observedAt, lastVerifiedAt: observedAt, verificationDue: null,
    confidence: 'OBSERVED', freshness: 'CURRENT',
    note: `Query "${row.query}" — ${row.impressions} impressions, ${row.clicks} clicks, position ${row.position}.`,
  };
}

function evidenceFromObservation(observation: PromptObservation): Evidence {
  const observedAt = `${observation.date}T00:00:00.000Z`;
  return {
    source: `AI Prompt Observatory: ${observation.promptId}`,
    sourceType: 'AI_OBSERVATION', observedAt, lastVerifiedAt: observedAt, verificationDue: null,
    confidence: observation.confidence, freshness: 'CURRENT',
    note: `${observation.engine} sample (${observation.sampleSize}) recorded ${observation.xrogaState}; probabilistic observation, not a fixed ranking.`,
  };
}

function evidenceFromMention(mention: Mention): Evidence {
  const observedAt = `${mention.dateDiscovered}T00:00:00.000Z`;
  return {
    source: mention.sourceUrl, sourceType: 'MANUAL_IMPORT', observedAt,
    lastVerifiedAt: mention.dateVerified ? `${mention.dateVerified}T00:00:00.000Z` : null,
    verificationDue: null, confidence: mention.dateVerified ? 'OBSERVED' : 'INFERRED',
    freshness: mention.freshness,
    note: `External ${mention.publicationType} mentions ${mention.competitorIds.length} tracked competitors and omits Xroga.`,
  };
}

function uniqueEvidence(records: readonly Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return records.filter((item) => {
    const key = `${item.source}|${item.observedAt}|${item.note ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type GapInput = {
  id: string;
  type: Gap['gapType'];
  entity: Entity;
  demand: DemandItem;
  association?: Association;
  platform: string;
  competitors?: string[];
  evidence: Evidence[];
  sourceUrls?: string[];
  currentState: string;
  desiredState: string;
  format?: string | null;
  action: Gap['actionType'];
  searchDemand?: number | 'UNKNOWN';
  promptDemand?: number | 'UNKNOWN';
};

function makeGap(input: GapInput): Gap {
  const confidence = input.evidence.some((item) => item.confidence === 'VERIFIED') ? 'VERIFIED'
    : input.evidence.some((item) => item.confidence === 'OBSERVED') ? 'OBSERVED' : 'INFERRED';
  const recommended: Record<Gap['actionType'], string> = {
    FIX: 'Correct or strengthen the existing controlled asset using the attached evidence.',
    BUILD: 'Create the missing controlled asset only for this evidence-backed demand and format requirement.',
    INFLUENCE: 'Evaluate the independent source for accurate, legitimate editorial inclusion; do not automate spam outreach.',
    PRODUCT: 'Route the validated unmet capability to product strategy; do not publish claims that the product cannot support.',
    IGNORE: 'Do not allocate execution capacity without stronger relevance or evidence.',
  };
  return {
    id: input.id, entityId: input.entity.id, topicClusterId: input.demand.id,
    desiredAssociationId: input.association?.id ?? null,
    actualAssociation: input.association && typeof input.association.currentStrength === 'number' ? `Observed internal strength ${input.association.currentStrength}/5` : null,
    platform: input.platform, competitorIds: [...new Set(input.competitors ?? [])].sort(), gapType: input.type,
    currentState: input.currentState, desiredState: input.desiredState,
    evidence: uniqueEvidence(input.evidence), evidenceQuality: confidence,
    sourceUrls: [...new Set(input.sourceUrls ?? [])].sort(),
    searchDemand: input.searchDemand ?? 'UNKNOWN', promptDemand: input.promptDemand ?? 'UNKNOWN',
    businessValue: input.association?.businessValue ?? input.demand.businessPotential,
    productFit: input.association?.productTruthStrength ?? (input.entity.status === 'ACTIVE' ? 4 : input.entity.status === 'PARTIAL' ? 2 : 1),
    format: input.format ?? null,
    observedAt: input.evidence.map((item) => item.observedAt).sort().at(-1)!,
    lastVerifiedAt: input.evidence.map((item) => item.lastVerifiedAt).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null,
    recommendedAction: recommended[input.action], actionType: input.action, priority: 'P4', status: 'OPEN',
  };
}

function addGap(target: Map<string, Gap>, gap: Gap): void {
  const existing = target.get(gap.id);
  if (!existing) target.set(gap.id, gap);
  else target.set(gap.id, { ...existing, evidence: uniqueEvidence([...existing.evidence, ...gap.evidence]), sourceUrls: [...new Set([...existing.sourceUrls, ...gap.sourceUrls])].sort() });
}

function promptScore(observations: readonly PromptObservation[]): number | 'UNKNOWN' {
  const samples = observations.reduce((sum, item) => sum + item.sampleSize, 0);
  if (!samples) return 'UNKNOWN';
  if (samples >= 20) return 5;
  if (samples >= 10) return 4;
  if (samples >= 5) return 3;
  if (samples >= 2) return 2;
  return 1;
}

function productSupported(entity: Entity, association?: Association): boolean {
  return entity.status === 'ACTIVE' && (!association || (typeof association.productTruthStrength === 'number' && association.productTruthStrength >= 3));
}

function buildGaps(source: IntelligenceSource): Gap[] {
  const gaps = new Map<string, Gap>();
  const entityById = new Map(source.entities.map((item) => [item.id, item]));
  const demandById = new Map(source.demand.map((item) => [item.id, item]));

  for (const association of source.associations) {
    if (association.status !== 'ACTIVE' || typeof association.desiredStrength !== 'number' || typeof association.currentStrength !== 'number' || association.currentStrength >= association.desiredStrength) continue;
    const entity = entityById.get(association.entityId);
    const demand = relevantDemand(source, association.entityId, association.association);
    if (!entity || !demand) continue;
    const action = classifyAction({
      productTruthSupported: productSupported(entity, association), meaningfulDemand: typeof association.importance === 'number' && association.importance >= 3,
      controlledByXroga: true, adequateAssetExists: entity.publicUrls.length > 0, assetDeficient: true, externalSource: false,
    });
    addGap(gaps, makeGap({
      id: `gap.${association.id}.topic`, type: 'TOPIC', entity, demand, association, platform: 'COMMON_FOUNDATION',
      competitors: entity.competitorIds, evidence: [repositoryInference(association)], sourceUrls: entity.publicUrls,
      currentState: `Repository audit estimates the public association at ${association.currentStrength}/5; external visibility remains unmeasured.`,
      desiredState: `Reach a truthful ${association.desiredStrength}/5 association after evidence-backed execution and remeasurement.`, action,
    }));
  }

  const supportedTopicIds = new Set(source.demand.filter((item) => item.kind === 'TOPIC_CLUSTER').map((item) => item.id));
  for (const coverage of formatGaps(source.formatCoverage)) {
    const demand = demandById.get(coverage.topicClusterId);
    if (!demand) continue;
    const association = relevantAssociation(source, demand);
    const entity = entityById.get(association?.entityId ?? demand.relatedEntityIds[0]);
    if (!entity) continue;
    const action = classifyAction({ productTruthSupported: productSupported(entity, association), meaningfulDemand: true, controlledByXroga: true, adequateAssetExists: false, assetDeficient: true, externalSource: false });
    addGap(gaps, makeGap({
      id: `gap.${coverage.topicClusterId}.format.${coverage.format.toLowerCase()}`, type: 'FORMAT', entity, demand, association,
      platform: 'COMMON_FOUNDATION', evidence: coverage.evidence, sourceUrls: coverage.url ? [coverage.url] : [],
      currentState: `${coverage.format} is missing and a dated preference signal exists.`, desiredState: `${coverage.format} coverage satisfies the observed search, AI, or competitor format requirement.`,
      format: coverage.format, action,
    }));
  }

  for (const observation of source.promptObservations) {
    const demand = demandFromLabel(source, observation.promptFamily);
    if (!demand) continue;
    const association = relevantAssociation(source, demand, observation.promptText);
    const entity = entityById.get(association?.entityId ?? demand.relatedEntityIds[0]);
    if (!entity) continue;
    const observedEvidence = evidenceFromObservation(observation);
    if (observation.xrogaState === 'ABSENT' && observation.competitorsMentioned.length > 0) {
      const action = classifyAction({ productTruthSupported: productSupported(entity, association), meaningfulDemand: true, controlledByXroga: entity.publicUrls.length > 0, adequateAssetExists: entity.publicUrls.length > 0, assetDeficient: true, externalSource: false });
      addGap(gaps, makeGap({
        id: `gap.prompt.${observation.promptId}.visibility`, type: 'VISIBILITY', entity, demand, association,
        platform: observation.engine, competitors: observation.competitorsMentioned, evidence: [observedEvidence], sourceUrls: observation.sourcesCited,
        currentState: `Xroga was absent while competitors appeared in this dated ${observation.engine} sample.`, desiredState: 'Xroga is accurately considered when this prompt family is sampled again.',
        action, promptDemand: promptScore([observation]),
      }));
    }
    if (observation.xrogaState === 'INCORRECT_OR_MISLEADING') {
      addGap(gaps, makeGap({
        id: `gap.prompt.${observation.promptId}.narrative`, type: 'NARRATIVE', entity, demand, association,
        platform: observation.engine, competitors: observation.competitorsMentioned, evidence: [observedEvidence], sourceUrls: observation.sourcesCited,
        currentState: `A dated ${observation.engine} sample described Xroga inaccurately.`, desiredState: 'Future samples reflect canonical product facts without unsupported claims.',
        action: 'FIX', promptDemand: promptScore([observation]),
      }));
    }
  }

  for (const mention of mentionIntersect(source.mentions, 2, supportedTopicIds)) {
    const demand = demandById.get(mention.topicClusterId);
    if (!demand) continue;
    const association = relevantAssociation(source, demand);
    const entity = entityById.get(association?.entityId ?? demand.relatedEntityIds[0]);
    if (!entity) continue;
    addGap(gaps, makeGap({
      id: `gap.mention.${mention.id}.web-mention`, type: 'WEB_MENTION', entity, demand, association,
      platform: 'EXTERNAL_WEB', competitors: mention.competitorIds, evidence: [evidenceFromMention(mention)], sourceUrls: [mention.sourceUrl],
      currentState: 'A relevant independent source includes multiple tracked competitors and omits Xroga.',
      desiredState: 'The source independently evaluates Xroga accurately when editorially appropriate.', action: 'INFLUENCE',
    }));
  }

  for (const demand of source.demand.filter((item) => item.kind === 'TOPIC_CLUSTER')) {
    const rows = gscRowsForDemand(source.gscRows, demand);
    if (!rows.length || rows.reduce((sum, row) => sum + row.impressions, 0) === 0) continue;
    const classes = new Set(rows.flatMap(classifyGscRow));
    const weakVisibility = classes.has('POSITION_11_20') || classes.has('POSITION_21_50') || classes.has('HIGH_IMPRESSIONS_LOW_CTR');
    if (!weakVisibility) continue;
    const association = relevantAssociation(source, demand);
    const entity = entityById.get(association?.entityId ?? demand.relatedEntityIds[0]);
    if (!entity) continue;
    const evidence = rows.map(evidenceFromGsc);
    const action = classifyAction({ productTruthSupported: productSupported(entity, association), meaningfulDemand: true, controlledByXroga: true, adequateAssetExists: true, assetDeficient: true, externalSource: false });
    addGap(gaps, makeGap({
      id: `gap.gsc.${demand.id}.demand`, type: 'DEMAND', entity, demand, association, platform: 'GOOGLE_SEARCH',
      evidence, sourceUrls: rows.map((row) => row.page),
      currentState: `Observed GSC demand has insufficient position or CTR (${[...classes].join(', ')}).`,
      desiredState: 'The existing truthful asset earns stronger qualified discovery for the observed query family.', action,
      searchDemand: gscDemandScore(rows),
    }));
  }

  for (const metric of source.visibilityMetrics) {
    if (metric.availability !== 'AVAILABLE' || metric.value === 'UNKNOWN' || !metric.evidence.length || !metric.topicClusterId) continue;
    const demand = demandById.get(metric.topicClusterId);
    const metricEntity = entityById.get(metric.entityId);
    if (!demand || !metricEntity) continue;
    if (metric.metric === 'NARRATIVE_ACCURACY' && metricEntity.id === 'product.xroga' && metric.value < 3) {
      const association = relevantAssociation(source, demand);
      addGap(gaps, makeGap({
        id: `gap.metric.${metric.id}.narrative`, type: 'NARRATIVE', entity: metricEntity, demand, association,
        platform: metric.platform, evidence: metric.evidence, sourceUrls: metric.page ? [metric.page] : [],
        currentState: `Observed narrative accuracy is ${metric.value} ${metric.unit}.`, desiredState: 'Observed descriptions match canonical Xroga product facts.', action: 'FIX',
      }));
    }
    if (metricEntity.entityType === 'COMPETITOR' && metric.value > 0) {
      const explicitXrogaZero = source.visibilityMetrics.find((candidate) => candidate.topicClusterId === metric.topicClusterId && candidate.platform === metric.platform && candidate.metric === metric.metric && candidate.entityId === 'product.xroga' && candidate.availability === 'AVAILABLE' && candidate.value === 0);
      if (!explicitXrogaZero) continue;
      const association = relevantAssociation(source, demand);
      const entity = entityById.get(association?.entityId ?? demand.relatedEntityIds[0]);
      if (!entity) continue;
      addGap(gaps, makeGap({
        id: `gap.metric.${metric.topicClusterId}.${metric.platform.toLowerCase()}.visibility`, type: 'VISIBILITY', entity, demand, association,
        platform: metric.platform, competitors: [metricEntity.id], evidence: [...metric.evidence, ...explicitXrogaZero.evidence],
        sourceUrls: [metric.page, explicitXrogaZero.page].filter((item): item is string => Boolean(item)),
        currentState: 'A competitor has an observed metric while Xroga has an explicit observed zero for the same platform, topic, and metric.',
        desiredState: 'Xroga earns measurable, accurate visibility for the same evidence scope.', action: entity.publicUrls.length ? 'FIX' : 'BUILD',
      }));
    }
  }

  for (const demand of source.demand.filter((item) => item.dataStatus === 'AVAILABLE' && item.evidence.length > 0)) {
    const unsupportedEntity = demand.relatedEntityIds.map((id) => entityById.get(id)).find((entity) => entity && entity.status !== 'ACTIVE');
    const weakAssociation = source.associations.find((association) => demand.relatedEntityIds.includes(association.entityId) && typeof association.productTruthStrength === 'number' && association.productTruthStrength < 3);
    const entity = unsupportedEntity ?? (weakAssociation ? entityById.get(weakAssociation.entityId) : undefined);
    if (!entity) continue;
    addGap(gaps, makeGap({
      id: `gap.product.${demand.id}.demand`, type: 'DEMAND', entity, demand, association: weakAssociation,
      platform: 'COMMON_FOUNDATION', evidence: demand.evidence, currentState: 'Validated demand exists but current product truth does not support the requested capability strongly enough.',
      desiredState: 'Product strategy explicitly validates, builds, or rejects the capability before any public claim is made.', action: 'PRODUCT',
      searchDemand: demand.businessPotential, promptDemand: demand.promptRelevance,
    }));
  }

  return [...gaps.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function scoresFor(source: IntelligenceSource, gaps: readonly Gap[], association: Association | undefined, demand: DemandItem, evidence: readonly Evidence[]): OpportunityScores {
  const gsc = gscRowsForDemand(source.gscRows, demand);
  const observations = source.promptObservations.filter((item) => demandFromLabel(source, item.promptFamily)?.id === demand.id);
  const productFit = association?.productTruthStrength ?? gaps[0]?.productFit ?? 'UNKNOWN';
  const importance = association?.importance ?? demand.businessPotential;
  const external = gaps.some((gap) => gap.actionType === 'INFLUENCE');
  const format = gaps.some((gap) => gap.gapType === 'FORMAT');
  const evidenceConfidence = evidence.some((item) => item.confidence === 'VERIFIED') ? 5 : evidence.some((item) => item.confidence === 'OBSERVED') ? 3 : evidence.length ? 2 : 'UNKNOWN';
  return {
    businessPotential: association?.businessValue ?? demand.businessPotential,
    searchDemand: gscDemandScore(gsc), promptDemand: promptScore(observations),
    commercialProximity: demand.funnelStage === 'EVALUATION' || demand.funnelStage === 'ACTIVATION' ? 4 : 2,
    productFit, searchIntentFit: demand.intentFit,
    rankingAttainability: demand.difficulty === 'UNKNOWN' ? 'UNKNOWN' : 5 - demand.difficulty,
    aiVisibilityGap: gaps.some((gap) => gap.platform !== 'GOOGLE_SEARCH' && ['VISIBILITY', 'NARRATIVE'].includes(gap.gapType)) ? 4 : 'UNKNOWN',
    competitorGap: gaps.some((gap) => gap.competitorIds.length > 0) ? 4 : 'UNKNOWN',
    entityAssociationValue: importance, aiSatisfactionRisk: demand.aiSatisfactionRisk,
    clickDefensibility: demand.clickDefensibility, formatOpportunity: format ? 4 : 1,
    existingAuthority: association?.currentStrength ?? 'UNKNOWN', evidenceAvailability: evidenceConfidence,
    conversionPotential: demand.businessPotential, maintenanceBurden: format ? 3 : external ? 4 : 'UNKNOWN',
    strategicValue: importance,
  };
}

function buildOpportunities(source: IntelligenceSource, gaps: Gap[]): { opportunities: Opportunity[]; productOpportunities: ProductOpportunity[] } {
  const grouped = new Map<string, Gap[]>();
  for (const gap of gaps) {
    const key = `${gap.desiredAssociationId ?? gap.entityId}:${gap.topicClusterId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), gap]);
  }
  const opportunities: Opportunity[] = [];
  const productOpportunities: ProductOpportunity[] = [];
  for (const [key, related] of grouped) {
    const demand = source.demand.find((item) => item.id === related[0].topicClusterId);
    if (!demand) continue;
    const association = source.associations.find((item) => item.id === related[0].desiredAssociationId);
    const evidence = uniqueEvidence(related.flatMap((item) => item.evidence));
    const componentScores = scoresFor(source, related, association, demand, evidence);
    const prioritized = prioritizeOpportunity(componentScores);
    for (const gap of related) gap.priority = prioritized.priority;
    const actionTypes = [...new Set(related.map((item) => item.actionType))];
    const title = association?.association ?? demand.value;
    opportunities.push({
      id: `opportunity.${key.replace(/[^a-z0-9._-]+/gi, '-')}`, entityId: related[0].entityId, topicClusterId: demand.id,
      gapIds: related.map((item) => item.id).sort(), title, strategy: demand.strategy, actionTypes,
      priority: prioritized.priority, scores: componentScores,
      rationale: [
        association ? `Internal association baseline: desired ${association.desiredStrength}/5, observed ${association.currentStrength}/5.` : `Opportunity is grounded in ${related.length} imported evidence record${related.length === 1 ? '' : 's'}.`,
        `Gap types: ${[...new Set(related.map((item) => item.gapType))].sort().join(', ')}.`,
        ...prioritized.rationale,
      ],
      evidence, recommendedWork: [...new Set(related.map((item) => item.recommendedAction))],
      remeasurementPlan: 'Re-import the same scoped provider dimensions after the intervention and compare query/page visibility, platform-specific citation state, narrative accuracy, format coverage, and external mentions against this dated baseline.',
    });
    if (actionTypes.includes('PRODUCT')) {
      productOpportunities.push({
        id: `product-opportunity.${demand.id}`, requestedCapability: demand.value, evidence,
        searchDemand: componentScores.searchDemand, promptDemand: componentScores.promptDemand,
        competitorSupport: componentScores.competitorGap, businessPotential: componentScores.businessPotential,
        strategicValue: componentScores.strategicValue, relatedUserProblems: [demand.userJob], status: 'OPEN',
      });
    }
  }
  opportunities.sort((left, right) => left.priority.localeCompare(right.priority) || left.id.localeCompare(right.id));
  productOpportunities.sort((left, right) => left.id.localeCompare(right.id));
  return { opportunities, productOpportunities };
}

export async function buildIntelligence(source: IntelligenceSource, options: IntelligenceOptions = {}): Promise<IntelligenceSnapshot> {
  const now = options.now ?? new Date();
  const ahrefsProvider = options.ahrefsProvider ?? new AhrefsProvider(process.env.AHREFS_API_TOKEN);
  let ahrefs: ProviderResult<Record<string, unknown>>;
  try { ahrefs = await ahrefsProvider.load(); }
  catch {
    ahrefs = { provider: ahrefsProvider.id, status: 'UNAVAILABLE', records: [], reason: 'Provider failed safely without affecting local intelligence.', observedAt: now.toISOString() };
  }
  const validationIssues = [
    ...validateEntityGraph(source.entities), ...validateAssociations(source.associations, source.entities),
    ...validateDemand(source.demand, source.entities), ...detectFactProblems(source.facts, now),
    ...validateEvidenceCollections({ observations: source.promptObservations, mentions: source.mentions, formats: source.formatCoverage, metrics: source.visibilityMetrics, demand: source.demand, entities: source.entities }),
    ...await validateCanonicalFactSources(source.facts),
  ];
  const gaps = buildGaps(source);
  const { opportunities, productOpportunities } = buildOpportunities(source, gaps);
  const aiVisibility = aiVisibilitySummary(source.promptObservations);
  const relevantTopics = new Set(source.demand.filter((item) => item.kind === 'TOPIC_CLUSTER').map((item) => item.id));
  const intersect = mentionIntersect(source.mentions, 2, relevantTopics);
  const unknowns = [
    ...(ahrefs.status !== 'AVAILABLE' ? [`Ahrefs metrics: ${ahrefs.status} (${ahrefs.reason ?? 'No reason supplied.'})`] : []),
    ...(source.gscRows.length === 0 ? ['Google Search Console: NO_DATA; no query/page import was supplied.'] : []),
    ...(source.promptObservations.length === 0 ? ['AI mention/citation rates: NO_DATA; no samples were imported.'] : []),
    ...(source.mentions.length === 0 ? ['Third-party mention intersect: NO_DATA; no verified mention records were imported.'] : []),
    ...(source.visibilityMetrics.length === 0 ? ['Platform visibility metrics: NO_DATA; absence of records is not a zero metric.'] : []),
    ...(source.demand.some((item) => item.difficulty === 'UNKNOWN') ? ['Ranking difficulty: UNKNOWN where no provider evidence exists.'] : []),
    ...(source.demand.every((item) => item.dataStatus !== 'AVAILABLE') && source.gscRows.length === 0 ? ['Search demand: NO_DATA; source taxonomy is not a volume estimate.'] : []),
  ];
  return {
    generatedAt: now.toISOString(), source, gaps, opportunities, productOpportunities, validationIssues,
    providerStates: [
      { provider: 'repository-product-truth', status: 'AVAILABLE' },
      { provider: 'ahrefs', status: ahrefs.status, reason: ahrefs.reason },
      { provider: 'google-search-console-import', status: source.gscRows.length ? 'AVAILABLE' : 'NO_DATA', reason: source.gscRows.length ? undefined : 'No import supplied for this run.' },
      { provider: 'ai-prompt-observatory', status: source.promptObservations.length ? 'AVAILABLE' : 'NO_DATA' },
      { provider: 'web-mentions', status: source.mentions.length ? 'AVAILABLE' : 'NO_DATA' },
      { provider: 'visibility-metrics-import', status: source.visibilityMetrics.length ? 'AVAILABLE' : 'NO_DATA' },
    ],
    aiVisibility, aiVisibilityByPlatform: aiVisibilityByPlatform(source.promptObservations),
    mentionIntersect: intersect, formatGaps: formatGaps(source.formatCoverage), unknowns,
  };
}
