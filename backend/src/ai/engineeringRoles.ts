/**
 * Engineering roles and the tools each may hold.
 *
 * Command 3 §11A requires every engineering task to carry an explicit role, and every role
 * to declare what it is responsible for, what tools it receives, and what tools it may
 * never receive. §29A and §29D turn that into enforceable invariants — most importantly
 * that a research role cannot reach a repository mutation tool.
 *
 * Why a table rather than checks at each call site: the dangerous case is a role that
 * acquires a capability by omission. A tool added to the system without being assigned to
 * any role is unreachable here, and a role added without a tool list fails to compile.
 * Both failures point the safe direction.
 *
 * The research boundary is the one with a live precedent. Provider isolation
 * (`providerPolicy.ts`) stops a research *model* being selected for coding; this stops a
 * research *role* holding a write tool even if some future path selected a coding model to
 * perform it. They are independent controls over the same risk, deliberately.
 */

/** Repository tools, per §16. Mutating members are named separately below. */
export const READ_TOOLS = [
  'get_repository_metadata',
  'resolve_exact_head',
  'list_tree',
  'read_file',
  'read_file_range',
  'search_code',
  'search_symbol',
  'read_imports',
  'read_manifest',
  'read_configuration',
  'read_tests',
  'read_git_diff',
  'read_git_history',
] as const;

/**
 * Tools that change a repository or publish.
 *
 * Kept as one list because the security property is about the whole set: a role either may
 * change the repository or it may not. Splitting it invites a role that holds "only"
 * `delete_file`.
 */
export const MUTATION_TOOLS = [
  'write_file',
  'apply_patch',
  'delete_file',
  'rename_file',
  'restore_file',
  'create_checkpoint',
  'commit_verified_changes',
  'open_pull_request',
] as const;

export const VALIDATION_TOOLS = ['run_validation'] as const;
export const RESEARCH_TOOLS = ['web_search', 'fetch_source', 'x_search'] as const;

export type ReadTool = (typeof READ_TOOLS)[number];
export type MutationTool = (typeof MUTATION_TOOLS)[number];
export type ValidationTool = (typeof VALIDATION_TOOLS)[number];
export type ResearchTool = (typeof RESEARCH_TOOLS)[number];
export type EngineeringTool = ReadTool | MutationTool | ValidationTool | ResearchTool;

const MUTATION_SET = new Set<string>(MUTATION_TOOLS);
const RESEARCH_SET = new Set<string>(RESEARCH_TOOLS);

export function isMutationTool(tool: string): tool is MutationTool {
  return MUTATION_SET.has(tool);
}

export function isResearchTool(tool: string): tool is ResearchTool {
  return RESEARCH_SET.has(tool);
}

/** Which provider category a role's model must come from. `none` means no model at all. */
export type RoleProviderCategory = 'coding' | 'research' | 'none';

export interface EngineeringRole {
  readonly id: string;
  readonly responsibility: string;
  readonly providerCategory: RoleProviderCategory;
  readonly allowedTools: readonly EngineeringTool[];
  /** Evidence a task in this role must produce before it may complete. */
  readonly completionEvidence: readonly string[];
  /** True when executable validation, not model output, decides the outcome. */
  readonly deterministic?: boolean;
}

function role(definition: EngineeringRole): EngineeringRole {
  return definition;
}

/**
 * The fifteen roles of §11A.
 *
 * Read tools are granted broadly; mutation tools are granted to four roles — implementation,
 * test generation, repair and the publishing controller — and each for a different reason.
 * The publisher's grant is deliberately narrow: it may commit and open a pull request but
 * cannot author files, so it cannot introduce content that never passed validation.
 * Everything else reads, validates, or researches.
 */
