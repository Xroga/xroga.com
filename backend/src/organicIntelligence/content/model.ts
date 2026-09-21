import { z } from 'zod';
import {
  assetTypeSchema,
  confidenceStateSchema,
  dataAvailabilitySchema,
  freshnessStateSchema,
  scoreSchema,
} from '../model.js';

export const researchOriginSchema = z.enum(['GENERATED_IDEA', 'VALIDATED_DEMAND']);
export const researchProviderSchema = z.enum([
  'AHREFS', 'GSC', 'BING', 'MANUAL_IMPORT', 'SERP_OBSERVATION',
  'PROMPT_OBSERVATION', 'CUSTOMER_LANGUAGE', 'ANALYTICS', 'COMMUNITY',
]);
export const assetDecisionSchema = z.enum([
  'UPDATE_EXISTING', 'EXPAND_EXISTING', 'MERGE', 'REPOSITION', 'BUILD_NEW', 'IGNORE',
]);
export const intentTypeSchema = z.enum([
  'PRODUCT', 'CATEGORY', 'GUIDE', 'COMPARISON', 'ALTERNATIVE', 'MIGRATION',
  'TOOL', 'VIDEO', 'TEMPLATE', 'DOCUMENTATION', 'RESEARCH', 'COMMUNITY', 'OTHER',
]);

const nullableMetric = z.number().nonnegative().nullable();
export const keywordMetricSchema = z.object({
  id: z.string().min(1),
  keyword: z.string().min(1),
  country: z.string().min(1),
  provider: researchProviderSchema,
  status: dataAvailabilitySchema,
  source: z.string().min(1),
  observedAt: z.string().datetime(),
  volume: nullableMetric,
  globalVolume: nullableMetric,
  keywordDifficulty: nullableMetric,
  trafficPotential: nullableMetric,
  cpc: nullableMetric,
  parentTopic: z.string().nullable(),
  serpIntent: intentTypeSchema.nullable(),
  serpFeatures: z.array(z.string()),
  topRankingPages: z.array(z.string().url()),
});

export const serpObservationSchema = z.object({
  id: z.string().min(1), query: z.string().min(1), country: z.string().min(1),
  device: z.string().min(1), date: z.string().date(), position: z.number().int().positive(),
  url: z.string().url(), domain: z.string().min(1), title: z.string().min(1),
  resultType: z.string().min(1), contentType: intentTypeSchema,
  videoPresent: z.boolean(), forumPresent: z.boolean(), toolPresent: z.boolean(),
  comparisonPresent: z.boolean(), commercialPagesPresent: z.boolean(),
  informationalPagesPresent: z.boolean(), weakDomainPresent: z.boolean(),
  serpFeatures: z.array(z.string()), observedIntent: intentTypeSchema,
  notes: z.string().nullable(), source: z.string().min(1),
});

export const researchCandidateSchema = z.object({
  id: z.string().min(1), query: z.string().min(1), origin: researchOriginSchema,
  status: dataAvailabilitySchema, seedDemandId: z.string().min(1), modifier: z.string().nullable(),
  relatedEntityIds: z.array(z.string()), evidenceIds: z.array(z.string()),
  businessPotential: scoreSchema, intentFit: scoreSchema, difficulty: scoreSchema,
  aiSatisfactionRisk: scoreSchema, clickDefensibility: scoreSchema,
  strategy: z.enum(['SEO_FIRST', 'AEO_FIRST', 'HYBRID', 'LOW_PRIORITY']),
});

export const fanOutQuestionSchema = z.object({
  promptFamilyId: z.string().min(1), coreJob: z.string().min(1),
  fanOutQuestion: z.string().min(1), topicClusterId: z.string().min(1),
  entityId: z.string().min(1), evidenceSource: z.string().min(1),
  importance: scoreSchema, coveredByUrl: z.string().nullable(),
  coverageStrength: scoreSchema, missing: z.boolean(),
  recommendedAction: z.enum(['COVER_IN_EXISTING', 'EXPAND_EXISTING', 'RESEARCH_REQUIRED', 'IGNORE']),
});

export const assetInventorySchema = z.object({
  id: z.string().min(1), url: z.string().startsWith('/'), title: z.string().min(1),
  intent: intentTypeSchema, topicClusterIds: z.array(z.string()).min(1),
  entityIds: z.array(z.string()).min(1), promptFamilyIds: z.array(z.string()),
  contentFamily: z.string().min(1), indexable: z.boolean(),
  evidenceClasses: z.array(z.string()), visualClasses: z.array(z.string()),
  sourcePath: z.string().min(1), lastVerifiedAt: z.string().datetime(),
  updatedAt: z.string().date(), qualityScore: z.number().int().min(0).max(100).nullable(),
});

