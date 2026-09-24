import { z } from 'zod';
import { confidenceStateSchema, freshnessStateSchema, scoreSchema } from '../model.js';

export const authorityNodeTypeSchema = z.enum([
  'XROGA_ASSET', 'XROGA_REPOSITORY', 'PACKAGE', 'MCP_SERVER', 'SKILL', 'GITHUB_ACTION',
  'PUBLIC_REPORT', 'BADGE', 'VIDEO', 'RESEARCH', 'BENCHMARK', 'EXTERNAL_ARTICLE',
  'EXTERNAL_COMPARISON', 'EXTERNAL_REVIEW', 'CREATOR', 'AUTHOR', 'PUBLICATION',
  'COMMUNITY', 'FORUM_THREAD', 'NEWSLETTER', 'DIRECTORY', 'MARKETPLACE', 'PARTNER',
  'INTEGRATION', 'USER_PROJECT', 'CASE_STUDY',
]);

export const authorityRelationshipTypeSchema = z.enum([
  'MENTIONS', 'LINKS_TO', 'CITES', 'EMBEDS', 'INSTALLS', 'USES', 'REVIEWS', 'COMPARES',
  'REFERENCES', 'FEATURES', 'DISCUSSES', 'RANKS_FOR', 'CITED_BY_AI', 'RELATED_TO',
]);

export const authorityTierSchema = z.enum(['TIER_1_EDITORIAL', 'TIER_2_COMMUNITY', 'TIER_3_OWNED']);
export const ownershipSchema = z.enum(['OWNED', 'EARNED', 'PAID', 'COMMUNITY', 'PARTNER']);
export const evidenceStateSchema = z.enum(['VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'STALE']);
export const privacyClassSchema = z.enum(['PUBLIC_SAFE', 'AGGREGATED_SAFE', 'PRIVATE', 'REQUIRES_CONSENT']);
export const sourceClassSchema = z.enum([
  'CATEGORY_LIST', 'COMPARISON', 'REVIEW', 'TUTORIAL', 'NEWS', 'RESEARCH', 'NEWSLETTER',
  'VIDEO', 'PODCAST', 'FORUM', 'COMMUNITY_THREAD', 'DIRECTORY', 'MARKETPLACE', 'PARTNER', 'OTHER',
]);
export const influenceActionSchema = z.enum([
  'EDITORIAL_PITCH', 'PRODUCT_REVIEW_REQUEST', 'DATA_PITCH', 'EXPERT_COMMENT', 'RESEARCH_SHARE',
  'CREATOR_DEMO', 'PARTNERSHIP', 'INTEGRATION_PITCH', 'COMMUNITY_ANSWER', 'OPEN_SOURCE_SUBMISSION',
  'DIRECTORY_SUBMISSION', 'MARKETPLACE_SUBMISSION', 'VIDEO_COLLABORATION', 'CASE_STUDY',
  'NEWSLETTER_PITCH', 'PRODUCT_LAUNCH_SURFACE', 'FACT_CORRECTION', 'REJECT',
]);
export const authorityStatusSchema = z.enum([
  'DISCOVERED', 'QUALIFIED', 'PITCH_READY', 'CONTACTED', 'IN_DISCUSSION', 'PUBLISHED_UNVERIFIED',
  'VERIFIED_MENTION', 'VERIFIED_LINK', 'REJECTED', 'NOT_RELEVANT', 'STALE', 'REMOVED',
]);
export const linkAttributeSchema = z.enum(['FOLLOW', 'NOFOLLOW', 'SPONSORED', 'UGC', 'UNKNOWN']);
export const mentionContextSchema = z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'COMPARATIVE', 'FACTUAL', 'INCORRECT', 'UNKNOWN']);

const observedRecord = {
  confidence: confidenceStateSchema,
  freshness: freshnessStateSchema,
  observedAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime().nullable(),
};

export const authorityNodeSchema = z.object({
  id: z.string().min(1), type: authorityNodeTypeSchema, label: z.string().min(1),
  url: z.string().url().nullable(), ownership: ownershipSchema, privacy: privacyClassSchema,
  topicIds: z.array(z.string()), associationIds: z.array(z.string()), evidenceState: evidenceStateSchema,
  ...observedRecord,
});

export const authorityEdgeSchema = z.object({
  id: z.string().min(1), fromId: z.string().min(1), toId: z.string().min(1),
  relationship: authorityRelationshipTypeSchema, evidenceState: evidenceStateSchema,
  sourceUrl: z.string().url().nullable(), ...observedRecord,
});

