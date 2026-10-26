/**
 * Xroga's Composio session policy, as pure functions with no network.
 *
 * Every Composio capability that can cost money, run code, widen what an agent can reach or change
 * which account answers is OFF unless Xroga turns it on explicitly. The wire shapes below follow the
 * published v3.1 Tool Router session API (POST/PATCH /api/v3.1/tool_router/session):
 *   https://docs.composio.dev/reference/api-reference/tool-router/postToolRouterSession
 *   https://docs.composio.dev/docs/firewall.md
 *   https://docs.composio.dev/docs/instant-tools.md
 *   https://docs.composio.dev/docs/sandbox/remote.md
 *   https://docs.composio.dev/docs/authentication/managing-multiple-connected-accounts.md
 *
 * Why this exists: Composio's own defaults are permissive. An omitted `instant` means "enabled with
 * charges hidden" when the project allows Instant; a session has the Workbench sandbox on by default;
 * every toolkit is reachable by default; one account per toolkit is picked by recency. Xroga states
 * each of these in the request and verifies the stored configuration on every use.
 */

export type ComposioSessionIntent = 'read' | 'action' | 'workbench' | 'instant';

export type ComposioHookPhase = 'before_execute' | 'after_execute';

export interface ComposioHook {
  readonly id: string;
  readonly name?: string;
  readonly type: ComposioHookPhase;
  readonly applies_to: 'all' | { readonly toolkits: readonly string[] };
  readonly handler:
    | { readonly type: 'condition_check'; readonly condition: string; readonly action: 'block' }
    | { readonly type: 'prompt_injection_check'; readonly action: 'block' };
}

export interface FirewallCondition {
  readonly id: string;
  readonly phase: ComposioHookPhase;
  readonly toolkits: readonly string[] | 'all';
  readonly condition: string;
}

export interface ComposioCapabilityFlags {
  /** Firewall hooks are usage-priced by Composio, so they are opt-in. */
  readonly firewall: { readonly promptInjection: boolean; readonly conditions: readonly FirewallCondition[] };
  /** Paid Instant execution. Never on unless Xroga's own hard budget is also configured. */
  readonly instant: boolean;
  /** Remote sandbox (Workbench). Runs model-written code outside Xroga's boundary. */
  readonly workbench: boolean;
  /** More than one connected account per toolkit, selected explicitly. */
  readonly multiAccount: boolean;
}

export const PROMPT_INJECTION_HOOK_ID = 'xroga_prompt_injection';
const CONDITION_ID = /^[a-z][a-z0-9_]{2,47}$/;
const TOOLKIT = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const MAX_CONDITIONS = 20;

export class ComposioPolicyError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ComposioPolicyError';
  }
}

function parseConditions(raw: string | undefined): FirewallCondition[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ComposioPolicyError('COMPOSIO_FIREWALL_CONFIG_INVALID', 'XROGA_COMPOSIO_FIREWALL_CONDITIONS is not valid JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_CONDITIONS) {
    throw new ComposioPolicyError('COMPOSIO_FIREWALL_CONFIG_INVALID', `Firewall conditions must be an array of at most ${MAX_CONDITIONS}.`);
  }
  const seen = new Set<string>();
  return parsed.map((entry) => {
    const row = entry as Record<string, unknown>;
    const id = typeof row?.id === 'string' ? row.id : '';
    const phase = row?.phase === 'before_execute' || row?.phase === 'after_execute' ? row.phase : null;
    const condition = typeof row?.condition === 'string' ? row.condition.trim() : '';
    const toolkits = row?.toolkits === 'all' ? 'all' : Array.isArray(row?.toolkits) && row.toolkits.length > 0 && row.toolkits.every((item) => typeof item === 'string' && TOOLKIT.test(item)) ? (row.toolkits as string[]) : null;
    if (!CONDITION_ID.test(id) || seen.has(id) || !phase || !toolkits || condition.length < 10 || condition.length > 500) {
      throw new ComposioPolicyError('COMPOSIO_FIREWALL_CONFIG_INVALID', 'A firewall condition needs a unique id, a phase, toolkits (or "all") and a description of 10 to 500 characters.');
    }
    seen.add(id);
    return { id, phase, toolkits, condition };
  });
}

export function readComposioCapabilityFlags(env: Readonly<Record<string, string | undefined>> = process.env): ComposioCapabilityFlags {
  const firewallMode = (env.XROGA_COMPOSIO_FIREWALL ?? 'off').trim().toLowerCase();
  if (!['off', 'prompt_injection'].includes(firewallMode)) {
    throw new ComposioPolicyError('COMPOSIO_FIREWALL_CONFIG_INVALID', 'XROGA_COMPOSIO_FIREWALL must be "off" or "prompt_injection".');
  }
  return {
    firewall: { promptInjection: firewallMode === 'prompt_injection', conditions: parseConditions(env.XROGA_COMPOSIO_FIREWALL_CONDITIONS) },
    instant: (env.XROGA_COMPOSIO_INSTANT ?? '').trim().toLowerCase() === 'enabled',
    workbench: (env.XROGA_COMPOSIO_WORKBENCH ?? '').trim().toLowerCase() === 'enabled',
    multiAccount: (env.XROGA_COMPOSIO_MULTI_ACCOUNT ?? '').trim().toLowerCase() === 'enabled',
  };
}

