/**
 * The five engineering roles, with explicit contracts.
 *
 * Deliberately five, not fifty. A large autonomous roster is expensive to run, hard to reason
 * about when it misbehaves, and — the part that actually matters here — creates competing
 * claims about what state a run is in. `ExecutionScheduler` remains the single authority over
 * task state and completion; these roles are *capabilities the scheduler invokes*, never
 * independent agents that decide anything about the run's lifecycle.
 *
 * ## What a contract is for
 *
 * Every role declares its inputs, its permitted tools, the shape it must return, when it is
 * done, and what bounds it. Those are not documentation. `maxIterations` and `maxToolCalls`
 * are what stop a role looping; `allowedTools` is what stops a reviewer writing files; and the
 * output schema is what lets the scheduler tell a finished role from a confused one without
 * asking the model whether it is finished.
 *
 * ## Evaluator/implementer separation
 *
 * The reviewer and verifier never hold write authority, and the implementer and repairer never
 * decide whether their own work passed. A component that both produces work and grades it will
 * eventually grade generously, and no amount of prompting fixes that — it is a structural
 * problem and needs a structural answer.
 */

import type { BlackHoleAuthority } from './registry.js';
import type { ToolDomain } from './toolRegistry.js';

export type AgentRoleId = 'planner' | 'implementer' | 'repairer' | 'reviewer' | 'verifier';

/** Severity vocabulary for review findings. Three levels, because more are not acted on. */
export type ReviewSeverity = 'blocker' | 'recommendation' | 'informational';

export const REVIEW_SEVERITIES: readonly ReviewSeverity[] = [
  'blocker',
  'recommendation',
  'informational',
];

export interface AgentRoleContract {
  readonly id: AgentRoleId;
  /** One sentence. What this role is for, and nothing it is not for. */
  readonly mission: string;
  /** Inputs the scheduler must supply. A role invoked without these is a programming error. */
  readonly requiredInputs: readonly string[];
  readonly allowedToolDomains: readonly ToolDomain[];
  /** Authority the role may hold. Empty means it may read and reason but never act. */
  readonly authority: readonly (keyof BlackHoleAuthority)[];
  /** Keys the structured output must contain. */
  readonly outputSchema: readonly string[];
  readonly completionCriteria: string;
  readonly maxIterations: number;
  readonly maxToolCalls: number;
  /** The task class this role routes as, so it reuses the canonical router. */
  readonly taskClass: string;
  /** Deterministic evidence this role must produce or consume. */
  readonly evidenceRequirement: string;
}

