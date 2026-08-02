/**
 * The first seconds of a run, made visible.
 *
 * Measured in production on run `46d07c5d`: the run row was created at 15:20:20 and
 * the first progress event (`router/routing`) arrived at 15:20:42. For twenty-two
 * seconds the terminal showed the user's own prompt and nothing else, so people
 * reasonably concluded the product was broken and sent again.
 *
 * Nothing was actually idle in that window. `runBuildPipeline` was writing the
 * recovery row, checking the action balance, loading chat history, reading the
 * repository from GitHub, probing provider credentials and running the synthesis
 * foundation — all real work, none of it announced. This module names those steps so
 * the transcript starts immediately and every line corresponds to something the
 * backend is genuinely doing at that moment.
 *
 * Rules these lines follow, and the reason for each:
 *
 * - **Emitted before the step, never after.** A line printed after the await already
 *   finished would leave exactly the silence it exists to remove.
 * - **No percentages, no counts of remaining work, no ETAs.** The pipeline does not
 *   know how long a GitHub read takes, and a made-up number is worse than silence.
 * - **Past-tense only for work already done.** `hydrated` reports a finished read and
 *   carries the file count, because by then it is a fact.
 */

export type StartupStep =
  | 'accepted'
  | 'quota'
  | 'history'
  | 'repository'
  | 'hydrated'
  | 'route';

export interface StartupProgressLine {
  agent: string;
  status: string;
  message: string;
  swarmStatusLabel: string;
  swarmActivity: string;
}

const LINES: Record<StartupStep, StartupProgressLine> = {
  accepted: {
    agent: 'session',
    status: 'accepted',
    message: 'Request received. Setting up your build.',
    swarmStatusLabel: 'Starting',
    swarmActivity: 'Request received',
  },
  quota: {
    agent: 'session',
    status: 'checking_quota',
    message: 'Checking your available actions.',
    swarmStatusLabel: 'Starting',
    swarmActivity: 'Checking your available actions',
  },
  history: {
    agent: 'session',
    status: 'loading_history',
    message: 'Loading the earlier messages in this project.',
    swarmStatusLabel: 'Starting',
    swarmActivity: 'Loading project memory',
  },
  repository: {
    agent: 'session',
    status: 'reading_repository',
    message: 'Reading your existing project files.',
    swarmStatusLabel: 'Reading',
    swarmActivity: 'Reading your project files',
  },
  hydrated: {
    agent: 'session',
    status: 'repository_ready',
    message: 'Project files loaded.',
    swarmStatusLabel: 'Reading',
    swarmActivity: 'Project files loaded',
  },
  route: {
    agent: 'session',
    status: 'planning_route',
    message: 'Choosing the models and steps for this request.',
    swarmStatusLabel: 'Planning',
    swarmActivity: 'Planning the build route',
  },
};

/**
 * The line for a startup step.
 *
 * `hydrated` takes the file count so the user learns what was actually read. Zero is
 * reported as its own sentence rather than "0 files", because a first build legitimately
 * has nothing to read and "read 0 files" reads like a failure.
 */
export function startupProgress(
  step: StartupStep,
  detail?: { fileCount?: number },
): StartupProgressLine {
  const line = LINES[step];
  if (step !== 'hydrated') return { ...line };

  const count = detail?.fileCount ?? 0;
  if (count <= 0) {
    return {
      ...line,
      message: 'No existing project files — this will be a new project.',
      swarmActivity: 'New project — no existing files',
    };
  }
  return {
    ...line,
    message: `Project files loaded — ${count} ${count === 1 ? 'file' : 'files'} in context.`,
    swarmActivity: `Loaded ${count} project ${count === 1 ? 'file' : 'files'}`,
  };
}

/** Every step, in the order the pipeline performs them. Used by the ordering test. */
export const STARTUP_STEPS: readonly StartupStep[] = [
  'accepted',
  'quota',
  'history',
  'repository',
  'hydrated',
  'route',
];