/** The exact hook list Xroga attaches. Composio replaces the whole list on update, so this is always complete. */
export function firewallHooks(flags: ComposioCapabilityFlags): ComposioHook[] {
  const hooks: ComposioHook[] = [];
  if (flags.firewall.promptInjection) {
    // Screens tool RESULTS before the model reads them. Valid only in after_execute.
    hooks.push({ id: PROMPT_INJECTION_HOOK_ID, name: 'Xroga prompt injection screen', type: 'after_execute', applies_to: 'all', handler: { type: 'prompt_injection_check', action: 'block' } });
  }
  for (const condition of flags.firewall.conditions) {
    hooks.push({
      id: condition.id, name: condition.id, type: condition.phase,
      applies_to: condition.toolkits === 'all' ? 'all' : { toolkits: [...condition.toolkits] },
      handler: { type: 'condition_check', condition: condition.condition, action: 'block' },
    });
  }
  return hooks;
}

export interface SessionBodyInput {
  readonly composioUserId: string;
  readonly intent: ComposioSessionIntent;
  readonly flags: ComposioCapabilityFlags;
  readonly readOnlyTag: string;
  /** Instant opt-in: the only toolkits and tools a paid account may serve. */
  readonly instant?: { readonly toolkits: readonly string[]; readonly tools?: Readonly<Record<string, readonly string[]>> };
  /** Pin the session to the caller's own accounts (already verified as theirs). */
  readonly connectedAccounts?: Readonly<Record<string, readonly string[]>>;
}

export function buildSessionBody(input: SessionBodyInput): Record<string, unknown> {
  const { intent, flags } = input;
  if (intent === 'workbench' && !flags.workbench) throw new ComposioPolicyError('COMPOSIO_WORKBENCH_DISABLED', 'The remote workbench is not enabled for Xroga.');
  if (intent === 'instant' && !flags.instant) throw new ComposioPolicyError('COMPOSIO_INSTANT_DISABLED', 'Instant (paid) execution is not enabled for Xroga.');

  const body: Record<string, unknown> = {
    user_id: input.composioUserId,
    // The workbench is on by default at Composio, so it is always stated. A workbench session never lets scripts call tools or
    // arbitrary provider APIs themselves, because that would bypass Xroga's per-call authority and budget checks.
    workbench: intent === 'workbench'
      ? { enable: true, enable_tool_execution: false, enable_proxy_execution: false, sandbox_size: 'standard' }
      : { enable: false, enable_proxy_execution: false },
    search: { enable: true },
    execute: { enable_multi_execute: false },
    manage_connections: { enable: true, enable_wait_for_connections: false, enable_connection_removal: false },
    // Composio treats an omitted `instant` as enabled-with-hidden-charges when the project allows Instant.
    instant: intent === 'instant' && input.instant
      ? {
          toolkits: { enable: [...input.instant.toolkits] },
          ...(input.instant.tools ? { tools: Object.fromEntries(Object.entries(input.instant.tools).map(([toolkit, slugs]) => [toolkit, { enable: [...slugs] }])) } : {}),
          return_instant_charge: true,
        }
      : false,
  };
  if (intent === 'read') body.tags = [input.readOnlyTag];
  if (intent === 'workbench') body.experimental = { restrict_egress_to_composio: true };

  const hooks = firewallHooks(flags);
  if (hooks.length > 0) body.hooks = hooks;

  if (flags.multiAccount) {
    body.multi_account = { enable: true, max_accounts_per_toolkit: 5, require_explicit_selection: true };
  }
  if (input.connectedAccounts && Object.keys(input.connectedAccounts).length > 0) {
    body.connected_accounts = Object.fromEntries(Object.entries(input.connectedAccounts).map(([toolkit, ids]) => [toolkit, [...ids]]));
  }
  return body;
}

export interface StoredSandboxConfig {
  readonly enable?: boolean;
  readonly tool_execution_enabled?: boolean;
  readonly enable_tool_execution?: boolean;
  readonly proxy_execution_enabled?: boolean;
  readonly enable_proxy_execution?: boolean;
}

export interface StoredSessionConfig {
  readonly user_id?: string;
  readonly instant?: unknown;
  readonly hooks?: ReadonlyArray<Record<string, unknown>> | null;
  readonly workbench?: StoredSandboxConfig;
  readonly sandbox?: StoredSandboxConfig;
  readonly execute?: { readonly enable_multi_execute?: boolean };
  readonly multi_account?: { readonly enable?: boolean; readonly require_explicit_selection?: boolean } | null;
}

