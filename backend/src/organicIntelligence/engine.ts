import type {
  Association, CanonicalFact, DemandItem, Entity, Evidence, FormatCoverage, Gap, GscRow,
  Mention, Opportunity, OpportunityScores, PromptObservation, VisibilityMetric,
} from './model.js';

export type ValidationIssue = { code: string; path: string; message: string };

const NORMALIZED_TERM = new Map([
  ['repos', 'repository'], ['repo', 'repository'], ['repositories', 'repository'], ['codebase', 'repository'],
  ['github', 'repository'], ['project', 'repository'], ['projects', 'repository'], ['modify', 'develop'],
  ['coding', 'develop'], ['development', 'develop'], ['build', 'develop'], ['extend', 'develop'],
  ['apps', 'application'], ['app', 'application'], ['software', 'application'],
]);
const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'from', 'in', 'of', 'or', 'the', 'to', 'with']);

export function normalizedTokens(value: string): string[] {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .map((token) => NORMALIZED_TERM.get(token) ?? token))].sort();
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

export function validateEntityGraph(entities: readonly Entity[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) issues.push({ code: 'DUPLICATE_ENTITY', path: entity.id, message: 'Entity id is duplicated.' });
    if (slugs.has(entity.slug)) issues.push({ code: 'DUPLICATE_ENTITY_SLUG', path: entity.slug, message: 'Entity slug is duplicated.' });
    ids.add(entity.id);
    slugs.add(entity.slug);
  }
  for (const entity of entities) {
    for (const related of [...entity.parentIds, ...entity.childIds, ...entity.relatedIds, ...entity.competitorIds]) {
      if (!ids.has(related)) issues.push({ code: 'INVALID_ENTITY_RELATION', path: `${entity.id}.${related}`, message: `Related entity ${related} does not exist.` });
      if (related === entity.id) issues.push({ code: 'SELF_RELATION', path: entity.id, message: 'Entity cannot relate to itself.' });
    }
  }
  return issues;
}

export function validateAssociations(associations: readonly Association[], entities: readonly Entity[]): ValidationIssue[] {
  const entityIds = new Set(entities.map((item) => item.id));
  const seenIds = new Set<string>();
  const seenIdentity = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const association of associations) {
    const key = `${association.entityId}:${normalizedTokens(association.association).join(' ')}`;
    if (seenIds.has(association.id)) issues.push({ code: 'DUPLICATE_ASSOCIATION_ID', path: association.id, message: 'Association id is duplicated.' });
    if (!entityIds.has(association.entityId)) issues.push({ code: 'UNKNOWN_ASSOCIATION_ENTITY', path: association.id, message: association.entityId });
    if (seenIdentity.has(key)) issues.push({ code: 'DUPLICATE_ASSOCIATION', path: association.id, message: association.association });
    seenIds.add(association.id);
    seenIdentity.add(key);
    if (typeof association.productTruthStrength === 'number' && association.productTruthStrength < 3 && association.status === 'ACTIVE') {
      issues.push({ code: 'WEAK_PRODUCT_TRUTH', path: association.id, message: 'Active association lacks product-truth support.' });
    }
  }
  return issues;
}

export function detectFactProblems(facts: readonly CanonicalFact[], now = new Date()): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byKey = new Map<string, CanonicalFact>();
  for (const fact of facts) {
    const existing = byKey.get(fact.factKey);
    if (existing) {
      issues.push({ code: 'DUPLICATE_FACT', path: fact.factKey, message: 'Canonical fact key is duplicated.' });
      if (JSON.stringify(existing.value) !== JSON.stringify(fact.value)) {
        issues.push({ code: 'CONFLICTING_FACT', path: fact.factKey, message: 'Canonical values disagree.' });
      }
    }
    byKey.set(fact.factKey, fact);
    const ageDays = (now.getTime() - new Date(fact.lastVerifiedAt).getTime()) / 86_400_000;
    if (ageDays > fact.verificationIntervalDays) issues.push({ code: 'STALE_FACT', path: fact.factKey, message: `Verification overdue by ${Math.floor(ageDays - fact.verificationIntervalDays)} days.` });
    if (!fact.source.trim()) issues.push({ code: 'UNVERIFIED_FACT', path: fact.factKey, message: 'Source is missing.' });
  }
  return issues;
}

