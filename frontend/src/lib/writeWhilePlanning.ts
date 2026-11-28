/**
 * Write while planning: the answer starts at the same time as the plan, and the plan still decides
 * whether anyone sees it.
 *
 * The early request asks only for an ordinary read-only answer, with no repository, file, search or
 * action. It is shown only when the finished plan is exactly that. Otherwise it is dropped and the
 * turn continues as the plan says. A dropped answer has still been paid for.
 */
import type { Phase1ChatResult, SemanticRequestPlan } from './api';

type Goal = SemanticRequestPlan['goalContract'];
export type AnswerHandlers = {
  signal?: AbortSignal;
  onPartial?: (text: string) => void;
  onProgress?: (frame: Record<string, unknown>) => void;
};
export type RunAnswer = (body: Record<string, unknown>, options: AnswerHandlers) => Promise<Phase1ChatResult>;

/** A request that asks to search, or names a web address, would start a search before it was planned. */
const ASKS_FOR_THE_WEB = /https?:\/\/|www\.|\b(?:search|google|browse|look\s+(?:it\s+|this\s+)?up|on\s+the\s+web|online|sources?|cite|citations?)\b/i;

export function canWriteWhilePlanning(turn: {
  prompt: string;
  hasAttachments: boolean;
  hasProject: boolean;
  /** A build, a build update, a build clarification or a resumed run. */
  isBuildWork: boolean;
}): boolean {
  const prompt = turn.prompt.trim();
  return Boolean(prompt) && !prompt.startsWith('/') && !turn.hasAttachments && !turn.hasProject
    && !turn.isBuildWork && !ASKS_FOR_THE_WEB.test(prompt);
}

/** The plain read-only answer that most turns are planned as. It grants nothing beyond writing text. */
export function provisionalGoal(prompt: string) {
  const goal = prompt.trim();
  return {
    version: '1.0' as const,
    goal,
    desiredOutcome: 'A direct written answer.',
    semanticIntent: 'ANSWER' as const,
    requiredCapabilities: ['conversation.respond'],
    requiredAuthorities: ['model:execute'],
    confidence: 0.9,
    contextComplexity: 'medium' as const,
  };
}

/** True only when the finished plan is the same ordinary answer that was already being written. */
export function plannedAsPlainAnswer(plan: Pick<SemanticRequestPlan, 'dispatch' | 'goalContract' | 'directResponse' | 'blockers'>): boolean {
  const goal = plan.goalContract as Goal & Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return plan.dispatch === 'chat' && !plan.directResponse?.trim() && !list(plan.blockers).length
    && goal.semanticIntent === 'ANSWER'
    && list(goal.requiredCapabilities).length === 1 && list(goal.requiredCapabilities)[0] === 'conversation.respond'
    && (goal.freshnessRequirement ?? 'NONE') === 'NONE' && !goal.publicWebQuery
    && (goal.contextComplexity === 'low' || goal.contextComplexity === 'medium')
    && !list(goal.presentation).length && !goal.presentationIssue && !list(goal.deliverables).length
    && list(goal.answerObligations).every(item => list((item as { formats?: unknown }).formats).every(format => format === 'prose'));
}

export type EarlyAnswer = {
  /** Show what has been written so far, keep showing the rest, and return the checked answer. */
  adopt: (handlers: AnswerHandlers) => Promise<Phase1ChatResult>;
  /** Stop listening. Nothing from this request is shown. */
  discard: () => void;
  /** Resolves when the request is over, however it ended. */
  settled: Promise<void>;
};

export function startEarlyAnswer(body: Record<string, unknown>, signal: AbortSignal, run: RunAnswer): EarlyAnswer {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });
  let live: AnswerHandlers | undefined;
  let latest: string | undefined;
  const progress: Record<string, unknown>[] = [];
  const answer = Promise.resolve().then(() => run(body, {
    signal: controller.signal,
    onPartial: (text) => {
      if (live) live.onPartial?.(text);
      else latest = text;
    },
    onProgress: (frame) => {
      if (live) live.onProgress?.(frame);
      else progress.push(frame);
    },
  }));
  const settled = answer.then(() => undefined, () => undefined)
    .finally(() => signal.removeEventListener('abort', stop));
  return {
    adopt: (handlers) => {
      live = handlers;
      for (const frame of progress.splice(0)) handlers.onProgress?.(frame);
      if (latest !== undefined) handlers.onPartial?.(latest);
      return answer;
    },
    discard: stop,
    settled,
  };
}