export const externalSourceSchema = z.object({
  id: z.string().min(1), url: z.string().url(), title: z.string().min(1), domain: z.string().min(1),
  author: z.string().nullable(), publication: z.string().nullable(), sourceClass: sourceClassSchema,
  topicIds: z.array(z.string()), competitorIds: z.array(z.string()), xrogaPresent: z.boolean(),
  linked: z.boolean(), linkUrl: z.string().url().nullable(), linkAttribute: linkAttributeSchema,
  pageBacklinks: scoreSchema, pageReferringDomains: scoreSchema, pageTraffic: scoreSchema,
  rankingKeywords: scoreSchema, searchPosition: z.union([z.number().positive(), z.literal('UNKNOWN')]),
  aiCitationFrequency: scoreSchema, topicalRelevance: scoreSchema, editorialIndependence: scoreSchema,
  realAudience: scoreSchema, commercialRelevance: scoreSchema, trust: scoreSchema,
  contactability: scoreSchema, evidenceState: evidenceStateSchema, mentionContext: mentionContextSchema,
  ...observedRecord,
});

export const influenceOpportunitySchema = z.object({
  id: z.string().min(1), sourceId: z.string().min(1), command1GapIds: z.array(z.string()),
  action: influenceActionSchema, tier: authorityTierSchema, status: authorityStatusSchema,
  whyRelevant: z.string().min(1), proposedValue: z.string().min(1), evidenceAsset: z.string().nullable(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']), score: z.number().int().min(0).max(100),
  scoreBreakdown: z.record(z.union([z.number(), z.literal('UNKNOWN')])),
  blockers: z.array(z.string()), evidenceState: evidenceStateSchema, ...observedRecord,
});

export const outreachRecordSchema = z.object({
  targetId: z.string().min(1), sourceId: z.string().min(1), page: z.string().url(),
  author: z.string().nullable(), whyRelevant: z.string().min(1), competitorsPresent: z.array(z.string()),
  xrogaGap: z.string().min(1), proposedValue: z.string().min(1), pitchType: influenceActionSchema,
  evidenceAsset: z.string().nullable(), contactSource: z.string().nullable(),
  contactPermission: z.enum(['AUTHORIZED', 'UNKNOWN', 'DENIED']), draftStatus: z.enum(['NONE', 'DRAFTED', 'APPROVED']),
  sentStatus: z.enum(['NOT_SENT', 'SENT_AUTHORIZED']), response: z.string().nullable(),
  result: z.string().nullable(), mentionObtained: z.boolean(), linkObtained: z.boolean(),
  date: z.string().date().nullable(), nextAction: z.string().min(1),
});

export const authorityReceiptSchema = z.object({
  authorityId: z.string().min(1), asset: z.string().min(1), distributionSurface: z.string().min(1),
  externalUrl: z.string().url(), sourceType: ownershipSchema, date: z.string().date(),
  status: authorityStatusSchema, mentionContext: mentionContextSchema, linked: z.boolean(),
  linkUrl: z.string().url().nullable(), linkAttribute: linkAttributeSchema,
  competitorsPresent: z.array(z.string()), evidenceState: evidenceStateSchema,
  verificationDate: z.string().date().nullable(), result: z.string().min(1),
});

export const creatorRecordSchema = z.object({
  id: z.string().min(1), creator: z.string().min(1), channel: z.string().min(1), platform: z.string().min(1),
  url: z.string().url(), topicIds: z.array(z.string()), audience: z.string().min(1),
  relevantContentUrls: z.array(z.string().url()), competitorIds: z.array(z.string()), xrogaCovered: z.boolean(),
  searchVisibility: scoreSchema, engagementEvidence: z.array(z.string()), contactability: scoreSchema,
  fit: scoreSchema, proposedValue: z.string().min(1), evidenceState: evidenceStateSchema,
  lastVerifiedAt: z.string().datetime().nullable(),
});

export const communityOpportunitySchema = z.object({
  id: z.string().min(1), threadUrl: z.string().url(), community: z.string().min(1), topicId: z.string().min(1),
  question: z.string().min(1), date: z.string().date(), activity: scoreSchema,
  competitorIds: z.array(z.string()), xrogaMentioned: z.boolean(), userIntent: z.string().min(1),
  answerOpportunity: z.boolean(), xrogaRelevance: scoreSchema, affiliationDisclosureNeeded: z.boolean(),
  recommendedAction: z.enum(['ANSWER_USEFULLY', 'MONITOR', 'IGNORE']), evidenceState: evidenceStateSchema,
});

export const videoOpportunitySchema = z.object({
  id: z.string().min(1), query: z.string().min(1), topicId: z.string().min(1), promptFamilyIds: z.array(z.string()),
  evidenceState: evidenceStateSchema, serpEvidenceIds: z.array(z.string()), competitorUrls: z.array(z.string().url()),
  angle: z.string().min(1), audience: z.string().min(1), associatedPage: z.string().startsWith('/'),
  cta: z.string().min(1), priority: z.enum(['P0', 'P1', 'P2', 'P3', 'P4']),
  status: z.enum(['GENERATED_IDEA', 'VALIDATED_OPPORTUNITY', 'BRIEF_READY', 'PUBLISHED']),
});

export const videoBriefSchema = z.object({
  id: z.string().min(1), opportunityId: z.string().min(1), targetQuery: z.string().min(1),
  userJob: z.string().min(1), hook: z.string().min(1), promise: z.string().min(1), proof: z.array(z.string()).min(1),
  demoEnvironment: z.string().min(1), chapters: z.array(z.object({ title: z.string().min(1), purpose: z.string().min(1) })).min(2),
  claimIds: z.array(z.string()), sourceIds: z.array(z.string()), visuals: z.array(z.string()),
  associatedPage: z.string().startsWith('/'), cta: z.string().min(1), titleCandidates: z.array(z.string()).min(2),
  description: z.string().min(1), thumbnailConcept: z.string().min(1), limitations: z.array(z.string()).min(1),
  transcriptStatus: z.enum(['REQUIRED_REVIEWED', 'NOT_CREATED']),
});

export const satelliteDecisionSchema = z.object({
  id: z.string().min(1), kind: z.enum(['MCP', 'CLI', 'ACTION', 'SKILLS', 'BENCHMARKS', 'EXAMPLES']),
  purpose: z.string().min(1), utility: scoreSchema, maturity: scoreSchema, distributionPotential: scoreSchema,
  maintenanceBurden: scoreSchema, securityRisk: scoreSchema, installFriction: scoreSchema,
  licensing: z.enum(['APPROVED', 'OWNER_DECISION_REQUIRED']),
  decision: z.enum(['SELECTED_WEDGE', 'PLANNED', 'NOT_WORTH_BUILDING', 'BLOCKED']),
  rationale: z.array(z.string()).min(1), releaseReady: z.boolean(), blockers: z.array(z.string()),
});

export const releaseImportanceSchema = z.enum(['MAJOR', 'NOTABLE', 'MINOR', 'INTERNAL']);

export const mcpPermissionTierSchema = z.enum(['READ_ONLY', 'PROJECT_MUTATION', 'EXTERNAL_WRITE', 'PRODUCTION', 'DESTRUCTIVE']);
export const mcpToolContractSchema = z.object({
  id: z.string().min(1), description: z.string().min(1), permissionTier: mcpPermissionTierSchema,
  requiresExplicitAuthorization: z.boolean(), inputs: z.array(z.string()), outputs: z.array(z.string()),
  implemented: z.boolean(),
}).superRefine((tool, context) => {
  if (tool.permissionTier !== 'READ_ONLY' && !tool.requiresExplicitAuthorization) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Sensitive MCP tools require explicit authorization.' });
  }
});