export function freshnessForEvidence(input: Pick<Evidence, 'lastVerifiedAt' | 'verificationDue'>, now = new Date()): Evidence['freshness'] {
  if (!input.lastVerifiedAt || !input.verificationDue) return 'UNKNOWN';
  const due = new Date(input.verificationDue).getTime();
  const remaining = due - now.getTime();
  if (remaining < 0) return 'STALE';
  if (remaining <= 7 * 86_400_000) return 'VERIFY_SOON';
  return 'CURRENT';
}

export function detectOutdatedFactUsage(facts: readonly CanonicalFact[], pageValues: Readonly<Record<string, unknown>>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const fact of facts) {
    for (const page of fact.affectedPublicPages) {
      const key = `${page}:${fact.factKey}`;
      if (!(key in pageValues)) continue;
      if (JSON.stringify(pageValues[key]) !== JSON.stringify(fact.value)) issues.push({ code: 'OUTDATED_PAGE_USING_FACT', path: key, message: `Public usage differs from ${fact.source}.` });
    }
  }
  return issues;
}

export function deduplicatePromptFamilies(items: readonly DemandItem[]): { unique: DemandItem[]; duplicates: string[] } {
  const unique: DemandItem[] = [];
  const duplicates: string[] = [];
  for (const item of items.filter((candidate) => candidate.kind === 'PROMPT_FAMILY')) {
    const duplicate = unique.some((existing) => {
      const sameParent = Boolean(item.parentId && existing.parentId && item.parentId === existing.parentId);
      return similarity(existing.value, item.value) >= (sameParent ? 0.55 : 0.72);
    });
    if (duplicate) duplicates.push(item.id); else unique.push(item);
  }
  return { unique, duplicates };
}

export function validateDemand(items: readonly DemandItem[], entities: readonly Entity[]): ValidationIssue[] {
  const ids = new Set<string>();
  const entityIds = new Set(entities.map((entity) => entity.id));
  const issues: ValidationIssue[] = [];
  for (const item of items) {
    if (ids.has(item.id)) issues.push({ code: 'DUPLICATE_DEMAND', path: item.id, message: 'Demand id is duplicated.' });
    ids.add(item.id);
  }
  for (const item of items) {
    if (item.parentId && !ids.has(item.parentId)) issues.push({ code: 'UNKNOWN_DEMAND_PARENT', path: item.id, message: item.parentId });
    for (const entityId of item.relatedEntityIds) if (!entityIds.has(entityId)) issues.push({ code: 'UNKNOWN_DEMAND_ENTITY', path: item.id, message: entityId });
    if (item.dataStatus === 'AVAILABLE' && item.evidence.length === 0) issues.push({ code: 'AVAILABLE_DEMAND_WITHOUT_EVIDENCE', path: item.id, message: 'Available demand requires dated evidence.' });
  }
  for (const duplicate of deduplicatePromptFamilies(items).duplicates) issues.push({ code: 'DUPLICATE_PROMPT_FAMILY', path: duplicate, message: 'Prompt family duplicates a semantic family.' });
  return issues;
}

export function validateEvidenceCollections(input: {
  observations: readonly PromptObservation[];
  mentions: readonly Mention[];
  formats: readonly FormatCoverage[];
  metrics: readonly VisibilityMetric[];
  demand: readonly DemandItem[];
  entities: readonly Entity[];
}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const demandIds = new Set(input.demand.map((item) => item.id));
  const entityIds = new Set(input.entities.map((item) => item.id));
  const duplicateIds = <T>(records: readonly T[], code: string, idFor: (record: T) => string) => {
    const seen = new Set<string>();
    for (const record of records) {
      const id = idFor(record);
      if (seen.has(id)) issues.push({ code, path: id, message: 'Identifier is duplicated.' });
      seen.add(id);
    }
  };
  duplicateIds(input.observations, 'DUPLICATE_PROMPT_OBSERVATION', (item) => item.promptId);
  duplicateIds(input.mentions, 'DUPLICATE_MENTION', (item) => item.id);
  duplicateIds(input.metrics, 'DUPLICATE_VISIBILITY_METRIC', (item) => item.id);
  duplicateIds(input.formats, 'DUPLICATE_FORMAT_COVERAGE', (item) => `${item.topicClusterId}:${item.format}`);
  for (const item of input.mentions) if (!demandIds.has(item.topicClusterId)) issues.push({ code: 'UNKNOWN_MENTION_TOPIC', path: item.id, message: item.topicClusterId });
  for (const item of input.formats) if (!demandIds.has(item.topicClusterId)) issues.push({ code: 'UNKNOWN_FORMAT_TOPIC', path: `${item.topicClusterId}:${item.format}`, message: item.topicClusterId });
  for (const item of input.metrics) {
    if (!entityIds.has(item.entityId)) issues.push({ code: 'UNKNOWN_METRIC_ENTITY', path: item.id, message: item.entityId });
    if (item.topicClusterId && !demandIds.has(item.topicClusterId)) issues.push({ code: 'UNKNOWN_METRIC_TOPIC', path: item.id, message: item.topicClusterId });
  }
  return issues;
}