export interface PolicyViolation {
  readonly code: string;
  readonly message: string;
  /** Violations the server can repair with one PATCH, because the repair only narrows access. */
  readonly repair?: Record<string, unknown>;
}

const sameHook = (stored: Record<string, unknown>, expected: ComposioHook): boolean => {
  const handler = stored.handler as Record<string, unknown> | undefined;
  const appliesTo = stored.applies_to ?? stored.appliesTo;
  return stored.id === expected.id && stored.type === expected.type && handler?.action === 'block' && handler?.type === expected.handler.type
    && (expected.handler.type !== 'condition_check' || handler?.condition === expected.handler.condition)
    && JSON.stringify(appliesTo) === JSON.stringify(expected.applies_to);
};

/**
 * Checks a stored session configuration against Xroga's policy. Returns every violation; an empty list
 * means the session is safe to use for this intent. Never trusts an absent field.
 */
export function evaluateSessionConfig(config: StoredSessionConfig | undefined, intent: ComposioSessionIntent, flags: ComposioCapabilityFlags): PolicyViolation[] {
  const violations: PolicyViolation[] = [];
  const sandbox = config?.sandbox ?? config?.workbench;

  if (intent === 'workbench') {
    if (!flags.workbench) violations.push({ code: 'COMPOSIO_WORKBENCH_DISABLED', message: 'The remote workbench is not enabled for Xroga.' });
    if (sandbox?.enable !== true) violations.push({ code: 'COMPOSIO_WORKBENCH_NOT_ENABLED', message: 'The workbench session does not have the workbench enabled.' });
    if (sandbox?.tool_execution_enabled !== false && sandbox?.enable_tool_execution !== false) {
      violations.push({ code: 'COMPOSIO_WORKBENCH_TOOL_EXECUTION_BLOCKED', message: 'Xroga Connect rejected a workbench that can call tools from inside scripts.' });
    }
  } else if (sandbox?.enable === true) {
    violations.push({ code: 'COMPOSIO_SANDBOX_BLOCKED', message: 'Xroga Connect rejected a session with sandbox access enabled.' });
  }
  if (sandbox?.proxy_execution_enabled === true || sandbox?.enable_proxy_execution === true) {
    violations.push({ code: 'COMPOSIO_PROXY_EXECUTION_BLOCKED', message: 'Xroga Connect rejected a session with proxy execution enabled.' });
  }
  if (config?.execute?.enable_multi_execute === true) {
    violations.push({ code: 'COMPOSIO_MULTI_EXECUTE_BLOCKED', message: 'Xroga Connect rejected a session with multi-execution enabled.' });
  }

  if (intent === 'instant') {
    const instant = config?.instant as { toolkits?: { enable?: unknown } } | false | undefined;
    const enabled = instant && typeof instant === 'object' ? instant.toolkits?.enable : undefined;
    if (!flags.instant) violations.push({ code: 'COMPOSIO_INSTANT_DISABLED', message: 'Instant (paid) execution is not enabled for Xroga.' });
    if (!Array.isArray(enabled) || enabled.length === 0) {
      violations.push({ code: 'COMPOSIO_INSTANT_NOT_SCOPED', message: 'An Instant session must name the exact toolkits a paid account may serve.' });
    }
  } else if (config?.instant !== false) {
    violations.push({ code: 'COMPOSIO_INSTANT_NOT_DISABLED', message: 'Xroga Connect rejected a session that could use paid Instant accounts.', repair: { instant: false } });
  }

  const expectedHooks = firewallHooks(flags);
  if (expectedHooks.length > 0) {
    const stored = Array.isArray(config?.hooks) ? config.hooks : [];
    if (!expectedHooks.every((hook) => stored.some((row) => sameHook(row, hook)))) {
      violations.push({ code: 'COMPOSIO_FIREWALL_MISSING', message: 'Xroga Connect rejected a session without the required firewall hooks.', repair: { hooks: expectedHooks } });
    }
  }

  const multi = config?.multi_account;
  if (multi?.enable === true && !flags.multiAccount) {
    violations.push({ code: 'COMPOSIO_MULTI_ACCOUNT_DISABLED', message: 'Xroga Connect rejected a multi-account session that Xroga did not enable.' });
  }
  if (multi?.enable === true && multi.require_explicit_selection !== true) {
    violations.push({ code: 'COMPOSIO_MULTI_ACCOUNT_IMPLICIT', message: 'Xroga Connect requires explicit account selection when several accounts are connected.' });
  }
  return violations;
}

/** The one PATCH body that repairs every repairable violation, or null when something cannot be repaired. */
export function repairBody(violations: readonly PolicyViolation[]): Record<string, unknown> | null {
  if (violations.length === 0) return null;
  if (violations.some((violation) => !violation.repair)) return null;
  return Object.assign({}, ...violations.map((violation) => violation.repair));
}
