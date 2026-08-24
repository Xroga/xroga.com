/**
 * Post-signup onboarding state.
 *
 * The shape is deliberately small — four stages, two integrations, one optional
 * role. It is stored as a single `onboarding` jsonb column on `profiles`, which is
 * how the companion's preferences are stored, and read on every shell load to answer
 * one question: where should this account land.
 *
 * No imports. The route guard needs these definitions on the server, the flow needs
 * them in the browser, and the tests need them under `tsx --test` from the repo root
 * where the `@/` aliases are not in effect.
 */

export const ONBOARDING_STATUSES = ['not_started', 'in_progress', 'skipped', 'completed'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

export const ONBOARDING_STEPS = ['build_type', 'github', 'vercel', 'preparing', 'complete'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const PROJECT_TYPES = ['saas', 'web_app', 'ai_app', 'website', 'internal_tool', 'other'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const ONBOARDING_ROLES = ['founder', 'developer', 'designer', 'other'] as const;
export type OnboardingRole = (typeof ONBOARDING_ROLES)[number];

export interface OnboardingState {
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  projectType: ProjectType | null;
  role: OnboardingRole | null;
  githubConnected: boolean;
  githubSkipped: boolean;
  vercelConnected: boolean;
  vercelSkipped: boolean;
  /** Set by the migration for accounts that predate onboarding, never by the flow. */
  backfilled: boolean;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
  status: 'not_started',
  currentStep: 'build_type',
  projectType: null,
  role: null,
  githubConnected: false,
  githubSkipped: false,
  vercelConnected: false,
  vercelSkipped: false,
  backfilled: false,
  startedAt: null,
  updatedAt: null,
  completedAt: null,
};

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | null =>
  (allowed as readonly string[]).includes(value as string) ? (value as T) : null;

const bool = (value: unknown): boolean => value === true;
const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Read whatever is in the column into a complete state.
 *
 * Stored as snake_case to match the column's siblings and the wider schema; used as
 * camelCase in the app. Anything unrecognised falls back to the default rather than
 * throwing — a row written by an older or newer bundle must not brick the shell,
 * which reads this on every load.
 */
export function normalizeOnboarding(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_ONBOARDING };
  const r = raw as Record<string, unknown>;
  return {
    status: oneOf(ONBOARDING_STATUSES, r.status) ?? DEFAULT_ONBOARDING.status,
    currentStep: oneOf(ONBOARDING_STEPS, r.current_step ?? r.currentStep) ?? DEFAULT_ONBOARDING.currentStep,
    projectType: oneOf(PROJECT_TYPES, r.project_type ?? r.projectType),
    role: oneOf(ONBOARDING_ROLES, r.role),
    githubConnected: bool(r.github_connected ?? r.githubConnected),
    githubSkipped: bool(r.github_skipped ?? r.githubSkipped),
    vercelConnected: bool(r.vercel_connected ?? r.vercelConnected),
    vercelSkipped: bool(r.vercel_skipped ?? r.vercelSkipped),
    backfilled: bool(r.backfilled),
    startedAt: text(r.started_at ?? r.startedAt),
    updatedAt: text(r.updated_at ?? r.updatedAt),
    completedAt: text(r.completed_at ?? r.completedAt),
  };
}

/** The wire shape, snake_case to match the column's siblings. */
export function serializeOnboarding(state: OnboardingState): Record<string, unknown> {
  return {
    status: state.status,
    current_step: state.currentStep,
    project_type: state.projectType,
    role: state.role,
    github_connected: state.githubConnected,
    github_skipped: state.githubSkipped,
    vercel_connected: state.vercelConnected,
    vercel_skipped: state.vercelSkipped,
    backfilled: state.backfilled,
    started_at: state.startedAt,
    updated_at: state.updatedAt,
    completed_at: state.completedAt,
  };
}

/**
 * Whether this account should be sent to onboarding instead of the app.
 *
 * Only two statuses qualify. `completed` and `skipped` both mean the account has
 * answered the question — skipping is a decision, not an unfinished state, and
 * re-asking would make the skip button a lie.
 */
export function shouldRouteToOnboarding(state: OnboardingState): boolean {
  return state.status === 'not_started' || state.status === 'in_progress';
}

/**
 * Where a returning account picks up.
 *
 * `preparing` and `complete` both resume at `preparing`: the preparation card does
 * its own work and morphs into the ready state, so landing on `complete` directly
 * would show a summary of work this session never did.
 */
export function resumeStep(state: OnboardingState): OnboardingStep {
  if (state.currentStep === 'complete') return 'preparing';
  return state.currentStep;
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  saas: 'SaaS',
  web_app: 'Web App',
  ai_app: 'AI App / Agent',
  website: 'Website',
  internal_tool: 'Internal Tool',
  other: 'Other',
};

export const ROLE_LABELS: Record<OnboardingRole, string> = {
  founder: 'Founder',
  developer: 'Developer',
  designer: 'Designer',
  other: 'Other',
};

/** The preparation card's line, in the reader's own words rather than a generic one. */
export function preparingDescription(projectType: ProjectType | null): string {
  switch (projectType) {
    case 'saas':
      return 'Preparing a workspace for your SaaS product.';
    case 'web_app':
      return 'Preparing a workspace for your web app.';
    case 'ai_app':
      return 'Preparing a workspace for your AI application.';
    case 'website':
      return 'Preparing your website workspace.';
    case 'internal_tool':
      return 'Preparing a workspace for your internal tool.';
    default:
      return 'Preparing your Xroga workspace.';
  }
}