export type GapSignals = {
  competitorVisibility?: boolean;
  xrogaVisibility?: boolean;
  narrativeAccurate?: boolean;
  desiredAssociationMissing?: boolean;
  requiredFormatMissing?: boolean;
  externalSourceOmitsXroga?: boolean;
  demandExists?: boolean;
};

export function classifyGapTypes(signals: GapSignals): Gap['gapType'][] {
  const result: Gap['gapType'][] = [];
  if (signals.competitorVisibility && !signals.xrogaVisibility) result.push('VISIBILITY');
  if (signals.xrogaVisibility && signals.narrativeAccurate === false) result.push('NARRATIVE');
  if (signals.desiredAssociationMissing) result.push('TOPIC');
  if (signals.requiredFormatMissing) result.push('FORMAT');
  if (signals.externalSourceOmitsXroga) result.push('WEB_MENTION');
  if (signals.demandExists && !signals.xrogaVisibility) result.push('DEMAND');
  return result;
}

export type ActionSignals = {
  productTruthSupported: boolean;
  meaningfulDemand: boolean;
  controlledByXroga: boolean;
  adequateAssetExists: boolean;
  assetDeficient: boolean;
  externalSource: boolean;
  duplicateOrLowValue?: boolean;
};

export function classifyAction(input: ActionSignals): Gap['actionType'] {
  if (input.duplicateOrLowValue || !input.meaningfulDemand) return 'IGNORE';
  if (!input.productTruthSupported) return 'PRODUCT';
  if (input.externalSource || !input.controlledByXroga) return 'INFLUENCE';
  if (input.adequateAssetExists && input.assetDeficient) return 'FIX';
  if (!input.adequateAssetExists) return 'BUILD';
  return 'IGNORE';
}

function known(scores: OpportunityScores, keys: readonly (keyof OpportunityScores)[]): number[] {
  return keys.map((key) => scores[key]).filter((score): score is number => typeof score === 'number');
}

export function prioritizeOpportunity(scores: OpportunityScores): { priority: Opportunity['priority']; rationale: string[] } {
  const positiveKeys: (keyof OpportunityScores)[] = [
    'businessPotential', 'searchDemand', 'promptDemand', 'commercialProximity', 'productFit',
    'searchIntentFit', 'rankingAttainability', 'aiVisibilityGap', 'competitorGap',
    'entityAssociationValue', 'clickDefensibility', 'formatOpportunity', 'existingAuthority',
    'evidenceAvailability', 'conversionPotential', 'strategicValue',
  ];
  const positives = known(scores, positiveKeys);
  const critical = known(scores, ['businessPotential', 'productFit', 'strategicValue']);
  const demand = known(scores, ['searchDemand', 'promptDemand']);
  const rationale: string[] = [];
  for (const key of positiveKeys) {
    const value = scores[key];
    if (typeof value === 'number' && value >= 4) rationale.push(`${key} is strongly supported (${value}/5).`);
  }
  const unknownKeys = Object.entries(scores).filter(([, value]) => value === 'UNKNOWN').map(([key]) => key);
  if (unknownKeys.length) rationale.push(`UNKNOWN components excluded from priority: ${unknownKeys.join(', ')}.`);
  if (!positives.length || critical.length < 2) return { priority: 'P4', rationale: [...rationale, 'Insufficient verified strategic evidence.'] };
  const average = positives.reduce((sum, value) => sum + value, 0) / positives.length;
  const criticalMin = Math.min(...critical);
  const demandMax = demand.length ? Math.max(...demand) : null;
  const maintenance = typeof scores.maintenanceBurden === 'number' ? scores.maintenanceBurden : null;
  let priority: Opportunity['priority'];
  if (criticalMin >= 4 && demandMax !== null && demandMax >= 4 && scores.evidenceAvailability !== 'UNKNOWN' && maintenance !== null && maintenance <= 3) priority = 'P0';
  else if (criticalMin >= 3 && demandMax !== null && typeof scores.evidenceAvailability === 'number' && scores.evidenceAvailability >= 3 && average >= 3.5) priority = 'P1';
  else if (average >= 3) priority = 'P2';
  else if (average >= 2) priority = 'P3';
  else priority = 'P4';
  rationale.push(`Priority ${priority} follows from ${positives.length} known positive components; missing values were not assigned numeric defaults.`);
  if (maintenance === null) rationale.push('maintenanceBurden is UNKNOWN and cannot qualify the opportunity for P0.');
  return { priority, rationale };
}

