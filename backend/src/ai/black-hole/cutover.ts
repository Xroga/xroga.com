/**
 * §39 — the feature-flagged cutover.
 *
 * The migration §39 requires, in order:
 *
 *   existing path → Black Hole shadow → controlled Black Hole route → default → legacy disabled
 *
 * "Do not big-bang deploy" is the whole instruction, so the stages are modelled explicitly
 * rather than left as a percentage that someone raises. Each stage answers two different
 * questions — does Black Hole *run*, and does its answer *reach the user* — and conflating
 * them is what makes a rollout impossible to reason about mid-incident.
 *
 * ## Shadow mode is the interesting one
 *
 * In `shadow`, Black Hole runs and its result is discarded. That buys real routing decisions on
 * real traffic with zero user-visible risk, which is the only way to find out that a chain is
 * empty for 8% of requests before those users see it. It also costs real money, which is why it
 * is a deliberate stage rather than something left switched on.
 *
 * ## Default is off, and unrecognised means off
 *
 * The opposite of `legacyBuilderAdapter`'s flag, and for the same reason it is deliberate
 * there: an unset variable must leave production doing what it already does. For the legacy
 * builder that means *enabled*; for a new and unproven path it means *disabled*. A typo in
 * either variable results in "nothing changed".
 */

export type CutoverStage =
  | 'legacy_only'
  | 'shadow'
  | 'controlled'
  | 'default'
  | 'legacy_disabled';

export const CUTOVER_STAGES: readonly CutoverStage[] = [
  'legacy_only',
  'shadow',
  'controlled',
  'default',
  'legacy_disabled',
];

export interface CutoverPlan {
  readonly stage: CutoverStage;
  /** Whether the Black Hole gateway executes at all. */
  readonly runsBlackHole: boolean;
  /** Whether its result is what the user receives. */
  readonly servesBlackHole: boolean;
  /** Whether the previous path remains available as a rollback. */
  readonly legacyAvailable: boolean;
  /** Percentage of eligible requests routed to Black Hole in `controlled`. */
  readonly rolloutPercent: number;
  readonly description: string;
}

function readStage(env: NodeJS.ProcessEnv): CutoverStage {
  const raw = (env.BLACK_HOLE_CUTOVER_STAGE ?? '').trim().toLowerCase();
  return (CUTOVER_STAGES as readonly string[]).includes(raw)
    ? (raw as CutoverStage)
    : 'legacy_only';
}

function readPercent(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.BLACK_HOLE_ROLLOUT_PERCENT);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.floor(raw)));
}

export function readCutoverPlan(env: NodeJS.ProcessEnv = process.env): CutoverPlan {
  const stage = readStage(env);
  const percent = readPercent(env);

  switch (stage) {
    case 'shadow':
      return {
        stage,
        runsBlackHole: true,
        servesBlackHole: false,
        legacyAvailable: true,
        rolloutPercent: 0,
        description:
          'Black Hole runs on real traffic and its result is discarded. Routing decisions are ' +
          'observable before any user depends on them.',
      };
    case 'controlled':
      return {
        stage,
        runsBlackHole: true,
        servesBlackHole: true,
        legacyAvailable: true,
        rolloutPercent: percent,
        description: `Black Hole serves ${percent}% of eligible requests; the previous path serves the rest.`,
      };
    case 'default':
      return {
        stage,
        runsBlackHole: true,
        servesBlackHole: true,
        legacyAvailable: true,
        rolloutPercent: 100,
        description: 'Black Hole is the default route and the previous path remains as rollback.',
      };
    case 'legacy_disabled':
      return {
        stage,
        runsBlackHole: true,
        servesBlackHole: true,
        legacyAvailable: false,
        rolloutPercent: 100,
        description: 'Black Hole is the only route. The previous path is no longer available.',
      };
    default:
      return {
        stage: 'legacy_only',
        runsBlackHole: false,
        servesBlackHole: false,
        legacyAvailable: true,
        rolloutPercent: 0,
        description: 'The previous path serves every request. Black Hole does not run.',
      };
  }
}

/**
 * Whether one specific request should be served by Black Hole.
 *
 * Bucketed on a stable key rather than sampled randomly, so a user's experience does not
 * flip between paths on every message. Mid-conversation reassignment is worse than either
 * path: it produces a session where half the answers came from a different system, which is
 * both confusing to the user and unreadable in a bug report.
 */
export function servesBlackHoleFor(plan: CutoverPlan, stableKey: string): boolean {
  if (!plan.servesBlackHole) return false;
  if (plan.rolloutPercent >= 100) return true;
  if (plan.rolloutPercent <= 0) return false;

  let hash = 2_166_136_261;
  for (let index = 0; index < stableKey.length; index += 1) {
    hash ^= stableKey.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (Math.abs(hash) % 100) < plan.rolloutPercent;
}

/**
 * Whether a stage transition is one step along §39's path.
 *
 * Skipping forward is refused: going from `legacy_only` straight to `default` is the big-bang
 * deploy §39 forbids, whatever it is called at the time. Moving *backwards* by any distance is
 * always allowed, because that is a rollback and an incident is the worst moment to discover
 * the safety control only travels one way.
 */
export function isPermittedTransition(from: CutoverStage, to: CutoverStage): boolean {
  const fromIndex = CUTOVER_STAGES.indexOf(from);
  const toIndex = CUTOVER_STAGES.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  if (toIndex <= fromIndex) return true;
  return toIndex - fromIndex === 1;
}