export const skillContractSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), when_to_use: z.string().min(1),
  inputs: z.record(z.string()), outputs: z.record(z.string()), required_tools: z.array(z.string()).min(1),
  permissions: z.array(z.string()).min(1), workflow: z.array(z.string()).min(1), guardrails: z.array(z.string()).min(1),
  failure_states: z.array(z.string()).min(1), evidence: z.array(z.string()).min(1), related_docs: z.array(z.string().url()),
});

export const caseStudySchema = z.object({
  id: z.string().min(1), participant: z.string().min(1), project: z.string().min(1), permissionGranted: z.boolean(),
  beforeState: z.string().min(1), problem: z.string().min(1), workflow: z.array(z.string()).min(1), result: z.string().min(1),
  measurement: z.array(z.string()).min(1), limitations: z.array(z.string()).min(1), date: z.string().date(),
  proofUrls: z.array(z.string().url()).min(1), privacy: privacyClassSchema,
});

export type AuthorityNode = z.infer<typeof authorityNodeSchema>;
export type AuthorityEdge = z.infer<typeof authorityEdgeSchema>;
export type ExternalSource = z.infer<typeof externalSourceSchema>;
export type InfluenceOpportunity = z.infer<typeof influenceOpportunitySchema>;
export type OutreachRecord = z.infer<typeof outreachRecordSchema>;
export type AuthorityReceipt = z.infer<typeof authorityReceiptSchema>;
export type CreatorRecord = z.infer<typeof creatorRecordSchema>;
export type CommunityOpportunity = z.infer<typeof communityOpportunitySchema>;
export type VideoOpportunity = z.infer<typeof videoOpportunitySchema>;
export type VideoBrief = z.infer<typeof videoBriefSchema>;
export type SatelliteDecision = z.infer<typeof satelliteDecisionSchema>;
export type McpToolContract = z.infer<typeof mcpToolContractSchema>;
export type SkillContract = z.infer<typeof skillContractSchema>;
export type CaseStudy = z.infer<typeof caseStudySchema>;