export const assetResolutionSchema = z.object({
  candidateId: z.string().min(1), decision: assetDecisionSchema,
  targetUrl: z.string().nullable(), overlap: z.number().min(0).max(1),
  reason: z.string().min(1), cannibalizationWarning: z.string().nullable(),
});

export const sourceRecordSchema = z.object({
  sourceId: z.string().min(1), url: z.string().min(1), publisher: z.string().min(1),
  sourceType: z.enum(['XROGA_PRODUCT_CODE', 'XROGA_PUBLIC_ASSET', 'OFFICIAL_PRIMARY', 'ORIGINAL_DATA', 'MANUAL_IMPORT']),
  claimTopics: z.array(z.string()).min(1), publishedAt: z.string().date().nullable(),
  verifiedAt: z.string().datetime(), authorityNotes: z.string().min(1),
  volatility: z.enum(['LOW', 'MEDIUM', 'HIGH']), pagesUsingSource: z.array(z.string()),
});

export const claimRecordSchema = z.object({
  claimId: z.string().min(1), text: z.string().min(1), entityId: z.string().min(1),
  sourceIds: z.array(z.string()).min(1), verifiedAt: z.string().datetime(),
  pagesUsingClaim: z.array(z.string()).min(1), volatility: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  nextVerificationDue: z.string().datetime(),
});

export const evidenceManifestItemSchema = z.object({
  type: z.enum(['PRODUCT_CODE', 'PRODUCT_SCREENSHOT', 'PUBLIC_TOOL', 'TEST_RESULT', 'BUILD_RESULT', 'WORKFLOW_DIAGRAM', 'ORIGINAL_DATA', 'OFFICIAL_SOURCE']),
  source: z.string().min(1), verifiedAt: z.string().datetime(), location: z.string().min(1),
  claimSupported: z.string().min(1), publicSafe: z.boolean(), freshnessDue: z.string().datetime(),
});

export const visualManifestItemSchema = z.object({
  type: z.enum(['PRODUCT_SCREENSHOT', 'WORKFLOW_DIAGRAM', 'COMPARISON_MATRIX', 'BENCHMARK_CHART', 'BEFORE_AFTER', 'CODE_DIFF', 'BUILD_RECEIPT', 'TEST_RECEIPT', 'DEPLOYMENT_RECEIPT', 'REPOSITORY_GRAPH', 'DATA_TABLE', 'VIDEO', 'OG_IMAGE', 'ILLUSTRATION']),
  source: z.string().min(1), alt: z.string().min(1), caption: z.string().min(1),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  verifiedAt: z.string().datetime(), publicSafe: z.boolean(),
});

export const contentBriefSchema = z.object({
  briefId: z.string().min(1), opportunityId: z.string().min(1), gapIds: z.array(z.string()),
  targetUrl: z.string().startsWith('/'), mode: z.enum(['NEW', 'EXISTING']), action: z.enum(['FIX', 'BUILD']),
  primaryEntityId: z.string().min(1), primaryTopicId: z.string().min(1),
  primaryUserJob: z.string().min(1), audience: z.array(z.string()).min(1),
  funnelStage: z.string().min(1), businessPotential: scoreSchema,
  searchIntent: intentTypeSchema, promptFamilyIds: z.array(z.string()),
  validatedKeywordIds: z.array(z.string()), fanOutQuestions: z.array(fanOutQuestionSchema),
  competitorIds: z.array(z.string()), serpEvidenceIds: z.array(z.string()), format: assetTypeSchema,
  requiredSections: z.array(z.string()).min(1), requiredQuestions: z.array(z.string()).min(1),
  requiredEvidence: z.array(z.string()).min(1), requiredVisuals: z.array(z.string()).min(1),
  sourceIds: z.array(z.string()).min(1), productFactKeys: z.array(z.string()).min(1),
  internalLinks: z.array(z.string()).min(1), conversionPath: z.object({
    entryIntent: z.string().min(1), valueDelivered: z.string().min(1),
    nextAction: z.string().min(1), activationEvent: z.string().min(1),
  }),
  cta: z.object({ label: z.string().min(1), href: z.string().startsWith('/') }),
  freshnessRequirements: z.string().min(1), lastVerifiedRequirements: z.string().min(1),
  schemaRequirements: z.array(z.string()), limitations: z.array(z.string()).min(1),
  prohibitedClaims: z.array(z.string()).min(1), acceptanceCriteria: z.array(z.string()).min(1),
  evidenceManifest: z.array(evidenceManifestItemSchema).min(2),
  visualManifest: z.array(visualManifestItemSchema).min(1),
  owner: z.string().min(1), refreshDue: z.string().datetime(),
});

