/**
 * The Black Hole ∞ agent runtime — §19.
 *
 * UNDERSTAND → PLAN → ACT → OBSERVE → ADAPT → COMPLETE, with the five controls §19 requires on
 * every run: `maxSteps`, `maxToolCalls`, `deadline`, `maxEstimatedCost` and cancellation.
 *
 * ## "No uncontrolled loops" is a structural claim, not an intention
 *
 * Every one of those limits is checked at the top of each step, before any work is done, and
 * the loop's own counter is bounded independently of them. A loop that relies on the model
 * eventually emitting "done" is uncontrolled no matter how many limits surround it, because
 * the model is exactly the component that might not. So the runtime terminates on its own
 * budget and reports *why* — an agent that stops without saying which limit it hit is one
 * nobody can tune.
 *
 * ## Stopping is a first-class outcome
 *
 * `AgentOutcome.status` distinguishes completion from each way of running out. That matters
 * downstream: a run that hit its deadline halfway through a refactor must not be recorded as a
 * successful build, and §22's "do not mark generation alone as success" starts here.
 */

export type AgentPhase = 'understand' | 'plan' | 'act' | 'observe' | 'adapt' | 'complete';

export type AgentStopReason =
  | 'completed'
  | 'max_steps'
  | 'max_tool_calls'
  | 'deadline'
  | 'max_cost'
  | 'cancelled'
  | 'no_progress'
  | 'failed';

export interface AgentBudget {
  readonly maxSteps: number;
  readonly maxToolCalls: number;
  /** Absolute epoch milliseconds. */
  readonly deadlineAt: number;
  readonly maxEstimatedCostUsd: number;
}

export interface AgentStepRecord {
  readonly index: number;
  readonly phase: AgentPhase;
  readonly summary: string;
  readonly toolCalls: number;
  readonly estimatedCostUsd: number;
}

export interface AgentStepResult {
  readonly phase: AgentPhase;
  readonly summary: string;
  /** Tool calls this step consumed. */
  readonly toolCalls?: number;
  readonly estimatedCostUsd?: number;
  /** True when the objective is met and the loop should complete. */
  readonly done?: boolean;
  /** True when the step achieved nothing — two in a row end the run. */
  readonly madeProgress?: boolean;
}

export interface AgentOutcome {
  readonly status: AgentStopReason;
  readonly steps: readonly AgentStepRecord[];
  readonly toolCallsUsed: number;
  readonly estimatedCostUsd: number;
  readonly explanation: string;
}

export interface AgentRunInput {
  readonly budget: AgentBudget;
  readonly signal?: AbortSignal;
  readonly now?: () => number;
  /**
   * Runs one step.
   *
   * Receives the record so far so a step can adapt — §19's ADAPT phase is not a separate
   * callback, it is what a step does with the observations it is handed.
   */
  readonly step: (context: {
    readonly index: number;
    readonly history: readonly AgentStepRecord[];
    readonly remaining: {
      readonly steps: number;
      readonly toolCalls: number;
      readonly costUsd: number;
      readonly milliseconds: number;
    };
  }) => Promise<AgentStepResult>;
}

/** A ceiling the loop cannot exceed even if a caller passes an absurd `maxSteps`. */
const ABSOLUTE_STEP_CEILING = 200;

export class AgentBudgetError extends Error {
  readonly code = 'AGENT_BUDGET_INVALID' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AgentBudgetError';
  }
}

/**
 * Validates a budget before a run starts.
 *
 * §19 requires every run to *have* these controls, so an absent or nonsensical one is refused
 * up front rather than defaulted. A silently defaulted deadline is how a run ends up with no
 * effective limit at all.
 */
