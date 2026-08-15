/**
 * The real repository tools, bound to Black Hole's two controls.
 *
 * `repositoryTools.ts` is the existing hardened surface: it owns path validation, blob limits,
 * refusal taxonomy and the mutation staging rules. None of that is reimplemented here. What
 * this module adds is the pair of controls §20/§21 require, applied to those tools:
 *
 *   - **exposure** — which tools a model is even told about, decided from the task
 *   - **authorization** — what may actually run, decided from the request's granted authority
 *
 * ## Why the split matters for these tools in particular
 *
 * `write_file`, `apply_patch` and `propose_delete` mutate a customer's repository. A research
 * request routed to a research-only model must not be able to reach them, and — more subtly —
 * neither must an *engineering* request that was never granted write authority, such as "explain
 * how this repository is structured". Exposure alone would not stop the second case, because a
 * model that has seen these tool names in one conversation can name them in another.
 *
 * ## The verifier delegates rather than duplicating
 *
 * Each `authorize` calls `validateRepositoryPath`, the same function the tool itself uses. A
 * second path check written here would be the one that misses a case — the Windows separator
 * normalisation and the NUL-byte check in particular were added to that function for reasons
 * that are not obvious from the outside.
 */

import {
  RepositoryToolError,
  validateRepositoryPath,
  type RepositoryToolName,
} from '../repositoryTools.js';
import type { ToolDefinition, ToolDomain } from './toolRegistry.js';
import type { BlackHoleAuthority } from './registry.js';

/** Read-only inspection. Safe for any request that may look at a repository at all. */
const READ_TOOLS: readonly RepositoryToolName[] = [
  'list_tree',
  'search_code',
  'search_symbol',
  'read_file',
  'read_file_range',
  'read_imports',
  'read_git_diff',
  'read_test_failure',
  'inspect_blob_sha',
  'inspect_resulting_diff',
];

/** Tools that change a customer's repository. */
const MUTATION_TOOLS: readonly RepositoryToolName[] = [
  'write_file',
  'apply_patch',
  'propose_delete',
];

/** Tools whose first argument is a repository path and must therefore be validated. */
const PATH_ARGUMENT_TOOLS = new Set<RepositoryToolName>([
  'read_file',
  'read_file_range',
  'read_imports',
  'write_file',
  'apply_patch',
  'propose_delete',
  'inspect_blob_sha',
]);

const DESCRIPTIONS: Record<RepositoryToolName, string> = {
  list_tree: 'List repository entries under a directory.',
  search_code: 'Search repository contents for a pattern.',
  search_symbol: 'Find where a symbol is defined or used.',
  read_file: 'Read one repository file.',
  read_file_range: 'Read a line range from one repository file.',
  read_imports: 'Read the imports of one repository file.',
  read_git_diff: 'Read the diff for the current change.',
  read_test_failure: 'Read the output of a failing test.',
  inspect_blob_sha: 'Inspect a blob by content hash.',
  inspect_resulting_diff: 'Inspect the diff a staged change would produce.',
  write_file: 'Write the full contents of one repository file.',
  apply_patch: 'Apply a search/replace patch to one repository file.',
  propose_delete: 'Propose deleting one repository file.',
};

function authorityFor(tool: RepositoryToolName): (keyof BlackHoleAuthority)[] {
  return MUTATION_TOOLS.includes(tool) ? ['writeProjectFiles', 'mutateRepository'] : [];
}

function domainFor(tool: RepositoryToolName): ToolDomain {
  return MUTATION_TOOLS.includes(tool) ? 'repository' : 'files';
}

/**
 * Builds the Black Hole tool definition for one repository tool.
 *
 * `execute` is supplied by the caller because the real implementations need a repository
 * transport, a scope and a run context that this module has no business holding. Keeping
 * execution injectable is also what lets the authorization rules be tested without a
 * repository — the interesting failures here are refusals, and a refusal never reaches
 * `execute` at all.
 */
export function repositoryToolDefinition(
  tool: RepositoryToolName,
  execute: ToolDefinition<never>['execute'],
): ToolDefinition<never> {
  return {
    name: tool,
    domain: domainFor(tool),
    description: DESCRIPTIONS[tool],
    schema: PATH_ARGUMENT_TOOLS.has(tool)
      ? { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
      : { type: 'object', properties: {} },
    requiredAuthority: authorityFor(tool),
    requiredPermissions: MUTATION_TOOLS.includes(tool) ? ['project:write'] : undefined,
    authorize: (context, args) => {
      if (!context.projectId) {
        return { allowed: false, reason: 'no project is in scope for this request' };
      }
      if (!PATH_ARGUMENT_TOOLS.has(tool)) return { allowed: true };
      try {
        // The same validator the tool itself uses: one implementation of the path rules.
        validateRepositoryPath(tool, (args as { path?: unknown })?.path);
        return { allowed: true };
      } catch (error) {
        return {
          allowed: false,
          reason:
            error instanceof RepositoryToolError
              ? error.message
              : 'the path argument failed validation',
        };
      }
    },
    execute,
  };
}

/**
 * Every repository tool, bound.
 *
 * `executeFor` receives the tool name so a caller can dispatch to the real implementation it
 * already has, rather than this module needing to know about any of them.
 */
export function repositoryToolDefinitions(
  executeFor: (tool: RepositoryToolName) => ToolDefinition<never>['execute'],
): ToolDefinition<never>[] {
  return [...READ_TOOLS, ...MUTATION_TOOLS].map((tool) =>
    repositoryToolDefinition(tool, executeFor(tool)),
  );
}

export { READ_TOOLS, MUTATION_TOOLS };
