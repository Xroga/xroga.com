import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildGrowthContentSnapshot, type GrowthContentSnapshot } from '../content/pipeline.js';
import { loadGrowthContentSource } from '../content/repository.js';
import type { IntelligenceSnapshot } from '../intelligence.js';
import { loadSource, REPOSITORY_ROOT } from '../repository.js';
import {
  authorityDiversity, buildOwnedGraph, narrativeCorrections, operationalMentionIntersect,
  qualifyCreator, validateCommunityOpportunity, validateSatellite, videoOpportunities,
} from './engine.js';
import type {
  AuthorityEdge, AuthorityNode, InfluenceOpportunity, OutreachRecord, VideoBrief, VideoOpportunity,
} from './model.js';
import { loadAuthoritySource, type AuthoritySource } from './repository.js';

export type GithubAudit = {
  observed: AuthoritySource['github'];
  readme: { present: boolean; hasProductDefinition: boolean; hasWorkflow: boolean; hasTryLink: boolean; hasSecurity: boolean; hasContributing: boolean };
  community: { securityPolicy: boolean; contributing: boolean; codeowners: boolean; issueTemplates: boolean; pullRequestTemplate: boolean };
  findings: string[];
};

export type AuthoritySnapshot = {
  generatedAt: string;
  command1: IntelligenceSnapshot;
  command2: GrowthContentSnapshot;
  source: AuthoritySource;
  graph: { nodes: AuthorityNode[]; edges: AuthorityEdge[] };
  influenceOpportunities: InfluenceOpportunity[];
  outreachQueue: OutreachRecord[];
  narrativeCorrections: ReturnType<typeof narrativeCorrections>;
  creatorQualification: Array<{ creatorId: string; qualified: boolean; reason: string }>;
  communityFindings: Array<{ opportunityId: string; issues: string[] }>;
  videoOpportunities: VideoOpportunity[];
  videoBriefs: VideoBrief[];
  githubAudit: GithubAudit;
  satelliteFindings: Array<{ satelliteId: string; issues: string[] }>;
  authorityDiversity: Record<string, ReturnType<typeof authorityDiversity>>;
  firstControlledBatch: Array<{ id: string; status: 'IMPLEMENTED' | 'PLANNED' | 'BLOCKED'; reason: string }>;
  feedback: { command1: string[]; command2: string[]; command3: string[]; command5Events: Array<Record<string, unknown>> };
  unknowns: string[];
  ownerDecisions: string[];
};

async function exists(relative: string): Promise<boolean> {
  try { await access(path.join(REPOSITORY_ROOT, relative)); return true; } catch { return false; }
}

export async function auditGithub(observed: AuthoritySource['github']): Promise<GithubAudit> {
  const readmeText = await readFile(path.join(REPOSITORY_ROOT, 'README.md'), 'utf8');
  const [securityPolicy, contributing, codeowners, issueTemplates, pullRequestTemplate] = await Promise.all([
    exists('SECURITY.md'), exists('CONTRIBUTING.md'), exists('.github/CODEOWNERS'),
    exists('.github/ISSUE_TEMPLATE'), exists('.github/pull_request_template.md'),
  ]);
  const readme = {
    present: true,
    hasProductDefinition: /What Xroga is|AI coding/i.test(readmeText),
    hasWorkflow: /Understand.+implement.+validate.+repair/is.test(readmeText),
    hasTryLink: /https:\/\/xroga\.com\/(workspace|auth\/signup)/i.test(readmeText),
    hasSecurity: /SECURITY\.md|\/security/i.test(readmeText),
    hasContributing: /CONTRIBUTING\.md|contribut/i.test(readmeText),
  };
  const findings: string[] = [];
  if (!observed.topics.length) findings.push('Repository topics are empty.');
  if (!observed.license) findings.push('Open-source licensing remains OWNER_DECISION_REQUIRED.');
  if (observed.releases === 0) findings.push('No GitHub releases exist; version policy is required before creating one.');
  if (!observed.discussionsEnabled) findings.push('GitHub Discussions are disabled; enable only with a community ownership plan.');
  if (!securityPolicy) findings.push('SECURITY.md is missing.');
  if (!contributing) findings.push('CONTRIBUTING.md is missing.');
  if (!issueTemplates) findings.push('Issue templates are missing.');
  if (!pullRequestTemplate) findings.push('Pull request template is missing.');
  return { observed, readme, community: { securityPolicy, contributing, codeowners, issueTemplates, pullRequestTemplate }, findings };
}

