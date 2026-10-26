import { preparedActionDigest } from '../../security/authority/digest.js';
import { assertAuthorityPermit, consumeAuthorityPermit } from '../../security/authority/enforce.js';
import type { AuthorityDispatchBinding, AuthorityPermit } from '../../security/authority/types.js';
import {
  ComposioClientError,
  assertComposioSession,
  composioRequest,
  createWorkbenchComposioSession,
  interpretComposioExecuteResponse,
  type ComposioExecuteResponse,
} from './composioClient.js';
import { readComposioCapabilityFlags } from './composioPolicy.js';

/**
 * Composio's remote Workbench: a persistent Python sandbox (COMPOSIO_REMOTE_WORKBENCH) that Composio hosts.
 * https://docs.composio.dev/docs/sandbox/remote.md  https://docs.composio.dev/toolkits/meta-tools/remote_workbench.md
 *
 * It runs code outside Xroga's boundary, outside Composio's zero-data-retention promise, with a hard 180 s
 * limit, and Composio plans to meter it. So Xroga:
 *   - keeps it off (XROGA_COMPOSIO_WORKBENCH=enabled turns it on for the process),
 *   - uses a dedicated session where scripts cannot call tools or proxy provider APIs themselves (that would
 *     skip Xroga's per-call authority and budget checks) and egress is restricted to Composio,
 *   - needs a single-use authority permit bound to the exact code, every time,
 *   - caps the code Xroga will send and the output it will return, and redacts credential-shaped output.
 * Only the Python tool is offered. The shell tool (COMPOSIO_REMOTE_BASH_TOOL) is deliberately not.
 * Known limit: the stored session echoes whether tool and proxy execution are on, but not the egress
 * restriction, so egress is set at creation and cannot be verified by reading the session back.
 */

export const WORKBENCH_TOOL = 'COMPOSIO_REMOTE_WORKBENCH';
export const MAX_WORKBENCH_CODE_CHARS = 20_000;
const MAX_OUTPUT_CHARS = 20_000;

export interface WorkbenchDeps {
  readonly createSession: typeof createWorkbenchComposioSession;
  readonly assertSession: typeof assertComposioSession;
  readonly request: typeof composioRequest;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

const defaults: WorkbenchDeps = { createSession: createWorkbenchComposioSession, assertSession: assertComposioSession, request: composioRequest };

export function workbenchBinding(userId: string, code: string, planDigest: string): AuthorityDispatchBinding {
  return { userId, provider: 'composio_workbench', connectedAccountId: 'workbench', operation: WORKBENCH_TOOL, targetDigest: preparedActionDigest({ tool: WORKBENCH_TOOL, code }), planDigest };
}

export interface WorkbenchResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly results: string;
  readonly truncated: boolean;
  readonly resultDigest?: string;
}

const clip = (value: unknown): { text: string; clipped: boolean } => {
  const text = typeof value === 'string' ? value : '';
  return text.length > MAX_OUTPUT_CHARS ? { text: text.slice(0, MAX_OUTPUT_CHARS), clipped: true } : { text, clipped: false };
};

export async function executeComposioWorkbench(
  userId: string,
  input: { code: string; objective?: string; authorityPermit: AuthorityPermit; planDigest: string },
  deps: Partial<WorkbenchDeps> = {},
): Promise<WorkbenchResult> {
  const d = { ...defaults, ...deps };
  if (!readComposioCapabilityFlags(d.env ?? process.env).workbench) {
    throw new ComposioClientError('The remote workbench is not enabled.', { status: 403, code: 'COMPOSIO_WORKBENCH_DISABLED' });
  }
  const code = input.code;
  if (typeof code !== 'string' || code.trim().length === 0 || code.length > MAX_WORKBENCH_CODE_CHARS) {
    throw new ComposioClientError(`Workbench code must be 1 to ${MAX_WORKBENCH_CODE_CHARS} characters.`, { status: 400, code: 'COMPOSIO_WORKBENCH_CODE_INVALID' });
  }
  const binding = workbenchBinding(userId, code, input.planDigest);
  assertAuthorityPermit(input.authorityPermit, binding);

  const session = await d.createSession(userId);
  await d.assertSession(userId, session.session_id, 'workbench');
  await consumeAuthorityPermit(input.authorityPermit, binding);

  const raw = await d.request<ComposioExecuteResponse & { data?: Record<string, unknown> }>(
    `/tool_router/session/${encodeURIComponent(session.session_id)}/execute`,
    {
      method: 'POST',
      body: {
        tool_slug: WORKBENCH_TOOL,
        arguments: { code_to_execute: code, ...(input.objective ? { thought: input.objective.slice(0, 200) } : {}) },
        enable_auto_workbench_offload: false,
      },
      timeoutMs: 200_000,
    },
  );
  const outcome = interpretComposioExecuteResponse(raw);
  const data = (outcome.data ?? {}) as Record<string, unknown>;
  // `data` was already credential-redacted by the shared interpreter. Only the fields Xroga understands are returned.
  const stdout = clip(data.stdout);
  const stderr = clip(data.stderr);
  const results = clip(data.results);
  return {
    stdout: stdout.text,
    stderr: stderr.text,
    results: results.text,
    truncated: stdout.clipped || stderr.clipped || results.clipped,
    ...(outcome.resultDigest ? { resultDigest: outcome.resultDigest } : {}),
  };
}

