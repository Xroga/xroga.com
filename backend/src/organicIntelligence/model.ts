import { z } from 'zod';

export const confidenceStateSchema = z.enum(['VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'STALE']);
export const freshnessStateSchema = z.enum(['CURRENT', 'VERIFY_SOON', 'STALE', 'UNKNOWN']);
export const dataAvailabilitySchema = z.enum(['AVAILABLE', 'NO_DATA', 'UNAVAILABLE', 'PLAN_LIMITED']);
export const scoreSchema = z.union([z.number().int().min(0).max(5), z.literal('UNKNOWN')]);

const datedEvidenceSchema = z.object({
  source: z.string().min(1),
  sourceType: z.enum(['PRODUCT_CODE', 'PUBLIC_PAGE', 'PRIMARY_SOURCE', 'GSC', 'AHREFS', 'MANUAL_IMPORT', 'AI_OBSERVATION', 'REPOSITORY_AUDIT']),
  observedAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime().nullable(),
  verificationDue: z.string().datetime().nullable(),
  confidence: confidenceStateSchema,
  freshness: freshnessStateSchema,
  note: z.string().optional(),
});

export const entityTypeSchema = z.enum([
  'COMPANY', 'PRODUCT', 'FEATURE', 'TOOL', 'INTEGRATION', 'TECHNOLOGY', 'CAPABILITY',
  'USE_CASE', 'PROBLEM', 'OUTCOME', 'TOPIC', 'ATTRIBUTE', 'PROPRIETARY_FRAMEWORK',
  'PROPRIETARY_METRIC', 'RESEARCH_ASSET', 'PERSON', 'COMPETITOR', 'PLATFORM',
]);

export const entitySchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]+$/),
  canonicalName: z.string().min(1),
  entityType: entityTypeSchema,
  slug: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(['ACTIVE', 'PARTIAL', 'PLANNED', 'RETIRED']),
  parentIds: z.array(z.string()).default([]),
  childIds: z.array(z.string()).default([]),
  relatedIds: z.array(z.string()).default([]),
  productTruthSources: z.array(z.string()).min(1),
  publicUrls: z.array(z.string()).default([]),
  canonicalFacts: z.array(z.string()).default([]),
  desiredAssociations: z.array(z.string()).default([]),
  actualObservedAssociations: z.array(z.string()).default([]),
  competitorIds: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  audiences: z.array(z.string()).default([]),
  useCases: z.array(z.string()).default([]),
  lastVerifiedAt: z.string().datetime(),
  evidence: z.array(datedEvidenceSchema).min(1),
  notes: z.string().optional(),
});

export const associationTypeSchema = z.enum([
  'CATEGORY', 'CAPABILITY', 'PROBLEM', 'OUTCOME', 'ATTRIBUTE', 'AUDIENCE',
  'TECHNOLOGY', 'USE_CASE', 'COMPETITIVE_POSITION',
]);

export const associationSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().min(1),
  association: z.string().min(1),
  associationType: associationTypeSchema,
  importance: scoreSchema,
  businessValue: scoreSchema,
  productTruthStrength: scoreSchema,
  searchDemandEvidence: z.array(datedEvidenceSchema).default([]),
  promptDemandEvidence: z.array(datedEvidenceSchema).default([]),
  competitiveRelevance: scoreSchema,
  desiredStrength: scoreSchema,
  currentStrength: scoreSchema,
  confidence: confidenceStateSchema,
  status: z.enum(['ACTIVE', 'CANDIDATE', 'REJECTED']),
  lastVerifiedAt: z.string().datetime(),
});

export const canonicalFactSchema = z.object({
  factKey: z.string().regex(/^[a-z0-9][a-z0-9._-]+$/),
  entityId: z.string().min(1),
  value: z.unknown(),
  source: z.string().min(1),
  sourceType: z.enum(['PRODUCT_CODE', 'PUBLIC_PAGE', 'PRIMARY_SOURCE', 'REPOSITORY_AUDIT']),
  effectiveDate: z.string().date(),
  lastVerifiedAt: z.string().datetime(),
  verificationIntervalDays: z.number().int().positive(),
  volatility: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  affectedPublicPages: z.array(z.string()),
  notes: z.string().optional(),
});

