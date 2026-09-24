import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  authorityReceiptSchema, communityOpportunitySchema, creatorRecordSchema, externalSourceSchema,
  outreachRecordSchema, satelliteDecisionSchema, skillContractSchema,
  type AuthorityReceipt, type CommunityOpportunity, type CreatorRecord, type ExternalSource,
  type OutreachRecord, type SatelliteDecision, type SkillContract,
} from './model.js';
import { REPOSITORY_ROOT } from '../repository.js';

export const AUTHORITY_SOURCE_ROOT = path.join(REPOSITORY_ROOT, 'growth', 'authority');
export const AUTHORITY_OUTPUT_ROOT = path.join(REPOSITORY_ROOT, 'artifacts', 'growth-authority');

export type GithubObservation = {
  repository: string;
  url: string;
  description: string;
  homepage: string;
  visibility: 'PUBLIC' | 'PRIVATE';
  topics: string[];
  stars: number | 'UNKNOWN';
  forks: number | 'UNKNOWN';
  discussionsEnabled: boolean;
  issuesEnabled: boolean;
  releases: number | 'UNKNOWN';
  tags: number | 'UNKNOWN';
  license: string | null;
  observedAt: string;
  evidenceState: 'VERIFIED' | 'OBSERVED' | 'INFERRED' | 'UNKNOWN' | 'STALE';
};

export type AuthoritySource = {
  externalSources: ExternalSource[];
  creators: CreatorRecord[];
  communities: CommunityOpportunity[];
  outreach: OutreachRecord[];
  receipts: AuthorityReceipt[];
  satellites: SatelliteDecision[];
  skillContracts: SkillContract[];
  github: GithubObservation;
};

async function json(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(AUTHORITY_SOURCE_ROOT, name), 'utf8'));
}

function list<T>(value: unknown, parser: { parse(input: unknown): T }): T[] {
  if (!Array.isArray(value)) throw new Error('Authority source must be a JSON array.');
  return value.map((item) => parser.parse(item));
}

function github(value: unknown): GithubObservation {
  if (!value || typeof value !== 'object') throw new Error('GitHub observation must be an object.');
  const record = value as Partial<GithubObservation>;
  if (!record.repository || !record.url || !record.observedAt) throw new Error('GitHub observation is missing repository evidence.');
  return record as GithubObservation;
}

export async function loadAuthoritySource(): Promise<AuthoritySource> {
  const [externalSources, creators, communities, outreach, receipts, satellites, githubObservation, projectCheckSkill] = await Promise.all([
    json('external-sources.json'), json('creators.json'), json('communities.json'), json('outreach.json'),
    json('receipts.json'), json('satellites.json'), json('github.json'), json('skills/xroga-project-check.json'),
  ]);
  return {
    externalSources: list(externalSources, externalSourceSchema), creators: list(creators, creatorRecordSchema),
    communities: list(communities, communityOpportunitySchema), outreach: list(outreach, outreachRecordSchema),
    receipts: list(receipts, authorityReceiptSchema), satellites: list(satellites, satelliteDecisionSchema),
    skillContracts: [skillContractSchema.parse(projectCheckSkill)],
    github: github(githubObservation),
  };
}

export async function writeAuthorityOutput(name: string, content: string, dryRun: boolean): Promise<string> {
  const target = path.join(AUTHORITY_OUTPUT_ROOT, name);
  if (!dryRun) {
    await mkdir(AUTHORITY_OUTPUT_ROOT, { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return target;
}