function externalGraph(source: AuthoritySource): { nodes: AuthorityNode[]; edges: AuthorityEdge[] } {
  const nodes: AuthorityNode[] = source.externalSources.map((item) => ({
    id: `source.${item.id}`, type: item.sourceClass === 'COMPARISON' ? 'EXTERNAL_COMPARISON'
      : item.sourceClass === 'REVIEW' ? 'EXTERNAL_REVIEW'
        : item.sourceClass === 'VIDEO' ? 'VIDEO'
          : ['FORUM', 'COMMUNITY_THREAD'].includes(item.sourceClass) ? 'FORUM_THREAD' : 'EXTERNAL_ARTICLE',
    label: item.title, url: item.url, ownership: ['FORUM', 'COMMUNITY_THREAD'].includes(item.sourceClass) ? 'COMMUNITY' : 'EARNED',
    privacy: 'PUBLIC_SAFE', topicIds: item.topicIds, associationIds: [], evidenceState: item.evidenceState,
    confidence: item.confidence, freshness: item.freshness, observedAt: item.observedAt, lastVerifiedAt: item.lastVerifiedAt,
  }));
  const edges: AuthorityEdge[] = source.externalSources.filter((item) => item.xrogaPresent).map((item) => ({
    id: `edge.${item.id}.xroga`, fromId: `source.${item.id}`, toId: 'repo.xroga-main', relationship: item.linked ? 'LINKS_TO' : 'MENTIONS',
    evidenceState: item.evidenceState, sourceUrl: item.url, confidence: item.confidence, freshness: item.freshness,
    observedAt: item.observedAt, lastVerifiedAt: item.lastVerifiedAt,
  }));
  return { nodes, edges };
}

