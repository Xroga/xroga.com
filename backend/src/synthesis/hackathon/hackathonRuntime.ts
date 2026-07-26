import { createHash } from 'crypto';
import type { ResearchEvidence } from '../research/researchEngine.js';
import { requireFreshAuthoritativeEvidence } from '../research/researchEngine.js';

export interface HackathonDefinition {
  schema: 'xroga.hackathon-definition'; schemaVersion: '1.0.0'; migrationPath: string[];
  title: string; organizer: string; deadline: string; teamSize: { minimum: number; maximum: number };
  judgingCriteria: string[]; sponsorTracks: Array<{ id: string; name: string; requiredTechnologies: string[]; evidenceIds: string[] }>;
  deliverables: string[]; prohibitedActions: string[]; officialEvidenceIds: string[]; extractedAt: string; expiresAt: string;
}

export function compileHackathonDefinition(input: { title: string; organizer: string; deadline: string; teamSize: { minimum: number; maximum: number }; judgingCriteria: string[]; sponsorTracks: HackathonDefinition['sponsorTracks']; deliverables: string[]; prohibitedActions: string[]; evidence: ResearchEvidence[]; now?: Date }): HackathonDefinition {
  const now = input.now ?? new Date(); const authoritative = requireFreshAuthoritativeEvidence(input.evidence, now);
  if (new Date(input.deadline) <= now || input.teamSize.minimum < 1 || input.teamSize.maximum < input.teamSize.minimum || !input.judgingCriteria.length || !input.deliverables.length) throw new Error('hackathon rules are incomplete or expired');
  const evidenceIds = new Set(authoritative.map((item) => item.id));
  if (input.sponsorTracks.some((track) => !track.evidenceIds.length || track.evidenceIds.some((id) => !evidenceIds.has(id)))) throw new Error('sponsor requirement lacks current official evidence');
  const earliestExpiry = Math.min(...authoritative.map((item) => new Date(item.expiresAt).getTime()), new Date(input.deadline).getTime());
  return { schema: 'xroga.hackathon-definition', schemaVersion: '1.0.0', migrationPath: ['1.0.0 initial authoritative hackathon rule schema'], title: input.title, organizer: input.organizer, deadline: input.deadline, teamSize: input.teamSize, judgingCriteria: [...new Set(input.judgingCriteria)], sponsorTracks: structuredClone(input.sponsorTracks), deliverables: [...new Set(input.deliverables)], prohibitedActions: [...new Set(input.prohibitedActions)], officialEvidenceIds: [...evidenceIds], extractedAt: now.toISOString(), expiresAt: new Date(earliestExpiry).toISOString() };
}

