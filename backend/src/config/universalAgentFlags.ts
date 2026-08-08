/**
 * Rollout control for the universal engineering path.
 *
 * §70 forbids replacing the production pipeline destructively in one commit, and the
 * arithmetic supports it: `pipeline.ts` is roughly 3,750 lines serving real users today.
 * A new path can be more correct in every fixture here and still be wrong about something
 * only production contains.
 *
 * So the default is off, and the interesting mode is the middle one. **Shadow** runs the
 * universal planner beside the legacy pipeline, compares what each decided, and writes
 * nothing. It is the only way to learn what the new path does to real requests without
 * betting a user's project on the answer — and it is worth more than any fixture, because
 * the fixtures were written by the same reasoning as the code.
 *
 * The safety property is enforced rather than documented: `mayWrite` returns false in
 * shadow, and a test asserts it for every mode.
 */

export type UniversalAgentMode = 'off' | 'shadow' | 'enabled';

export interface UniversalAgentFlags {
  readonly mode: UniversalAgentMode;
  /** 0–100. Applies only in `enabled`. */
  readonly percentage: number;
  /** Project IDs that always take the universal path regardless of percentage. */
  readonly allowlist: readonly string[];
}

const DEFAULTS: UniversalAgentFlags = {
  // Off unless an operator says otherwise. A flag that defaults to on is not a rollout.
  mode: 'off',
  percentage: 0,
  allowlist: [],
};

function parseMode(value: string | undefined): UniversalAgentMode {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'shadow': return 'shadow';
    case 'enabled': case 'on': case '1': case 'true': return 'enabled';
    // Anything unrecognised is off. A typo in an environment variable must not enable a
    // path; the failure of a misread flag should be "nothing changed".
    default: return 'off';
  }
}

function parsePercentage(value: string | undefined): number {
  const parsed = Number.parseInt((value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

export function readUniversalAgentFlags(env: NodeJS.ProcessEnv = process.env): UniversalAgentFlags {
  const mode = parseMode(env.UNIVERSAL_AGENT_ENABLED);
  if (mode === 'off') return DEFAULTS;
  return {
    mode,
    percentage: parsePercentage(env.UNIVERSAL_AGENT_PERCENTAGE),
    allowlist: (env.UNIVERSAL_AGENT_ALLOWLIST ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

/**
 * Stable per-project bucketing.
 *
 * Deterministic on purpose. A project must not move between paths on retry — a run that
 * half-executed under one pipeline and resumed under the other would be far harder to
 * diagnose than either being wrong on its own. Any stable hash works; this one is FNV-1a
 * because it is short and has no dependencies.
 */
function bucket(projectId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < projectId.length; index += 1) {
    hash ^= projectId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 100;
}

export interface RoutingDecision {
  readonly useUniversal: boolean;
  readonly shadow: boolean;
  readonly reason: string;
}

/**
 * Which path a project takes.
 *
 * The allowlist ignores the percentage, so an operator can put one project on the new path
 * and watch it without exposing a percentage of everyone else.
 */
export function routeProject(
  projectId: string | null | undefined,
  flags: UniversalAgentFlags = readUniversalAgentFlags(),
): RoutingDecision {
  if (flags.mode === 'off') {
    return { useUniversal: false, shadow: false, reason: 'the universal agent is disabled' };
  }
  if (flags.mode === 'shadow') {
    return { useUniversal: false, shadow: true, reason: 'shadow mode: the universal planner runs for comparison and writes nothing' };
  }
  if (!projectId) {
    // No stable identity means no stable bucket, and a project that flipped between paths
    // per request would be the worst of both.
    return { useUniversal: false, shadow: true, reason: 'no project id, so bucketing would not be stable; shadowing instead' };
  }
  if (flags.allowlist.includes(projectId)) {
    return { useUniversal: true, shadow: false, reason: 'the project is on the universal agent allowlist' };
  }
  const assigned = bucket(projectId);
  return assigned < flags.percentage
    ? { useUniversal: true, shadow: false, reason: `project bucket ${assigned} is inside the ${flags.percentage}% rollout` }
    : { useUniversal: false, shadow: true, reason: `project bucket ${assigned} is outside the ${flags.percentage}% rollout` };
}

/**
 * Whether the universal path may modify a repository.
 *
 * The one invariant of shadow mode, kept as a function so it is enforced rather than
 * remembered. §70 says no universal write occurs in shadow; this is where that holds.
 */
export function mayWrite(decision: RoutingDecision): boolean {
  return decision.useUniversal && !decision.shadow;
}

export interface ShadowComparison {
  readonly agreed: boolean;
  readonly legacyStack: string;
  readonly universalLanguages: readonly string[];
  readonly universalSurfaces: readonly string[];
  readonly differences: readonly string[];
}

/**
 * Compares what each path decided, for one request.
 *
 * Disagreement is the useful signal and usually means the universal path was right: the
 * legacy vocabulary has four values, so any request that is not a static site, a Next.js
 * app or an Expo app can only be recorded as one of those. A legacy `static` against a
 * universal `rust`/`cli` is the exact case this command exists to fix, and it is called
 * out by name so a reviewer reading shadow logs is not left to infer it.
 */
export function compareShadowDecision(input: {
  legacyStack: string;
  universalLanguages: readonly string[];
  universalSurfaces: readonly string[];
}): ShadowComparison {
  const differences: string[] = [];
  const legacyIsWeb = input.legacyStack === 'static' || input.legacyStack === 'nextjs';
  const universalIsWeb = input.universalSurfaces.some(
    (surface) => surface === 'web_frontend' || surface === 'documentation_site',
  );

  if (legacyIsWeb && !universalIsWeb) {
    differences.push(
      `legacy chose "${input.legacyStack}" while the universal path found ${input.universalSurfaces.join(', ') || 'no web surface'} ` +
        `in ${input.universalLanguages.join(', ') || 'no language'} — the legacy vocabulary has no value for this product, ` +
        'so it recorded the nearest web option.',
    );
  }
  if (!input.universalSurfaces.length) {
    differences.push('the universal path could not determine a surface and would have refused rather than generating');
  }
  if (input.legacyStack === 'static' && input.universalLanguages.some((language) => language !== 'typescript' && language !== 'javascript')) {
    differences.push(`legacy would have emitted static HTML for a ${input.universalLanguages.join('/')} product`);
  }

  return {
    agreed: differences.length === 0,
    legacyStack: input.legacyStack,
    universalLanguages: input.universalLanguages,
    universalSurfaces: input.universalSurfaces,
    differences,
  };
}
