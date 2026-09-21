import type {
  Association, CanonicalFact, DemandItem, Entity, Evidence, FormatCoverage, Gap, GscRow,
  Mention, Opportunity, OpportunityScores, PromptObservation,
} from './model.js';

export type ValidationIssue = { code: string; path: string; message: string };

export function validateEntityGraph(entities: readonly Entity[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) issues.push({ code: 'DUPLICATE_ENTITY', path: entity.id, message: 'Entity id is duplicated.' });
    ids.add(entity.id);
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
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  for (const association of associations) {
    const key = `${association.entityId}:${association.association.toLowerCase().replace(/\s+/g, ' ').trim()}`;
    if (!entityIds.has(association.entityId)) issues.push({ code: 'UNKNOWN_ASSOCIATION_ENTITY', path: association.id, message: association.entityId });
    if (seen.has(key)) issues.push({ code: 'DUPLICATE_ASSOCIATION', path: association.id, message: association.association });
    seen.add(key);
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
    if (existing && JSON.stringify(existing.value) !== JSON.stringify(fact.value)) {
      issues.push({ code: 'CONFLICTING_FACT', path: fact.factKey, message: 'Canonical values disagree.' });
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

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function deduplicatePromptFamilies(items: readonly DemandItem[]): { unique: DemandItem[]; duplicates: string[] } {
  const seen = new Map<string, DemandItem>();
  const duplicates: string[] = [];
  for (const item of items) {
    if (item.kind !== 'PROMPT_FAMILY') continue;
    const key = normalizedText(item.value);
    if (seen.has(key)) duplicates.push(item.id); else seen.set(key, item);
  }
  return { unique: [...seen.values()], duplicates };
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
  const unknownCount = Object.values(scores).filter((value) => value === 'UNKNOWN').length;
  if (unknownCount) rationale.push(`${unknownCount} component${unknownCount === 1 ? ' is' : 's are'} UNKNOWN and not treated as zero.`);
  if (!positives.length || critical.length < 2) return { priority: 'P4', rationale: [...rationale, 'Insufficient verified strategic evidence.'] };
  const average = positives.reduce((sum, value) => sum + value, 0) / positives.length;
  const criticalMin = Math.min(...critical);
  const demandMax = demand.length ? Math.max(...demand) : 0;
  const maintenance = typeof scores.maintenanceBurden === 'number' ? scores.maintenanceBurden : 3;
  let priority: Opportunity['priority'];
  if (criticalMin >= 4 && demandMax >= 4 && scores.evidenceAvailability !== 'UNKNOWN' && maintenance <= 3) priority = 'P0';
  else if (criticalMin >= 3 && average >= 3.5) priority = 'P1';
  else if (average >= 3) priority = 'P2';
  else if (average >= 2) priority = 'P3';
  else priority = 'P4';
  rationale.push(`Priority ${priority} follows from ${positives.length} known components; unknown values were excluded, not fabricated.`);
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

export function mentionIntersect(records: readonly Mention[], minimumCompetitors = 2): Mention[] {
  return records.filter((item) => !item.xrogaPresent && new Set(item.competitorIds).size >= minimumCompetitors)
    .sort((left, right) => {
      const total = (item: Mention) => [item.pageReferringDomains, item.pageOrganicTraffic, item.aiCitationFrequency, item.commercialIntent, item.editorialIndependence, item.outreachFeasibility]
        .reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
      return total(right) - total(left);
    });
}

export function formatGaps(coverage: readonly FormatCoverage[]): FormatCoverage[] {
  return coverage.filter((item) => !item.exists && (item.competitorsHaveFormat === true || item.googleRewardsFormat === true || item.aiEnginesCiteFormat === true));
}

export function evidence(source: string, confidence: Evidence['confidence'] = 'VERIFIED'): Evidence {
  const observedAt = '2026-09-21T00:00:00.000Z';
  return { source, sourceType: 'REPOSITORY_AUDIT', observedAt, lastVerifiedAt: observedAt, verificationDue: '2026-10-21T00:00:00.000Z', confidence, freshness: 'CURRENT' };
}