export function classifyGscRow(row: GscRow): string[] {
  const result: string[] = [];
  if (row.position <= 3) result.push('POSITION_1_3');
  else if (row.position <= 10) result.push('POSITION_4_10');
  else if (row.position <= 20) result.push('POSITION_11_20');
  else if (row.position <= 50) result.push('POSITION_21_50');
  if (row.impressions >= 100 && row.ctr < 0.02) result.push('HIGH_IMPRESSIONS_LOW_CTR');
  return result;
}

export function demandMatchesText(item: DemandItem, value: string): boolean {
  const target = `${item.value} ${item.userJob}`;
  const valueTokens = normalizedTokens(value);
  return similarity(target, value) >= 0.28 || normalizedTokens(item.value).every((token) => valueTokens.includes(token));
}

export function gscRowsForDemand(rows: readonly GscRow[], item: DemandItem): GscRow[] {
  return rows.filter((row) => demandMatchesText(item, row.query));
}

export function gscDemandScore(rows: readonly GscRow[]): number | 'UNKNOWN' {
  if (!rows.length) return 'UNKNOWN';
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  if (impressions === 0) return 0;
  if (impressions >= 10_000) return 5;
  if (impressions >= 1_000) return 4;
  if (impressions >= 100) return 3;
  if (impressions >= 10) return 2;
  return 1;
}

export function aiVisibilitySummary(observations: readonly PromptObservation[]) {
  const samples = observations.reduce((sum, item) => sum + item.sampleSize, 0);
  if (!samples) return { status: 'NO_DATA' as const, sampleSize: 0 };
  const weighted = (state: PromptObservation['xrogaState']) => observations.filter((item) => item.xrogaState === state).reduce((sum, item) => sum + item.sampleSize, 0);
  return {
    status: 'AVAILABLE' as const,
    sampleSize: samples,
    mentionRate: (weighted('CITED_LINKED') + weighted('MENTIONED_UNLINKED')) / samples,
    citationRate: weighted('CITED_LINKED') / samples,
    absenceRate: weighted('ABSENT') / samples,
    inaccurateRate: weighted('INCORRECT_OR_MISLEADING') / samples,
  };
}

export function aiVisibilityByPlatform(observations: readonly PromptObservation[]) {
  const grouped = new Map<PromptObservation['engine'], PromptObservation[]>();
  for (const observation of observations) grouped.set(observation.engine, [...(grouped.get(observation.engine) ?? []), observation]);
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([platform, records]) => ({ platform, ...aiVisibilitySummary(records) }));
}

export function mentionIntersect(records: readonly Mention[], minimumCompetitors = 2, relevantTopicIds?: ReadonlySet<string>): Mention[] {
  return records.filter((item) => {
    if (item.xrogaPresent || new Set(item.competitorIds).size < minimumCompetitors) return false;
    if (relevantTopicIds && !relevantTopicIds.has(item.topicClusterId)) return false;
    return typeof item.topicRelevance === 'number' && item.topicRelevance >= 3;
  }).sort((left, right) => {
    const total = (item: Mention) => [item.topicRelevance, item.pageReferringDomains, item.pageOrganicTraffic, item.aiCitationFrequency, item.commercialIntent, item.editorialIndependence, item.outreachFeasibility]
      .reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
    return total(right) - total(left) || left.id.localeCompare(right.id);
  });
}

export function formatGaps(coverage: readonly FormatCoverage[]): FormatCoverage[] {
  return coverage.filter((item) => !item.exists
    && item.evidence.length > 0
    && (item.competitorsHaveFormat === true || item.googleRewardsFormat === true || item.aiEnginesCiteFormat === true));
}

export function evidence(source: string, confidence: Evidence['confidence'] = 'VERIFIED', observedAt = '2026-09-21T00:00:00.000Z'): Evidence {
  return { source, sourceType: 'REPOSITORY_AUDIT', observedAt, lastVerifiedAt: observedAt, verificationDue: null, confidence, freshness: 'CURRENT' };
}
