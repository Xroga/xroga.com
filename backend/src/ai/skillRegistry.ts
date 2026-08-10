/**
 * Versioned engineering skills.
 *
 * §20 asks for reusable skills that are not "everything in one giant system prompt". The
 * distinction matters for a reason the phrasing understates: a single prompt has no unit of
 * change. Edit it to improve repair behaviour and you have silently altered architecture
 * selection too, with nothing recording that you did and no way to evaluate the two
 * independently. Skills exist so a change has a name, a version and a blast radius.
 *
 * Hence the central rule here — **changing a skill's procedure must change its version**,
 * and a version change invalidates that skill's benchmark evidence. §20 requires a skill
 * edit to trigger relevant regression evaluations, and evidence that survives an edit is
 * worse than no evidence: it attributes yesterday's results to today's behaviour.
 *
 * `contentVersion` is derived from the skill's own text rather than declared, because a
 * declared version is a promise someone has to remember to keep. A hash cannot be forgotten.
 */

import { createHash } from 'node:crypto';
import type { EngineeringRoleId, EngineeringTool } from './engineeringRoles.js';

export interface SkillDefinition {
  readonly id: string;
  /** Semantic version an author controls, for communicating intent. */
  readonly version: string;
  /** Roles permitted to use this skill. A skill is not universally available. */
  readonly roles: readonly EngineeringRoleId[];
  /** When this skill applies. Deliberately prose — it is read by a model, not matched. */
  readonly applicability: string;
  readonly requiredTools: readonly EngineeringTool[];
  readonly requiredContext: readonly string[];
  /** The steps. Changing this changes `contentVersion` and invalidates evidence. */
  readonly procedure: readonly string[];
  /** How the skill's own output is checked. */
  readonly validation: readonly string[];
  /** What to do when validation fails. */
  readonly recovery: readonly string[];
  /** Runtime adapters this skill is known to work with. Empty means language-agnostic. */
  readonly supportedRuntimeAdapters: readonly string[];
}

export interface VersionedSkill extends SkillDefinition {
  /**
   * Hash of the behavioural content.
   *
   * Covers procedure, validation, recovery and required tools — everything that changes
   * what the skill does. It deliberately excludes `applicability`, which describes when to
   * reach for the skill rather than what it does, so clarifying a description does not
   * discard benchmark results that are still valid.
   */
  readonly contentVersion: string;
}

function contentVersionOf(skill: SkillDefinition): string {
  const behavioural = {
    procedure: skill.procedure,
    validation: skill.validation,
    recovery: skill.recovery,
    requiredTools: [...skill.requiredTools].sort(),
  };
  return createHash('sha256').update(JSON.stringify(behavioural)).digest('hex').slice(0, 16);
}

export function defineSkill(definition: SkillDefinition): VersionedSkill {
  return { ...definition, contentVersion: contentVersionOf(definition) };
}

/**
 * The initial skill set.
 *
 * Small on purpose. A skill earns its place by being reached for repeatedly; inventing
 * twenty up front would produce a catalog nothing selects from, which is the "unused code
 * described as capability" the deliverables section forbids.
 */