export async function buildAuthoritySnapshot(input?: {
  authoritySource?: AuthoritySource; now?: Date;
}): Promise<AuthoritySnapshot> {
  const now = input?.now ?? new Date();
  const [command1Source, contentSource, authoritySource] = await Promise.all([
    loadSource(), loadGrowthContentSource(), input?.authoritySource ? Promise.resolve(input.authoritySource) : loadAuthoritySource(),
  ]);
  const [command2, githubAudit] = await Promise.all([
    buildGrowthContentSnapshot({ command1Source, growthSource: contentSource, now }),
    auditGithub(authoritySource.github),
  ]);
  const command1 = command2.command1;
  const actionReady = await exists('.github/actions/project-check/action.yml');
  const skillReady = authoritySource.skillContracts.some((skill) => skill.id === 'xroga-project-check');
  const owned = buildOwnedGraph({
    repositoryUrl: authoritySource.github.url,
    assets: contentSource.inventory.map((asset) => ({ id: asset.id, title: asset.title, url: asset.url, topicClusterIds: asset.topicClusterIds })),
    now, actionReady, skillReady,
  });
  const external = externalGraph(authoritySource);
  const influenceOpportunities = operationalMentionIntersect(command1Source.mentions, command1.gaps, authoritySource.externalSources, now);
  const associationPages = new Map<string, string>();
  for (const asset of contentSource.inventory) for (const topic of asset.topicClusterIds) if (!associationPages.has(topic)) associationPages.set(topic, asset.url);
  const videos = videoOpportunities({ videoGaps: command2.videoGaps, serpRows: contentSource.serpObservations, associationPages });
  const topicIds = [...new Set([...command1Source.demand.filter((item) => item.kind === 'TOPIC_CLUSTER').map((item) => item.id), ...owned.nodes.flatMap((node) => node.topicIds)])];
  const graph = { nodes: [...owned.nodes, ...external.nodes], edges: [...owned.edges, ...external.edges] };
  const verifiedReceipts = authoritySource.receipts.filter((receipt) => ['VERIFIED_MENTION', 'VERIFIED_LINK'].includes(receipt.status));
  const unknowns = [...command1.unknowns];
  if (!authoritySource.externalSources.length) unknowns.push('External source intelligence: NO_DATA; no Mention Intersect targets can be qualified.');
  if (!authoritySource.creators.length) unknowns.push('Creator/reviewer intelligence: NO_DATA; no creator interest is inferred.');
  if (!authoritySource.communities.length) unknowns.push('Community opportunity intelligence: NO_DATA; no community posts are proposed.');
  if (!videos.length) unknowns.push('Video SERP evidence: NO_DATA; no video brief is represented as validated.');
  if (!verifiedReceipts.length) unknowns.push('Earned mentions/links: NO_DATA; owned assets are not counted as independent authority.');
  const ownerDecisions: string[] = [];
  if (!authoritySource.github.license) ownerDecisions.push('Choose an approved license before extracting a reusable satellite repository or package.');
  if (authoritySource.github.releases === 0) ownerDecisions.push('Define version/release policy before creating tags or GitHub Releases.');
  ownerDecisions.push('Decide whether to enable GitHub Discussions and assign community moderation ownership.');
  return {
    generatedAt: now.toISOString(), command1, command2, source: authoritySource, graph,
    influenceOpportunities, outreachQueue: authoritySource.outreach,
    narrativeCorrections: narrativeCorrections(authoritySource.externalSources, command1Source.facts),
    creatorQualification: authoritySource.creators.map((creator) => ({ creatorId: creator.id, ...qualifyCreator(creator) })),
    communityFindings: authoritySource.communities.map((item) => ({ opportunityId: item.id, issues: validateCommunityOpportunity(item) })),
    videoOpportunities: videos, videoBriefs: [], githubAudit,
    satelliteFindings: authoritySource.satellites.map((item) => ({ satelliteId: item.id, issues: validateSatellite(item) })),
    authorityDiversity: Object.fromEntries(topicIds.map((topicId) => [topicId, authorityDiversity(graph.nodes, topicId)])),
    firstControlledBatch: [
      { id: 'github.discovery', status: 'IMPLEMENTED', reason: 'Audit and improve truthful repository discovery, security and contribution surfaces.' },
      { id: 'action.project-check', status: actionReady ? 'IMPLEMENTED' : 'BLOCKED', reason: 'Functional deterministic repository project check with no source upload.' },
      { id: 'skill.project-check', status: skillReady ? 'IMPLEMENTED' : 'BLOCKED', reason: 'Outcome contract orchestrates the real project-check tool.' },
    ],
    feedback: {
      command1: [
        ...verifiedReceipts.map((receipt) => `${receipt.authorityId}:${receipt.status}`),
        ...influenceOpportunities.map((item) => `${item.id}:WEB_MENTION:${item.status}`),
      ],
      command2: [],
      command3: graph.nodes.filter((node) => node.ownership === 'OWNED').map((node) => `${node.id}:${node.url ?? 'NO_PUBLIC_URL'}`),
      command5Events: authoritySource.receipts.map((receipt) => ({
        authorityId: receipt.authorityId, surface: receipt.distributionSurface, status: receipt.status,
        asset: receipt.asset, date: receipt.date, externalUrl: receipt.externalUrl, sourceType: receipt.sourceType,
      })),
    },
    unknowns: [...new Set(unknowns)], ownerDecisions,
  };
}
