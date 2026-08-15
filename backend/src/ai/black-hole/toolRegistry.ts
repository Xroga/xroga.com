/**
 * The Black Hole ∞ tool registry — §20 exposure and §21 authorization.
 *
 * §21's first line is the design constraint: *models are not security boundaries*. A model can
 * be talked into asking for anything — by a user, by a retrieved web page, by its own bad
 * reasoning. So nothing here trusts that a tool call was reasonable because a model made it.
 * Every invocation is re-verified against the request's own context, and the verification is
 * not something a tool can opt out of: `authorize` is a required field, and `invokeTool` is the
 * only way to reach `execute`.
 *
 * ## Exposure is not authorization
 *
 * §20 says do not send every tool schema to every request — that is a context-cost and
 * accuracy measure, and it is *also* the first of two independent controls. `selectTools`
 * decides what a model is told about; `invokeTool` decides what actually runs. A model that
 * names a tool it was never offered is refused, which matters because tool names are guessable
 * and a model that has seen `write_file` in one conversation may ask for it in another.
 *
 * ## Authority comes from the task, not the tool call
 *
 * A tool declaring `requiredAuthority: ['writeProjectFiles']` cannot be invoked by a request
 * whose task analysis never claimed that authority. This is what stops a research request —
 * routed to a research-only model precisely because it may not write — from acquiring write
 * authority by calling a tool that has it.
 */

import type { BlackHoleAuthority } from './registry.js';
import type { TaskAnalysis } from './taskClass.js';

/** §20's tool domains. */
export type ToolDomain =
  | 'files'
  | 'repository'
  | 'github'
  | 'sandbox'
  | 'build'
  | 'tests'
  | 'browser'
  | 'research'
  | 'supabase'
  | 'deployment'
  | 'assets';

export interface ToolInvocationContext {
  readonly userId: string;
  readonly projectId: string | null;
  /** Absolute path every file argument must resolve inside. */
  readonly workspaceRoot: string;
  readonly repositoryFullName?: string | null;
  /** Grants the *user* holds, established upstream. Never inferred from the request. */
  readonly permissions: ReadonlySet<string>;
  /** Authority the task claimed, from `TaskAnalysis.requiredAuthority`. */
  readonly grantedAuthority: ReadonlySet<keyof BlackHoleAuthority>;
  readonly deadlineAt: number;
  readonly maxOutputBytes: number;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
}

export type ToolAuthorization =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

export interface ToolResult {
  readonly output: string;
  readonly truncated: boolean;
}

export interface ToolDefinition<Args = Record<string, unknown>> {
  readonly name: string;
  readonly domain: ToolDomain;
  readonly description: string;
  /** JSON schema shown to the model. Never used for enforcement — `authorize` is. */
  readonly schema: Record<string, unknown>;
  readonly requiredAuthority: readonly (keyof BlackHoleAuthority)[];
  /** Permission strings the user must hold. Checked before `authorize` runs. */
  readonly requiredPermissions?: readonly string[];
  /**
   * The tool's own verification of §21's list.
   *
   * Required rather than optional. An optional verifier is one that gets omitted on the tool
   * written in a hurry, which will be the one with a path argument.
   */
  readonly authorize: (context: ToolInvocationContext, args: Args) => ToolAuthorization;
  readonly execute: (context: ToolInvocationContext, args: Args) => Promise<string>;
}

export class ToolAuthorizationError extends Error {
  readonly code = 'TOOL_NOT_AUTHORIZED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ToolAuthorizationError';
  }
}

// ---------------------------------------------------------------------------
// §21 shared verifiers
// ---------------------------------------------------------------------------

/**
 * Whether a path stays inside the workspace.
 *
 * Purely lexical on a normalized path, and deliberately so: this runs before any filesystem
 * call, so a traversal is refused rather than attempted. It rejects absolute paths, `..`
 * segments after normalization, and NUL bytes.
 */