export const SKILLS: readonly VersionedSkill[] = [
  defineSkill({
    id: 'repository_exploration',
    version: '1.0.0',
    roles: ['repository_analyst', 'architecture', 'task_planner'],
    applicability: 'Understanding an existing repository before proposing or changing anything.',
    requiredTools: ['resolve_exact_head', 'list_tree', 'read_manifest', 'search_symbol', 'read_file'],
    requiredContext: ['repository identity', 'exact HEAD'],
    procedure: [
      'Resolve exact HEAD before reading anything; never read against a branch name.',
      'Read the manifest first — it names the language, framework and scripts.',
      'List the tree before reading files, so selection is informed rather than guessed.',
      'Search for the symbols the task names, rather than reading whole directories.',
      'Record every file actually served; never describe a file that was not read.',
    ],
    validation: ['Every claimed file appears in the served-reference log.'],
    recovery: ['If the index is stale against HEAD, re-index rather than answering from it.'],
    supportedRuntimeAdapters: [],
  }),

  defineSkill({
    id: 'safe_file_creation',
    version: '1.0.0',
    roles: ['implementation', 'test_generation'],
    applicability: 'Creating a new file in a repository that does not yet contain it.',
    requiredTools: ['list_tree', 'read_manifest', 'write_file'],
    requiredContext: ['architecture plan', 'file path', 'sibling file list'],
    procedure: [
      'Confirm the path does not already exist; a create that overwrites is an update.',
      'Match the conventions of sibling files rather than importing a house style.',
      'Write the complete file. No placeholders, no TODO stubs.',
      'Return the file alone, with no commentary, so the content is the artifact.',
    ],
    validation: ['The file parses under the runtime adapter for its language.'],
    recovery: ['On a truncated reply, retry with a different model rather than committing a partial file.'],
    supportedRuntimeAdapters: [],
  }),

  defineSkill({
    id: 'test_driven_repair',
    version: '1.0.0',
    roles: ['repair'],
    applicability: 'A validation command failed and the exact output is available.',
    requiredTools: ['read_file', 'read_file_range', 'apply_patch', 'run_validation'],
    requiredContext: ['failing command', 'exit code', 'bounded output'],
    procedure: [
      'Read the exact failure before forming a hypothesis; do not infer from the task description.',
      'Retrieve only the code the failure names, plus its direct dependencies.',
      'Apply the smallest change that addresses the named cause.',
      'Rerun the same validation command that failed, not a broader one.',
      'Stop at the repair limit and report truthfully rather than trying alternatives indefinitely.',
    ],
    validation: ['The previously failing command now exits zero.'],
    recovery: ['If the same failure recurs after the limit, report it as blocked with the exact output.'],
    supportedRuntimeAdapters: [],
  }),

  defineSkill({
    id: 'pull_request_preparation',
    version: '1.0.0',
    roles: ['github_publishing'],
    applicability: 'A verified mutation set is ready to publish.',
    requiredTools: ['read_git_diff', 'commit_verified_changes', 'open_pull_request'],
    requiredContext: ['starting SHA', 'base branch', 'validation evidence'],
    procedure: [
      'Confirm the exact starting SHA and base branch before writing anything.',
      'Describe what the diff does, not what the request asked for.',
      'State what was validated and what was not, without rounding either up.',
      'Publish through the atomic writer as one mutation set.',
    ],
    validation: ['The resulting commit SHA is read back from the branch.'],
    recovery: ['On a moved branch, replan against the new head rather than forcing the write.'],
    supportedRuntimeAdapters: [],
  }),
];

const BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function skillById(id: string): VersionedSkill | null {
  return BY_ID.get(id) ?? null;
}

/** Skills a role may use. A role reaching for an unlisted skill is a programming error. */
export function skillsForRole(role: EngineeringRoleId): readonly VersionedSkill[] {
  return SKILLS.filter((skill) => skill.roles.includes(role));
}

export interface SkillBenchmarkEvidence {
  readonly skillId: string;
  /** The content version the evidence was measured against. */
  readonly contentVersion: string;
  readonly successRate: number;
  readonly samples: number;
}

/**
 * Whether evidence still describes the skill it names.
 *
 * §20's regression requirement, expressed as a question the routing layer can ask. Evidence
 * recorded against an older `contentVersion` describes behaviour that no longer exists, and
 * treating it as current attributes yesterday's results to today's procedure.
 */
export function evidenceAppliesToCurrentSkill(evidence: SkillBenchmarkEvidence): boolean {
  const skill = skillById(evidence.skillId);
  return skill !== null && skill.contentVersion === evidence.contentVersion;
}

/** Skills whose evidence is stale, so a caller knows what to re-evaluate. */
export function skillsNeedingReevaluation(
  evidence: readonly SkillBenchmarkEvidence[],
): readonly string[] {
  const measured = new Set(evidence.filter(evidenceAppliesToCurrentSkill).map((record) => record.skillId));
  return SKILLS.filter((skill) => !measured.has(skill.id)).map((skill) => skill.id);
}