export const assetTypeSchema = z.enum([
  'PRODUCT', 'FEATURE', 'CATEGORY', 'COMPARISON', 'ALTERNATIVE', 'MIGRATION', 'GUIDE', 'TOOL',
  'VIDEO', 'TEMPLATE', 'DOCUMENTATION', 'RESEARCH', 'COMMUNITY', 'OTHER',
]);
export const strategySchema = z.enum(['SEO_FIRST', 'AEO_FIRST', 'HYBRID', 'LOW_PRIORITY']);
export const demandItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['KEYWORD', 'PROMPT', 'PROMPT_FAMILY', 'TOPIC_CLUSTER', 'SEARCH_INTENT', 'USER_JOB', 'AUDIENCE', 'FUNNEL_STAGE']),
  value: z.string().min(1),
  parentId: z.string().nullable().default(null),
  relatedEntityIds: z.array(z.string()).default([]),
  intent: z.enum(['INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL', 'WORKFLOW']),
  userJob: z.string().min(1),
  audience: z.array(z.string()).min(1),
  funnelStage: z.enum(['DISCOVERY', 'EVALUATION', 'ACTIVATION', 'RETENTION']),
  requiredAssetType: assetTypeSchema,
  businessPotential: scoreSchema,
  intentFit: scoreSchema,
  difficulty: scoreSchema,
  aiSatisfactionRisk: scoreSchema,
  clickDefensibility: scoreSchema,
  promptRelevance: scoreSchema,
  citationValue: scoreSchema,
  strategy: strategySchema,
  dataStatus: dataAvailabilitySchema,
  evidence: z.array(datedEvidenceSchema).default([]),
});

export const gapTypeSchema = z.enum(['VISIBILITY', 'NARRATIVE', 'TOPIC', 'FORMAT', 'WEB_MENTION', 'DEMAND']);
export const actionTypeSchema = z.enum(['FIX', 'BUILD', 'INFLUENCE', 'PRODUCT', 'IGNORE']);
export const gapSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().min(1),
  topicClusterId: z.string().min(1),
  desiredAssociationId: z.string().nullable(),
  actualAssociation: z.string().nullable(),
  platform: z.string().min(1),
  competitorIds: z.array(z.string()),
  gapType: gapTypeSchema,
  currentState: z.string().min(1),
  desiredState: z.string().min(1),
  evidence: z.array(datedEvidenceSchema).min(1),
  evidenceQuality: confidenceStateSchema,
  sourceUrls: z.array(z.string()),
  searchDemand: scoreSchema,
  promptDemand: scoreSchema,
  businessValue: scoreSchema,
  productFit: scoreSchema,
  format: z.string().nullable(),
  observedAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime().nullable(),
  recommendedAction: z.string().min(1),
  actionType: actionTypeSchema,
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']),
  status: z.enum(['OPEN', 'VALIDATING', 'PLANNED', 'ACTED', 'MEASURED', 'DISMISSED']),
});

export const opportunityScoresSchema = z.object({
  businessPotential: scoreSchema, searchDemand: scoreSchema, promptDemand: scoreSchema,
  commercialProximity: scoreSchema, productFit: scoreSchema, searchIntentFit: scoreSchema,
  rankingAttainability: scoreSchema, aiVisibilityGap: scoreSchema, competitorGap: scoreSchema,
  entityAssociationValue: scoreSchema, aiSatisfactionRisk: scoreSchema, clickDefensibility: scoreSchema,
  formatOpportunity: scoreSchema, existingAuthority: scoreSchema, evidenceAvailability: scoreSchema,
  conversionPotential: scoreSchema, maintenanceBurden: scoreSchema, strategicValue: scoreSchema,
});
export const opportunitySchema = z.object({
  id: z.string().min(1), entityId: z.string().min(1), topicClusterId: z.string().min(1),
  gapIds: z.array(z.string()).min(1), title: z.string().min(1), strategy: strategySchema,
  actionTypes: z.array(actionTypeSchema).min(1), priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']),
  scores: opportunityScoresSchema, rationale: z.array(z.string()).min(1), evidence: z.array(datedEvidenceSchema),
  recommendedWork: z.array(z.string()).min(1), remeasurementPlan: z.string().min(1),
});

export const gscRowSchema = z.object({
  query: z.string().min(1), page: z.string().url(), country: z.string().optional(), device: z.string().optional(),
  date: z.string().date(), clicks: z.number().nonnegative(), impressions: z.number().nonnegative(),
  ctr: z.number().min(0).max(1), position: z.number().nonnegative(),
});
export const promptObservationSchema = z.object({
  promptId: z.string().min(1), promptFamily: z.string().min(1), promptText: z.string().min(1),
  intent: z.string().min(1), audience: z.string().min(1),
  engine: z.enum(['ChatGPT', 'Perplexity', 'Claude', 'Copilot', 'Google AI', 'Other']),
  engineVersion: z.string().nullable(), country: z.string().nullable(), date: z.string().date(),
  xrogaState: z.enum(['CITED_LINKED', 'MENTIONED_UNLINKED', 'ABSENT', 'INCORRECT_OR_MISLEADING']),
  xrogaCitedUrl: z.string().url().nullable(), mentionContext: z.string().nullable(),
  competitorsMentioned: z.array(z.string()), sourcesCited: z.array(z.string()), externalDomains: z.array(z.string()),
  narrativeAccuracy: scoreSchema, sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN']),
  notes: z.string().nullable(), observationMethod: z.enum(['MANUAL', 'AUTHORIZED_API', 'IMPORT']),
  sampleSize: z.number().int().positive(), confidence: confidenceStateSchema,
});