export interface CandidateArchitecture { id: string; title: string; capabilities: string[]; sponsorTrackIds: string[]; scores: { userImpact: number; technicalFeasibility: number; sponsorFit: number; demonstrability: number; originality: number; buildTime: number; integrationDepth: number; securityComplexity: number; evidenceAvailability: number; postHackathonPotential: number }; externalBlockers: string[]; }
export function rankHackathonCandidates(candidates: CandidateArchitecture[]): Array<CandidateArchitecture & { total: number }> {
  if (candidates.length < 2) throw new Error('hackathon selection requires multiple candidate architectures');
  const bounded = (value: number) => { if (!Number.isFinite(value) || value < 0 || value > 10) throw new Error('candidate score must be between 0 and 10'); return value; };
  return candidates.map((candidate) => {
    const s = candidate.scores; Object.values(s).forEach(bounded);
    // Sponsor count is deliberately not a scoring input. Fit and meaningful depth are.
    const total = s.userImpact * 1.5 + s.technicalFeasibility * 1.5 + s.sponsorFit + s.demonstrability * 1.5 + s.originality + s.buildTime + s.integrationDepth + s.evidenceAvailability + s.postHackathonPotential - s.securityComplexity - candidate.externalBlockers.length * 2;
    return { ...candidate, total };
  }).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

export type HackathonPriority = 'must_work_for_submission' | 'important_for_judging' | 'stretch_goal' | 'post_hackathon';
export interface HackathonTask { id: string; objective: string; priority: HackathonPriority; dependencies: string[]; securityCritical: boolean; evidence: string[]; }
export function buildTimeboxedHackathonPlan(input: { criticalJourney: string; sponsorWorkflow: string; resetWorkflow: string; additionalFeatures: string[] }): HackathonTask[] {
  const tasks: HackathonTask[] = [
    { id: 'critical-journey', objective: input.criticalJourney, priority: 'must_work_for_submission', dependencies: [], securityCritical: true, evidence: ['executable journey result'] },
    { id: 'sponsor-integration', objective: input.sponsorWorkflow, priority: 'important_for_judging', dependencies: ['critical-journey'], securityCritical: true, evidence: ['requirement-to-evidence mapping'] },
    { id: 'demo-reset', objective: input.resetWorkflow, priority: 'must_work_for_submission', dependencies: ['critical-journey'], securityCritical: true, evidence: ['repeatable reset digest'] },
  ];
  input.additionalFeatures.forEach((objective, index) => tasks.push({ id: `additional-${index + 1}`, objective, priority: index < 2 ? 'stretch_goal' : 'post_hackathon', dependencies: ['critical-journey'], securityCritical: false, evidence: ['validated feature result'] }));
  return tasks;
}

export interface SponsorRequirement { id: string; trackId: string; statement: string; requiredCapability: string; officialEvidenceId: string; required: boolean; }
export interface SponsorEvidence { requirementId: string; implementationEvidenceIds: string[]; validationEvidenceIds: string[]; status: 'satisfied' | 'external_validation_pending' | 'blocked'; blocker?: string; }
export function evaluateSponsorRequirements(requirements: SponsorRequirement[], evidence: SponsorEvidence[]): { complete: boolean; rows: Array<SponsorRequirement & SponsorEvidence> } {
  const byId = new Map(evidence.map((item) => [item.requirementId, item]));
  const rows = requirements.map((requirement) => {
    if (!requirement.officialEvidenceId) throw new Error('sponsor requirement lacks official source evidence');
    const actual = byId.get(requirement.id) ?? { requirementId: requirement.id, implementationEvidenceIds: [], validationEvidenceIds: [], status: 'blocked' as const, blocker: 'No implementation evidence' };
    if (actual.status === 'satisfied' && (!actual.implementationEvidenceIds.length || !actual.validationEvidenceIds.length)) throw new Error('sponsor requirement cannot be satisfied without implementation and validation evidence');
    return { ...requirement, ...actual };
  });
  return { complete: rows.every((row) => !row.required || row.status === 'satisfied'), rows };
}

export interface GoldenDemoStep { id: string; execute(): Promise<{ evidenceId: string; stateDigest: string }>; }
export async function runGoldenDemo(input: { reset(): Promise<{ evidenceId: string; stateDigest: string }>; steps: GoldenDemoStep[]; expectedFinalDigest: string }): Promise<{ resetEvidenceId: string; stepEvidenceIds: string[]; repeatable: true; finalDigest: string }> {
  if (!input.steps.length) throw new Error('golden demo requires executable steps');
  const firstReset = await input.reset(); const first: string[] = []; let finalDigest = firstReset.stateDigest;
  for (const step of input.steps) { const result = await step.execute(); if (!result.evidenceId || !result.stateDigest) throw new Error(`golden demo step ${step.id} returned no evidence`); first.push(result.evidenceId); finalDigest = result.stateDigest; }
  if (finalDigest !== input.expectedFinalDigest) throw new Error('golden demo did not reach expected product state');
  const secondReset = await input.reset(); if (secondReset.stateDigest !== firstReset.stateDigest) throw new Error('golden demo reset is not deterministic');
  const second: string[] = []; let secondDigest = secondReset.stateDigest;
  for (const step of input.steps) { const result = await step.execute(); second.push(result.evidenceId); secondDigest = result.stateDigest; }
  if (secondDigest !== finalDigest || second.length !== first.length) throw new Error('golden demo replay is not repeatable');
  return { resetEvidenceId: firstReset.evidenceId, stepEvidenceIds: first, repeatable: true, finalDigest };
}

export interface SubmissionPackage {
  schema: 'xroga.hackathon-submission'; schemaVersion: '1.0.0'; migrationPath: string[];
  title: string; oneSentenceDescription: string; problem: string; targetUsers: string[]; solution: string; blockchainJustification: string;
  architecture: string[]; chainNetworks: string[]; sponsorIntegrations: string[]; repository: string; branch: string; commit: string;
  liveUrl: string | null; testnetAddresses: string[]; explorerLinks: string[]; transactionLinks: string[];
  demoInstructions: string[]; resetCommand: string; environmentTemplate: string[]; localSetup: string[]; testCommands: string[]; buildCommands: string[]; deploymentCommands: string[];
  securityNotes: string[]; knownLimitations: string[]; judgingCriteriaMap: Record<string, string[]>; bountyMatrixEvidenceId: string; demoEvidenceId: string; videoOutline: string[]; submissionStatus: 'action_required';
}
export function validateSubmissionPackage(value: SubmissionPackage): void {
  if (!/^[a-f0-9]{40}$/i.test(value.commit) || !value.repository || !value.branch || !value.resetCommand || !value.testCommands.length || !value.buildCommands.length || !value.bountyMatrixEvidenceId || !value.demoEvidenceId) throw new Error('submission package lacks reproducible repository, build, demo or evidence details');
  const urls = [value.liveUrl, ...value.explorerLinks, ...value.transactionLinks].filter(Boolean) as string[];
  if (urls.some((url) => !/^https:\/\//.test(url) || /example\.(?:com|org)|placeholder|todo/i.test(url))) throw new Error('submission package contains a placeholder or invalid evidence URL');
  if ([...value.testnetAddresses, ...value.explorerLinks, ...value.transactionLinks].some((item) => /placeholder|0x0{8,}|fake/i.test(item))) throw new Error('submission package contains fabricated chain evidence');
  if (value.environmentTemplate.some((entry) => /=.+/.test(entry))) throw new Error('submission environment template must not contain secrets or values');
}

export function evidenceDigest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