export const AGENT_ROLES: Readonly<Record<AgentRoleId, AgentRoleContract>> = {
  planner: {
    id: 'planner',
    mission: 'Turn a request into an ordered, checkable plan. Writes nothing.',
    requiredInputs: ['request', 'repositoryContext'],
    allowedToolDomains: ['files', 'repository', 'research'],
    // Reads and reasons. A planner that could write would start implementing, and the plan
    // would stop being reviewable before anything happened.
    authority: [],
    outputSchema: ['steps', 'acceptanceCriteria', 'risks'],
    completionCriteria: 'Every step has an acceptance criterion a machine can check.',
    maxIterations: 2,
    maxToolCalls: 12,
    taskClass: 'architecture',
    evidenceRequirement: 'Acceptance criteria must be executable checks, not prose intentions.',
  },

  implementer: {
    id: 'implementer',
    mission: 'Produce the code the plan calls for. Does not judge whether it worked.',
    requiredInputs: ['plan', 'repositoryContext'],
    allowedToolDomains: ['files', 'repository', 'build', 'tests', 'sandbox'],
    authority: ['writeProjectFiles', 'mutateRepository'],
    outputSchema: ['files', 'summary'],
    completionCriteria: 'Every planned file exists and is complete. A truncated file is a failure.',
    maxIterations: 3,
    maxToolCalls: 60,
    taskClass: 'repository_coding',
    evidenceRequirement: 'File manifest with contents written; no self-assessment of correctness.',
  },

  repairer: {
    id: 'repairer',
    mission: 'Make the smallest change that resolves the specific evidence given.',
    // Evidence is required, not optional. A repairer invoked without concrete failure output
    // has nothing to minimise against and will rewrite whatever looks suspect.
    requiredInputs: ['failureEvidence', 'scope', 'affectedFiles'],
    allowedToolDomains: ['files', 'repository', 'build', 'tests', 'sandbox'],
    authority: ['writeProjectFiles', 'mutateRepository'],
    outputSchema: ['files', 'changeRationale'],
    completionCriteria:
      'The cited failure is addressed and nothing outside the declared scope is modified.',
    maxIterations: 3,
    maxToolCalls: 40,
    taskClass: 'debugging',
    evidenceRequirement:
      'Must receive verbatim validator or browser output. Must not perform unrelated refactoring.',
  },

  reviewer: {
    id: 'reviewer',
    mission: 'Judge a completed diff on correctness, security, maintainability, performance and testing.',
    requiredInputs: ['diff', 'plan'],
    allowedToolDomains: ['files', 'repository', 'tests'],
    // No write authority, ever. A reviewer that can edit is an implementer with a second
    // opinion about its own work.
    authority: [],
    outputSchema: ['findings', 'approved'],
    completionCriteria: 'Every finding carries a severity and a file reference.',
    maxIterations: 1,
    maxToolCalls: 20,
    taskClass: 'security_review',
    evidenceRequirement:
      'Findings cite a file and line. Zero findings is a valid review; none are invented to fill a quota.',
  },

  verifier: {
    id: 'verifier',
    mission: 'Collect deterministic evidence and report what it shows. Decides nothing subjectively.',
    requiredInputs: ['builtArtifact', 'acceptanceCriteria'],
    allowedToolDomains: ['build', 'tests', 'sandbox', 'browser'],
    authority: [],
    outputSchema: ['verdict', 'evidence', 'findings'],
    completionCriteria: 'Every acceptance criterion has been executed and its result recorded.',
    maxIterations: 2,
    maxToolCalls: 30,
    taskClass: 'debugging',
    evidenceRequirement:
      'Observations only. No grades, no quotas, no requirement that a first attempt fail. ' +
      'If the evidence shows zero problems, it reports zero problems.',
  },
};

/** Roles permitted to change a customer's repository. */
export const WRITING_ROLES: readonly AgentRoleId[] = ['implementer', 'repairer'];

/** Roles that judge work. Disjoint from `WRITING_ROLES`, and a test holds that. */
export const EVALUATING_ROLES: readonly AgentRoleId[] = ['reviewer', 'verifier'];

export function agentRole(id: AgentRoleId): AgentRoleContract {
  return AGENT_ROLES[id];
}

/**
 * Whether a role may act on an authority.
 *
 * Reads the contract, never the caller's intent. A reviewer asked to write is refused here
 * regardless of how the request was phrased upstream.
 */
export function roleMayPerform(id: AgentRoleId, authority: keyof BlackHoleAuthority): boolean {
  return AGENT_ROLES[id].authority.includes(authority);
}

/**
 * Whether the same model may serve both roles in one run.
 *
 * Evaluator/implementer separation, enforced structurally: the model that wrote the code does
 * not get to say whether the code is acceptable. Applies only between a writing role and an
 * evaluating one — two writing roles sharing a model is ordinary, and two evaluators sharing
 * one is unavoidable when only one suitable model is configured.
 */
export function mayShareModel(a: AgentRoleId, b: AgentRoleId): boolean {
  const writesA = WRITING_ROLES.includes(a);
  const writesB = WRITING_ROLES.includes(b);
  const evaluatesA = EVALUATING_ROLES.includes(a);
  const evaluatesB = EVALUATING_ROLES.includes(b);
  if (writesA && evaluatesB) return false;
  if (evaluatesA && writesB) return false;
  return true;
}

export interface ReviewFinding {
  readonly severity: ReviewSeverity;
  readonly file: string;
  readonly line?: number;
  readonly summary: string;
  readonly category: 'correctness' | 'security' | 'maintainability' | 'performance' | 'testing';
}

/**
 * Whether a review approves the change.
 *
 * Only blockers block. Recommendations and informational findings are recorded and do not stop
 * a run — a review process that halts on style produces a team that stops reading reviews.
 */
export function reviewApproved(findings: readonly ReviewFinding[]): boolean {
  return !findings.some((finding) => finding.severity === 'blocker');
}