export const mentionSchema = z.object({
  id: z.string().min(1), sourceDomain: z.string().min(1), sourceUrl: z.string().url(), pageTitle: z.string().min(1),
  author: z.string().nullable(), publicationType: z.string().min(1), brandEntityIds: z.array(z.string()),
  mentionContext: z.string().nullable(), linked: z.boolean(), linkUrl: z.string().url().nullable(),
  sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNKNOWN']), topicClusterId: z.string().min(1),
  attribute: z.string().nullable(), competitorIds: z.array(z.string()), xrogaPresent: z.boolean(),
  pageReferringDomains: scoreSchema, pageOrganicTraffic: scoreSchema, domainAuthority: scoreSchema,
  aiCitationFrequency: scoreSchema, contentFormat: z.string().min(1), commercialIntent: scoreSchema,
  editorialIndependence: scoreSchema, topicRelevance: scoreSchema.default('UNKNOWN'),
  freshness: freshnessStateSchema, outreachFeasibility: scoreSchema,
  dateDiscovered: z.string().date(), dateVerified: z.string().date().nullable(),
});

export const formatCoverageSchema = z.object({
  topicClusterId: z.string().min(1),
  format: z.enum(['PRODUCT_PAGE', 'FEATURE_PAGE', 'GUIDE', 'BLOG', 'COMPARISON', 'ALTERNATIVE', 'MIGRATION', 'VIDEO', 'TOOL', 'RESEARCH', 'BENCHMARK', 'DOCUMENTATION', 'TEMPLATE', 'SHOWCASE', 'PUBLIC_REPORT', 'THIRD_PARTY_EDITORIAL', 'COMMUNITY', 'OTHER']),
  exists: z.boolean(), url: z.string().nullable(), competitorsHaveFormat: z.boolean().nullable(),
  googleRewardsFormat: z.boolean().nullable(), aiEnginesCiteFormat: z.boolean().nullable(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']), evidence: z.array(datedEvidenceSchema),
});

export const crawlerPolicySchema = z.object({
  crawler: z.string().min(1), purpose: z.string().min(1), searchRetrievalRole: z.string().min(1),
  trainingRole: z.string().min(1), currentPolicy: z.enum(['ALLOW_PUBLIC', 'BLOCK', 'DOCUMENT_ONLY', 'UNKNOWN']),
  desiredPolicy: z.enum(['ALLOW_PUBLIC', 'BLOCK', 'DOCUMENT_ONLY', 'UNKNOWN']),
  lastVerified: z.string().datetime().nullable(), notes: z.string().min(1), evidenceSource: z.string().min(1),
});

export const visibilityMetricSchema = z.object({
  id: z.string().min(1), entityId: z.string().min(1), platform: z.enum(['GOOGLE_SEARCH', 'GOOGLE_AI', 'CHATGPT', 'PERPLEXITY', 'CLAUDE', 'BING_COPILOT', 'OTHER']),
  metric: z.enum(['ORGANIC_KEYWORDS', 'POSITION', 'IMPRESSIONS', 'CLICKS', 'CTR', 'ORGANIC_TRAFFIC', 'REFERRING_DOMAINS', 'BACKLINKS', 'TRAFFIC_VALUE', 'ENTITY_MENTIONS', 'CITATIONS', 'AI_SHARE_OF_VOICE', 'NARRATIVE_ACCURACY']),
  value: z.union([z.number(), z.literal('UNKNOWN')]), unit: z.string().min(1), page: z.string().url().nullable(),
  provider: z.string().min(1), availability: dataAvailabilitySchema, evidence: z.array(datedEvidenceSchema),
  topicClusterId: z.string().min(1).nullable().default(null),
});

export const productOpportunitySchema = z.object({
  id: z.string().min(1), requestedCapability: z.string().min(1), evidence: z.array(datedEvidenceSchema),
  searchDemand: scoreSchema, promptDemand: scoreSchema, competitorSupport: scoreSchema,
  businessPotential: scoreSchema, strategicValue: scoreSchema, relatedUserProblems: z.array(z.string()).min(1),
  status: z.enum(['OPEN', 'VALIDATING', 'PLANNED', 'DISMISSED']),
});

export type Entity = z.infer<typeof entitySchema>;
export type Association = z.infer<typeof associationSchema>;
export type CanonicalFact = z.infer<typeof canonicalFactSchema>;
export type DemandItem = z.infer<typeof demandItemSchema>;
export type Gap = z.infer<typeof gapSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type OpportunityScores = z.infer<typeof opportunityScoresSchema>;
export type GscRow = z.infer<typeof gscRowSchema>;
export type PromptObservation = z.infer<typeof promptObservationSchema>;
export type Mention = z.infer<typeof mentionSchema>;
export type FormatCoverage = z.infer<typeof formatCoverageSchema>;
export type CrawlerPolicy = z.infer<typeof crawlerPolicySchema>;
export type Evidence = z.infer<typeof datedEvidenceSchema>;
export type VisibilityMetric = z.infer<typeof visibilityMetricSchema>;
export type ProductOpportunity = z.infer<typeof productOpportunitySchema>;
