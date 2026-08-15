/**
 * The public identity boundary — §29, §30, §31.
 *
 * One public name over several real providers. Everything a user can see says Black Hole ∞;
 * which vendor served a request is internal, and so are the per-model personas that predate it.
 *
 * ## What the audit found
 *
 * Raw provider names (`kimi`, `moonshot`, `zhipu`, …) do **not** currently reach any route —
 * that part of §30 already held. What does reach users are the personas from `models.ts`:
 * `quota.ts` publishes them on the dashboard model pools, `routes/capabilities.ts` publishes
 * them through `safeModelDiagnostics()`, and `pipeline.ts` puts them in an attempt-failure
 * `model` field and in progress heartbeats ("waiting for Xroga Apex to return code"). Those are
 * exactly the "old public model personas" §31 asks to stop using.
 *
 * ## Why the strings stay in `models.ts`
 *
 * §31 says not to delete strings still required for safe migration or admin compatibility until
 * callers are migrated, and that is the right call: `label` is load-bearing for admin
 * diagnostics, and deleting the field would turn a display change into a compile error across
 * unrelated modules. So this module supplies the public replacement and the guard, and the
 * callers are migrated to it. The personas become admin-only rather than deleted.
 *
 * ## The guard is a test tool, not a runtime filter
 *
 * `assertNoPublicIdentityLeak` exists so tests can assert over real serialized payloads.
 * Scrubbing at runtime would be the wrong control: it hides the bug rather than preventing it,
 * and a scrubber that runs on every response is one more thing between a user and their data.
 * The structural fix is that public types have no field for provider identity — as with
 * `BlackHoleResponse` — and this guard proves it stayed that way.
 */

/** The one public name. */
export const BLACK_HOLE_PUBLIC_NAME = 'Black Hole ∞';

/** §30's forbidden list, verbatim, plus the transport hostnames that would give it away. */
export const FORBIDDEN_PROVIDER_TOKENS: readonly string[] = [
  'kimi',
  'moonshot',
  'glm',
  'zhipu',
  'deepseek',
  'openrouter',
  'grok',
  'xai',
  'apimodel',
  'selectedmodel',
  'fallbackmodels',
  'bigmodel',
  'api.x.ai',
];

/** §29's forbidden reasoning surfaces. */
export const FORBIDDEN_REASONING_KEYS: readonly string[] = [
  'reasoning_content',
  'reasoning_details',
  'reasoningcontent',
  'reasoningdetails',
  'chain_of_thought',
  'chainofthought',
];

/** §31's personas. Retained for admin and migration compatibility, never for users. */
export const MODEL_PERSONAS: readonly string[] = [
  'Xroga Apex',
  'Xroga Horizon',
  'Xroga Forge',
  'Xroga Pulse',
  'Xroga Live',
  'Xroga Lens',
];

/**
 * §28's public statuses. The complete set — a status not on this list is not publishable.
 *
 * They describe what the system is *doing*, which is what a user actually wants to know, and
 * none of them can be mapped back to a vendor. "Using Kimi" tells a user nothing they can act
 * on and tells a competitor something about the stack.
 */
export const PUBLIC_STATUSES = [
  'Thinking',
  'Researching',
  'Planning',
  'Building',
  'Checking',
  'Testing',
  'Refining',
  'Completing',
] as const;

export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

/** §28's public stream events. */
export const PUBLIC_STREAM_EVENTS = [
  'started',
  'status',
  'text_delta',
  'tool_started',
  'tool_completed',
  'artifact',
  'completed',
  'error',
] as const;

export type PublicStreamEvent = (typeof PUBLIC_STREAM_EVENTS)[number];

/**
 * What a user is told a request is currently doing.
 *
 * Deliberately total over the internal phases, so a new phase cannot fall through to a default
 * that accidentally exposes something. Every internal state maps to one of the eight.
 */
export function publicStatusFor(phase: string): PublicStatus {
  switch (phase) {
    case 'understand':
    case 'classify':
    case 'plan_context':
      return 'Thinking';
    case 'research':
      return 'Researching';
    case 'plan':
    case 'convert':
      return 'Planning';
    case 'implement':
    case 'act':
    case 'generate':
      return 'Building';
    case 'lint':
    case 'typecheck':
    case 'security':
    case 'observe':
      return 'Checking';
    case 'test':
      return 'Testing';
    case 'repair':
    case 'adapt':
    case 'revalidate':
      return 'Refining';
    case 'ship':
    case 'complete':
      return 'Completing';
    default:
      // An unmapped phase is a thinking state rather than a leak. Choosing the vaguest of the
      // eight is the safe direction: it says less than the truth, never more.
      return 'Thinking';
  }
}

/** The public identity of whatever served a request. Always the same. */
export function publicModelIdentity(): string {
  return BLACK_HOLE_PUBLIC_NAME;
}

export interface IdentityLeak {
  readonly token: string;
  readonly kind: 'provider' | 'reasoning' | 'persona';
  readonly path: string;
}

/**
 * Finds provider identity, reasoning traces and personas anywhere in a payload.
 *
 * Walks the structure rather than testing known fields, because the leaks worth catching are
 * the ones nobody predicted — a nested error message, a provider id echoed into a debug field,
 * a persona inside a human-readable progress string. Keys are checked as well as values, since
 * `{ selectedModel: 'x' }` leaks through its key alone.
 */
export function findPublicIdentityLeaks(payload: unknown): IdentityLeak[] {
  const leaks: IdentityLeak[] = [];
  const seen = new WeakSet<object>();

  const scanText = (text: string, path: string) => {
    const lower = text.toLowerCase();
    for (const token of FORBIDDEN_PROVIDER_TOKENS) {
      // Bounded by "not a letter or digit" rather than by `\b`, because `_` is a word
      // character: `\bkimi\b` does not match `kimi_k3`, and the internal model ids are exactly
      // the strings §30 forbids exposing. The boundary is still needed in some form — a bare
      // substring match would flag "grokking" and get the guard switched off within a week.
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(lower)) {
        leaks.push({ token, kind: 'provider', path });
      }
    }
    for (const token of FORBIDDEN_REASONING_KEYS) {
      if (lower.includes(token)) leaks.push({ token, kind: 'reasoning', path });
    }
    for (const persona of MODEL_PERSONAS) {
      if (lower.includes(persona.toLowerCase())) {
        leaks.push({ token: persona, kind: 'persona', path });
      }
    }
  };

  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      scanText(value, path);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      scanText(key, `${path}.${key}`);
      walk(entry, `${path}.${key}`);
    }
  };

  walk(payload, '$');
  return leaks;
}

export class PublicIdentityLeakError extends Error {
  readonly code = 'PUBLIC_IDENTITY_LEAK' as const;
  constructor(message: string, readonly leaks: readonly IdentityLeak[]) {
    super(message);
    this.name = 'PublicIdentityLeakError';
  }
}

export function assertNoPublicIdentityLeak(payload: unknown, context: string): void {
  const leaks = findPublicIdentityLeaks(payload);
  if (!leaks.length) return;
  throw new PublicIdentityLeakError(
    `${context} exposes provider identity: ` +
      leaks.map((leak) => `${leak.token} (${leak.kind}) at ${leak.path}`).join(', '),
    leaks,
  );
}