export const ENGINEERING_ROLES = {
  request_normalizer: role({
    id: 'request_normalizer',
    responsibility: 'Extract explicit and inferred requirements, constraints and integrations',
    providerCategory: 'coding',
    allowedTools: [],
    completionEvidence: ['normalized_outcome'],
  }),

  product_specification: role({
    id: 'product_specification',
    responsibility: 'Convert a normalized outcome into a complete ProductSpec',
    providerCategory: 'coding',
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['product_spec'],
  }),

  repository_analyst: role({
    id: 'repository_analyst',
    responsibility: 'Inspect exact HEAD: languages, frameworks, manifests, tests, schemas',
    providerCategory: 'coding',
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['repository_analysis'],
  }),

  architecture: role({
    id: 'architecture',
    responsibility: 'Propose architecture, frameworks, runtime adapters and risks',
    providerCategory: 'coding',
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['architecture_plan'],
  }),

  task_planner: role({
    id: 'task_planner',
    responsibility: 'Convert an approved spec and plan into bounded engineering tasks',
    providerCategory: 'coding',
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['task_graph'],
  }),

  implementation: role({
    id: 'implementation',
    responsibility: 'Implement one bounded task or coherent file group',
    providerCategory: 'coding',
    allowedTools: [...READ_TOOLS, 'write_file', 'apply_patch', 'delete_file', 'rename_file', 'create_checkpoint'],
    completionEvidence: ['file_mutation', 'validation_result'],
  }),

  test_generation: role({
    id: 'test_generation',
    responsibility: 'Generate unit, integration, acceptance and authorization tests',
    providerCategory: 'coding',
    allowedTools: [...READ_TOOLS, 'write_file', 'apply_patch'],
    completionEvidence: ['generated_tests'],
  }),

  validation_runtime: role({
    id: 'validation_runtime',
    responsibility: 'Run executable validation in the isolated sandbox',
    providerCategory: 'none',
    allowedTools: [...READ_TOOLS, ...VALIDATION_TOOLS],
    completionEvidence: ['validation_result'],
    // §19: executable verification outranks model confidence. No model participates.
    deterministic: true,
  }),

  repair: role({
    id: 'repair',
    responsibility: 'Read an exact validation failure and apply a bounded repair',
    providerCategory: 'coding',
    // §9 lists "rerun failed validation" as a repair responsibility, so this role holds the
    // validation tool. Running validation is deterministic and grants no new mutation
    // authority — a repair that cannot re-check its own fix would have to declare success
    // on belief, which is the failure the validation runtime exists to prevent.
    allowedTools: [...READ_TOOLS, ...VALIDATION_TOOLS, 'write_file', 'apply_patch', 'create_checkpoint'],
    completionEvidence: ['repair_diff', 'validation_result'],
  }),

  independent_review: role({
    id: 'independent_review',
    responsibility: 'Review the complete diff against spec, plan and acceptance criteria',
    providerCategory: 'coding',
    // Reads the diff; never edits it. A reviewer that can rewrite the code it reviews is
    // not independent of it.
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['review_findings'],
  }),

  security_review: role({
    id: 'security_review',
    responsibility: 'Review authentication, authorization, secrets, injection and data boundaries',
    providerCategory: 'coding',
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['security_findings'],
  }),

  research: role({
    id: 'research',
    responsibility: 'Retrieve current external facts with sources; never generate code',
    providerCategory: 'research',
    // §12: no repository access at all, read or write. Research output is untrusted
    // external input, and a role that can read the repository can leak it into a prompt
    // that an external service sees.
    allowedTools: [...RESEARCH_TOOLS],
    completionEvidence: ['research_sources'],
  }),

  github_publishing: role({
    id: 'github_publishing',
    responsibility: 'Publish a verified mutation set through the Command 1 atomic writer',
    // §13: a model may prepare prose; deterministic tools perform the mutation.
    providerCategory: 'none',
    allowedTools: [...READ_TOOLS, 'commit_verified_changes', 'open_pull_request'],
    completionEvidence: ['resulting_commit_sha'],
    deterministic: true,
  }),

  deployment: role({
    id: 'deployment',
    responsibility: 'Deploy an exact verified commit SHA and verify deployed behaviour',
    providerCategory: 'none',
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['deployment_identity'],
    deterministic: true,
  }),

  completion: role({
    id: 'completion',
    responsibility: 'Confirm required evidence exists and produce a truthful final result',
    providerCategory: 'none',
    allowedTools: [...READ_TOOLS],
    completionEvidence: ['completion_report'],
    deterministic: true,
  }),
} as const satisfies Record<string, EngineeringRole>;

export type EngineeringRoleId = keyof typeof ENGINEERING_ROLES;

export function isEngineeringRole(value: string): value is EngineeringRoleId {
  return Object.prototype.hasOwnProperty.call(ENGINEERING_ROLES, value);
}

/**
 * Maps an `operationType` from the task graph to its role.
 *
 * Unmapped classes return null rather than a default. §29A requires every engineering task
 * to have an *explicit* role; inventing one for an unrecognised class is how a task would
 * acquire tools nobody assigned it.
 */
const TASK_CLASS_ROLES: Record<string, EngineeringRoleId> = {
  request_understanding: 'request_normalizer',
  product_specification: 'product_specification',
  repository_analysis: 'repository_analyst',
  architecture: 'architecture',
  task_planning: 'task_planner',
  implementation: 'implementation',
  multi_file_implementation: 'implementation',
  focused_code_edit: 'implementation',
  test_generation: 'test_generation',
  validation: 'validation_runtime',
  validation_repair: 'repair',
  debugging: 'repair',
  code_review: 'independent_review',
  security_review: 'security_review',
  research: 'research',
  web_research: 'research',
  x_research: 'research',
  github_publishing: 'github_publishing',
  deployment: 'deployment',
  completion: 'completion',
};

export function roleForTaskClass(taskClass: string): EngineeringRoleId | null {
  return TASK_CLASS_ROLES[taskClass] ?? null;
}

export class RolePermissionError extends Error {
  readonly code = 'ROLE_PERMISSION_DENIED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'RolePermissionError';
  }
}

export function toolsForRole(roleId: EngineeringRoleId): readonly EngineeringTool[] {
  return ENGINEERING_ROLES[roleId].allowedTools;
}

export function roleMayUseTool(roleId: EngineeringRoleId, tool: string): boolean {
  return (ENGINEERING_ROLES[roleId].allowedTools as readonly string[]).includes(tool);
}

/**
 * Refuses a tool the role does not hold.
 *
 * Throws rather than filters: a silently dropped tool call looks like a model choosing not
 * to act, and the run would continue with no record that a boundary was reached.
 */
export function assertToolAllowed(roleId: EngineeringRoleId, tool: string): void {
  if (!roleMayUseTool(roleId, tool)) {
    throw new RolePermissionError(
      `Role "${roleId}" may not use "${tool}". ` +
        `Permitted: ${ENGINEERING_ROLES[roleId].allowedTools.join(', ') || 'no tools'}.`,
    );
  }
}