export function assertAgentBudget(budget: AgentBudget, now = Date.now()): void {
  if (!Number.isFinite(budget.maxSteps) || budget.maxSteps < 1) {
    throw new AgentBudgetError('maxSteps must be a positive number of steps.');
  }
  if (!Number.isFinite(budget.maxToolCalls) || budget.maxToolCalls < 0) {
    throw new AgentBudgetError('maxToolCalls must be zero or more.');
  }
  if (!Number.isFinite(budget.deadlineAt) || budget.deadlineAt <= now) {
    throw new AgentBudgetError('deadlineAt must be an epoch timestamp in the future.');
  }
  if (!Number.isFinite(budget.maxEstimatedCostUsd) || budget.maxEstimatedCostUsd <= 0) {
    throw new AgentBudgetError('maxEstimatedCostUsd must be greater than zero.');
  }
}

export async function runAgent(input: AgentRunInput): Promise<AgentOutcome> {
  const clock = input.now ?? Date.now;
  assertAgentBudget(input.budget, clock());

  const steps: AgentStepRecord[] = [];
  let toolCallsUsed = 0;
  let estimatedCostUsd = 0;
  let consecutiveNoProgress = 0;

  const stepCeiling = Math.min(input.budget.maxSteps, ABSOLUTE_STEP_CEILING);

  const finish = (status: AgentStopReason, explanation: string): AgentOutcome => ({
    status,
    steps,
    toolCallsUsed,
    estimatedCostUsd,
    explanation,
  });

  for (let index = 0; index < stepCeiling; index += 1) {
    // Every limit is checked before any work, so an exhausted budget costs nothing further.
    if (input.signal?.aborted) {
      return finish('cancelled', `Cancelled after ${steps.length} step(s).`);
    }
    if (clock() >= input.budget.deadlineAt) {
      return finish('deadline', `Deadline reached after ${steps.length} step(s).`);
    }
    if (toolCallsUsed >= input.budget.maxToolCalls && input.budget.maxToolCalls > 0) {
      return finish(
        'max_tool_calls',
        `Tool call budget of ${input.budget.maxToolCalls} exhausted after ${steps.length} step(s).`,
      );
    }
    if (estimatedCostUsd >= input.budget.maxEstimatedCostUsd) {
      return finish(
        'max_cost',
        `Estimated cost budget of $${input.budget.maxEstimatedCostUsd} reached after ${steps.length} step(s).`,
      );
    }

    let result: AgentStepResult;
    try {
      result = await input.step({
        index,
        history: steps,
        remaining: {
          steps: stepCeiling - index,
          toolCalls: Math.max(0, input.budget.maxToolCalls - toolCallsUsed),
          costUsd: Math.max(0, input.budget.maxEstimatedCostUsd - estimatedCostUsd),
          milliseconds: Math.max(0, input.budget.deadlineAt - clock()),
        },
      });
    } catch (error) {
      // A cancellation surfacing as a thrown error is still a cancellation, not a failure.
      if (input.signal?.aborted) {
        return finish('cancelled', `Cancelled during step ${index + 1}.`);
      }
      return finish('failed', `Step ${index + 1} failed: ${(error as Error)?.message ?? 'unknown error'}`);
    }

    toolCallsUsed += result.toolCalls ?? 0;
    estimatedCostUsd += result.estimatedCostUsd ?? 0;
    steps.push({
      index,
      phase: result.phase,
      summary: result.summary,
      toolCalls: result.toolCalls ?? 0,
      estimatedCostUsd: result.estimatedCostUsd ?? 0,
    });

    if (result.done) {
      return finish('completed', `Completed in ${steps.length} step(s).`);
    }

    // Two consecutive steps that achieve nothing is the shape of a model looping on itself.
    // Waiting for the step ceiling to catch it spends the entire budget confirming it.
    if (result.madeProgress === false) {
      consecutiveNoProgress += 1;
      if (consecutiveNoProgress >= 2) {
        return finish(
          'no_progress',
          `Two consecutive steps made no progress; stopped after ${steps.length} step(s) rather ` +
            'than spending the remaining budget confirming it.',
        );
      }
    } else {
      consecutiveNoProgress = 0;
    }
  }

  return finish(
    'max_steps',
    `Step budget of ${stepCeiling} exhausted without completing. Generation that stops at its ` +
      'step ceiling is not a success.',
  );
}