export function pathWithinWorkspace(workspaceRoot: string, candidate: string): boolean {
  if (!candidate || candidate.includes('\0')) return false;
  if (candidate.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(candidate)) return false;

  const segments: string[] = [];
  for (const segment of candidate.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return false;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 && Boolean(workspaceRoot);
}

/** Whether an outbound URL is safe to fetch: HTTPS, no credentials, no private address. */
export function outboundUrlAllowed(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '::1' || /^(?:fc|fd|fe80):/i.test(host)) return false;
  if (/^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// §20 exposure
// ---------------------------------------------------------------------------

/**
 * Domains worth showing for a task, keyed by class.
 *
 * A research question does not need the deployment schema, and a chat turn needs no tools at
 * all. Every schema sent costs context on every step of an agent loop and gives the model one
 * more thing to reach for wrongly.
 */
const DOMAINS_BY_CLASS: Partial<Record<TaskAnalysis['primary'], readonly ToolDomain[]>> = {
  simple_chat: [],
  rewrite: [],
  summarize: [],
  classification: [],
  extraction: [],
  structured_extraction: [],
  research: ['research', 'browser'],
  analysis: ['files', 'repository', 'research'],
  reasoning: ['files', 'repository'],
  deep_reasoning: ['files', 'repository'],
  vision: ['assets', 'files'],
  multimodal: ['assets', 'files'],
  coding: ['files', 'build', 'tests'],
  repository_coding: ['files', 'repository', 'github', 'sandbox', 'build', 'tests'],
  refactoring: ['files', 'repository', 'build', 'tests'],
  debugging: ['files', 'repository', 'sandbox', 'build', 'tests'],
  architecture: ['files', 'repository', 'research'],
  long_horizon_engineering: ['files', 'repository', 'github', 'sandbox', 'build', 'tests'],
  security_review: ['files', 'repository', 'tests'],
  deployment_debugging: ['deployment', 'build', 'sandbox', 'repository'],
  agentic: ['files', 'repository', 'sandbox', 'build', 'tests', 'research'],
  tool_workflow: ['files', 'repository', 'research'],
};

export interface ToolSelection {
  readonly tools: readonly ToolDefinition<never>[];
  readonly exposedNames: ReadonlySet<string>;
  readonly reason: string;
}

/**
 * Chooses which tools a model is told about.
 *
 * A tool whose required authority the task did not claim is never exposed. That ordering is
 * intentional: the model is not shown a capability it would then be refused for using, which
 * removes a whole category of wasted step where the model tries, fails, and reasons about why.
 */
export function selectTools(
  analysis: TaskAnalysis,
  registry: readonly ToolDefinition<never>[],
): ToolSelection {
  const domains = new Set<ToolDomain>(DOMAINS_BY_CLASS[analysis.primary] ?? ['files', 'repository']);
  if (analysis.requiresResearch) domains.add('research');
  if (analysis.hasImageAttachment) domains.add('assets');

  const granted = new Set(analysis.requiredAuthority);
  const tools = registry.filter((tool) => {
    if (!domains.has(tool.domain)) return false;
    return tool.requiredAuthority.every((authority) => granted.has(authority));
  });

  return {
    tools,
    exposedNames: new Set(tools.map((tool) => tool.name)),
    reason:
      `${tools.length} tool(s) from domain(s) ${[...domains].join(', ') || 'none'} ` +
      `for a ${analysis.primary} task`,
  };
}

// ---------------------------------------------------------------------------
// §21 invocation
// ---------------------------------------------------------------------------

function truncate(output: string, maxBytes: number): ToolResult {
  const encoded = Buffer.from(output, 'utf8');
  if (encoded.byteLength <= maxBytes) return { output, truncated: false };
  return {
    output: `${encoded.subarray(0, maxBytes).toString('utf8')}\n[output truncated at ${maxBytes} bytes]`,
    truncated: true,
  };
}

/**
 * The only way to run a tool.
 *
 * Order matters and is not arbitrary. Exposure, then authority, then permissions, then the
 * tool's own verification, then deadline — each check is cheaper and broader than the next, and
 * every one of them runs before `execute` is reached. The output limit is applied after,
 * because a tool that returns a gigabyte is a denial of service against the context window
 * whether or not it was authorized to run.
 */
export async function invokeTool<Args>(
  selection: ToolSelection,
  registry: readonly ToolDefinition<never>[],
  name: string,
  context: ToolInvocationContext,
  args: Args,
): Promise<ToolResult> {
  if (!selection.exposedNames.has(name)) {
    // Tool names are guessable, and a model that saw `write_file` in one conversation may ask
    // for it in another where it was deliberately withheld.
    throw new ToolAuthorizationError(
      `"${name}" was not exposed for this request. A tool the model was not offered is refused ` +
        'rather than executed, because a tool call is a request, not a permission.',
    );
  }

  const tool = registry.find((entry) => entry.name === name);
  if (!tool) {
    throw new ToolAuthorizationError(`"${name}" is not a registered tool.`);
  }

  for (const authority of tool.requiredAuthority) {
    if (!context.grantedAuthority.has(authority)) {
      throw new ToolAuthorizationError(
        `"${name}" requires ${authority}, which this request never claimed. A request cannot ` +
          'acquire authority by calling a tool that has it.',
      );
    }
  }

  for (const permission of tool.requiredPermissions ?? []) {
    if (!context.permissions.has(permission)) {
      throw new ToolAuthorizationError(`"${name}" requires the "${permission}" permission.`);
    }
  }

  const verdict = tool.authorize(context, args as never);
  if (!verdict.allowed) {
    throw new ToolAuthorizationError(`"${name}" refused the call: ${verdict.reason}`);
  }

  const now = context.now?.() ?? Date.now();
  if (now >= context.deadlineAt) {
    throw new ToolAuthorizationError(`"${name}" was not started: the run deadline has passed.`);
  }
  if (context.signal?.aborted) {
    throw new ToolAuthorizationError(`"${name}" was not started: the run was cancelled.`);
  }

  const output = await tool.execute(context, args as never);
  return truncate(output, context.maxOutputBytes);
}