export const contentManifestSchema = z.object({
  title: z.string().min(1), description: z.string().min(1), slug: z.string().min(1),
  canonical: z.string().url(), publishedAt: z.string().date(), updatedAt: z.string().date(),
  lastVerifiedAt: z.string().datetime(), author: z.string().min(1), intent: intentTypeSchema,
  cluster: z.string().min(1), entityIds: z.array(z.string()).min(1),
  opportunityId: z.string().min(1), gapIds: z.array(z.string()), promptFamilyIds: z.array(z.string()),
  validatedKeywords: z.array(z.string()), audience: z.array(z.string()).min(1),
  funnelStage: z.string().min(1), sourceIds: z.array(z.string()).min(1),
  claimIds: z.array(z.string()).min(1), evidenceManifest: z.array(evidenceManifestItemSchema).min(2),
  visualManifest: z.array(visualManifestItemSchema).min(1), related: z.array(z.string()).min(1),
  productCapability: z.string().min(1), indexStatus: z.enum(['INDEX', 'NOINDEX', 'DRAFT']),
  qualityDimensions: z.object({
    intentMatch: z.number().min(0).max(15), productRelevance: z.number().min(0).max(10),
    originalEvidence: z.number().min(0).max(15), answerCompleteness: z.number().min(0).max(10),
    citationReadiness: z.number().min(0).max(10), visualProof: z.number().min(0).max(10),
    sourceQuality: z.number().min(0).max(10), freshness: z.number().min(0).max(5),
    internalLinking: z.number().min(0).max(5), conversionPath: z.number().min(0).max(5),
    technicalReadiness: z.number().min(0).max(5),
  }),
  qualityScore: z.number().int().min(0).max(100), qualityDeficiencies: z.array(z.string()), refreshDue: z.string().datetime(),
  owner: z.string().min(1), requiredSections: z.array(z.string()).min(1),
  coveredQuestions: z.array(z.string()).min(1), cta: z.object({ label: z.string(), href: z.string().startsWith('/') }),
  conversionPath: z.object({ entryIntent: z.string(), valueDelivered: z.string(), nextAction: z.string(), activationEvent: z.string() }),
});

export const decaySignalSchema = z.object({
  url: z.string().startsWith('/'), type: z.enum([
    'STALE_PRICING', 'STALE_COMPETITOR_FACT', 'STALE_PRODUCT_FACT', 'STALE_SCREENSHOT',
    'STALE_STATISTIC', 'BROKEN_EXTERNAL_SOURCE', 'DECLINING_QUERY', 'DECLINING_PAGE',
    'OUTDATED_TECH_GUIDE', 'MISSING_NEW_PRODUCT_FEATURE', 'AI_VISIBILITY_DECLINE',
  ]),
  status: dataAvailabilitySchema, evidence: z.array(z.string()), reason: z.string().min(1),
});

export const sleeperPageSchema = z.object({
  url: z.string().startsWith('/'), historicalEvidence: z.array(z.string()).min(1),
  currentEvidence: z.array(z.string()).min(1), authorityEvidence: z.array(z.string()),
  freshness: freshnessStateSchema, reason: z.string().min(1),
  recommendedRefresh: z.string().min(1), priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']),
});

export type KeywordMetric = z.infer<typeof keywordMetricSchema>;
export type SerpObservation = z.infer<typeof serpObservationSchema>;
export type ResearchCandidate = z.infer<typeof researchCandidateSchema>;
export type FanOutQuestion = z.infer<typeof fanOutQuestionSchema>;
export type AssetInventory = z.infer<typeof assetInventorySchema>;
export type AssetResolution = z.infer<typeof assetResolutionSchema>;
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type ClaimRecord = z.infer<typeof claimRecordSchema>;
export type EvidenceManifestItem = z.infer<typeof evidenceManifestItemSchema>;
export type VisualManifestItem = z.infer<typeof visualManifestItemSchema>;
export type ContentBrief = z.infer<typeof contentBriefSchema>;
export type ContentManifest = z.infer<typeof contentManifestSchema>;
export type DecaySignal = z.infer<typeof decaySignalSchema>;
export type SleeperPage = z.infer<typeof sleeperPageSchema>;
